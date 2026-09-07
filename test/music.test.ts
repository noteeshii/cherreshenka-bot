import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { MusicQueue } from '../src/music/queue.ts';
import type { AudioPlayer } from '../src/music/queue.ts';
import { youtubeUrl } from '../src/music/youtube.ts';
import type { Track } from '../src/music/youtube.ts';

const first = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const second = 'https://www.youtube.com/watch?v=abcdefghijk';

function setup(
  resolve = async (url: string): Promise<Track> => ({ title: url, url, audioUrl: url }),
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
  const queue = new MusicQueue(player, resolve, (error) => errors.push(error));
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
