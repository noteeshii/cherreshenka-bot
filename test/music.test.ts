import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { queueMessages } from '../src/music/queue-messages.ts';
import { MusicQueue } from '../src/music/queue.ts';
import type { AudioPlayer } from '../src/music/queue.ts';
import { youtubeUrl } from '../src/music/youtube.ts';
import type { Track } from '../src/music/media.ts';

const first = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const second = 'https://www.youtube.com/watch?v=abcdefghijk';

function setup(
  resolve = async (url: string): Promise<Track> => ({ title: url, url, audioUrl: url }),
  titleResolver?: (url: string, signal: AbortSignal) => Promise<string>,
) {
  const played: string[] = [];
  const pauses: boolean[] = [];
  const volumes: number[] = [];
  const errors: unknown[] = [];
  let finish = () => {};
  const player: AudioPlayer = {
    play: (track, signal) =>
      new Promise<void>((done) => {
        played.push(track.url);
        finish = () => {
          signal.removeEventListener('abort', finish);
          done();
        };
        signal.addEventListener('abort', finish, { once: true });
      }),
    setVolume: async (volume) => {
      volumes.push(volume);
    },
    setPaused: async (paused) => {
      pauses.push(paused);
    },
    close: async () => {},
  };
  const queue = new MusicQueue(player, resolve, (error) => errors.push(error), titleResolver);
  return { queue, played, pauses, volumes, errors, finish: () => finish() };
}

test('YouTube URL нормализуется, плейлисты и посторонние адреса отклоняются', () => {
  assert.equal(youtubeUrl('https://youtu.be/dQw4w9WgXcQ?t=10'), first);
  assert.equal(youtubeUrl(first + '&list=PL123'), first);
  assert.equal(youtubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), first);
  for (const url of [
    'file:///etc/passwd',
    'https://evil.test/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/playlist?list=PL123',
    'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
    'hello',
  ]) {
    assert.throws(() => youtubeUrl(url));
  }
});

test('FIFO: следующий трек запускается только после завершения текущего', async () => {
  const { queue, played, finish } = setup();
  queue.enqueue(first);
  queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(played, [first]);
  assert.equal(queue.current?.url, first);
  finish();
  await setImmediate();
  assert.deepEqual(played, [first, second]);
  finish();
  await setImmediate();
  assert.equal(queue.current, undefined);
  queue.enqueue(first);
  await setImmediate();
  assert.equal(played.length, 3);
  await queue.close();
});

test('пауза, продолжение и пропуск текущего трека', async () => {
  const { queue, played, pauses } = setup();
  queue.enqueue(first);
  queue.enqueue(second);
  await setImmediate();
  await queue.pause();
  await queue.resume();
  assert.deepEqual(pauses, [true, false]);
  await queue.skip();
  await setImmediate();
  assert.deepEqual(played, [first, second]);
  await queue.close();
  assert.equal(queue.current, undefined);
});

test('недоступный ролик не останавливает очередь', async () => {
  const { queue, played, errors } = setup(async (url) => {
    if (url === first) throw new Error('unavailable');
    return { title: url, url, audioUrl: url };
  });
  queue.enqueue(first);
  queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(played, [second]);
  assert.equal(errors.length, 1);
  await queue.close();
});

test('пропуск во время получения метаданных не запускает пропущенный трек', async () => {
  let resolveFirst: (track: Track) => void = () => {};
  const { queue, played } = setup((url) =>
    url === first
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : Promise.resolve({ title: url, url, audioUrl: url }),
  );
  queue.enqueue(first);
  queue.enqueue(second);
  await queue.skip();
  resolveFirst({ title: 'first', url: first, audioUrl: first });
  await setImmediate();
  assert.deepEqual(played, [second]);
  await queue.close();
});

test('завершение очищает очередь и запрещает новые заказы', async () => {
  const { queue, played } = setup();
  queue.enqueue(first);
  queue.enqueue(second);
  await setImmediate();
  await queue.close();
  assert.deepEqual(played, [first]);
  assert.throws(() => queue.enqueue(first));
});

test('громкость передаётся плееру до запуска и во время трека', async () => {
  const { queue, volumes } = setup();
  await queue.setVolume(25);
  queue.enqueue(first);
  await setImmediate();
  await queue.setVolume(75);
  assert.deepEqual(volumes, [25, 75]);
  await queue.close();
});

test('список очереди исключает текущий трек и обновляется после пропуска', async () => {
  const { queue } = setup();
  queue.enqueue(first);
  queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(
    queue.queuedTracks.map((track) => track.url),
    [second],
  );
  await queue.skip();
  await setImmediate();
  assert.deepEqual(queue.queuedTracks, []);
  await queue.close();
});

test('названия ожидающих треков загружаются без остановки воспроизведения', async () => {
  const { queue, played } = setup(undefined, async () => 'Queued song');
  queue.enqueue(first);
  queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(played, [first]);
  assert.deepEqual(queue.queuedTracks, [{ url: second, title: 'Queued song' }]);
  await queue.close();
});

test('ошибка загрузки названия оставляет ссылку и не удаляет заказ', async () => {
  const { queue } = setup(undefined, async () => {
    throw new Error('unavailable');
  });
  queue.enqueue(first);
  queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(queueMessages(queue.queuedTracks), [`Очередь: 1. ${second}`]);
  await queue.close();
});

test('длинная очередь разбивается без потери позиций и превышения 500 символов', () => {
  const tracks = Array.from({ length: 100 }, (_, index) => ({
    url: String(index),
    title: '🍒'.repeat(200),
  }));
  const messages = queueMessages(tracks);
  assert.ok(messages.length > 1);
  assert.ok(messages.every((message) => [...message].length <= 500));
  const positions = [...messages.join(' | ').matchAll(/(\d+)\. /g)].map((match) =>
    Number(match[1]),
  );
  assert.deepEqual(
    positions,
    Array.from({ length: 100 }, (_, index) => index + 1),
  );
});

test('YouTube и Яндекс Музыка воспроизводятся в общей очереди', async () => {
  const yandex = 'https://music.yandex.ru/album/540508/track/4878838';
  const { queue, played, finish } = setup();
  queue.enqueue(first);
  queue.enqueue(yandex);
  queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(
    queue.queuedTracks.map((track) => track.url),
    [yandex, second],
  );
  finish();
  await setImmediate();
  assert.deepEqual(played, [first, yandex]);
  await queue.skip();
  await setImmediate();
  assert.deepEqual(played, [first, yandex, second]);
  await queue.close();
});
