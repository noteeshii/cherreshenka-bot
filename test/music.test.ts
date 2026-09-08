import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import Music from '#extensions/music/index.ts';
import Player from '#extensions/music/Player.ts';
import TrackResolver from '#extensions/music/TrackResolver.ts';
import Track from '#extensions/music/Track.ts';
import { testConfig } from './fixtures.ts';

const first = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const second = 'https://www.youtube.com/watch?v=abcdefghijk';

function setup(
  t: TestContext,
  resolve = async (url: string): Promise<Track> => new Track(url, url),
) {
  const played: string[] = [];
  const pauses: boolean[] = [];
  const volumes: number[] = [];
  const errors: unknown[] = [];
  let finish = () => {};
  t.mock.method(TrackResolver.prototype, 'fromUrl', resolve);
  t.mock.method(
    Player.prototype,
    'play',
    (track: Track, signal: AbortSignal) =>
      new Promise<void>((done) => {
        played.push(track.url);
        const complete = () => {
          signal.removeEventListener('abort', complete);
          done();
        };
        finish = complete;
        signal.addEventListener('abort', complete, { once: true });
      }),
  );
  t.mock.method(Player.prototype, 'setPaused', async (paused: boolean) => {
    pauses.push(paused);
  });
  t.mock.method(Player.prototype, 'setVolume', async (volume: number) => {
    volumes.push(volume);
  });
  t.mock.method(Player.prototype, 'close', async () => {});
  const queue = new Music(testConfig(), (error) => errors.push(error));
  t.after(() => queue.close());
  return { queue, played, pauses, volumes, errors, finish: () => finish() };
}

test('FIFO: следующий трек запускается только после завершения текущего', async (t) => {
  const { queue, played, finish } = setup(t);
  await queue.enqueue(first);
  await queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(played, [first]);
  assert.equal(queue.current?.url, first);
  finish();
  await setImmediate();
  assert.deepEqual(played, [first, second]);
  finish();
  await setImmediate();
  assert.equal(queue.current, undefined);
  await queue.enqueue(first);
  await setImmediate();
  assert.equal(played.length, 3);
  await queue.close();
});

test('пауза, продолжение и пропуск текущего трека', async (t) => {
  const { queue, played, pauses } = setup(t);
  await queue.enqueue(first);
  await queue.enqueue(second);
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

test('недоступный ролик не останавливает очередь', async (t) => {
  const { queue, played, errors } = setup(t, async (url) => {
    if (url === first) throw new Error('unavailable');
    return new Track(url, url);
  });
  await assert.rejects(queue.enqueue(first), /unavailable/);
  await queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(played, [second]);
  assert.equal(errors.length, 0);
  await queue.close();
});

test('завершение очищает очередь и запрещает новые заказы', async (t) => {
  const { queue, played } = setup(t);
  await queue.enqueue(first);
  await queue.enqueue(second);
  await setImmediate();
  await queue.close();
  assert.deepEqual(played, [first]);
  await assert.rejects(queue.enqueue(first));
});

test('громкость передаётся плееру до запуска и во время трека', async (t) => {
  const { queue, volumes } = setup(t);
  await queue.setVolume(25);
  await queue.enqueue(first);
  await setImmediate();
  await queue.setVolume(75);
  assert.deepEqual(volumes, [25, 75]);
  await queue.close();
});

test('список очереди исключает текущий трек и обновляется после пропуска', async (t) => {
  const { queue } = setup(t);
  await queue.enqueue(first);
  await queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(
    queue.queuedTracks.map((track) => track.title),
    [second],
  );
  await queue.skip();
  await setImmediate();
  assert.deepEqual(queue.queuedTracks, []);
  await queue.close();
});

test('YouTube и Яндекс Музыка воспроизводятся в общей очереди', async (t) => {
  const yandex = 'https://music.yandex.ru/album/540508/track/4878838';
  const { queue, played, finish } = setup(t);
  await queue.enqueue(first);
  await queue.enqueue(yandex);
  await queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(
    queue.queuedTracks.map((track) => track.title),
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

test('ошибка воспроизведения сообщается и не останавливает следующие треки', async (t) => {
  const { queue, played, errors } = setup(t);
  const failure = new Error('Playback failed');
  t.mock.method(Player.prototype, 'play', async (track: Track) => {
    played.push(track.url);
    if (track.url === first) throw failure;
  });
  await queue.enqueue(first);
  await queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(played, [first, second]);
  assert.deepEqual(errors, [failure]);
  assert.equal(queue.current, undefined);
});
