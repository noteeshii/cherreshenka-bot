import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import Music from '#extensions/music/index.ts';
import Player from '#extensions/music/Player.ts';
import TrackResolver from '#extensions/music/TrackResolver.ts';
import Track from '#extensions/music/Track.ts';
import { testConfig } from './fixtures.ts';

const first = new Track(
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'first-t',
  'first-u',
  'first-w',
  'first-e',
  'youtube',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
);
const second = new Track(
  'https://www.youtube.com/watch?v=abcdefghijk',
  'second-t',
  'second-u',
  'second-w',
  'second-e',
  'youtube',
  'https://www.youtube.com/watch?v=abcdefghijk',
);

function setup(
  t: TestContext,
  resolve = async (props: Parameters<TrackResolver['fromProps']>[0]): Promise<Track> =>
    props as Track,
) {
  const played: string[] = [];
  const pauses: boolean[] = [];
  const volumes: number[] = [];
  const errors: unknown[] = [];
  let finish = () => {};
  t.mock.method(TrackResolver.prototype, 'fromProps', resolve);
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
  const queue = new Music(testConfig(), { error: (error: string) => errors.push(error) } as any);
  t.after(() => queue.close());
  return { queue, played, pauses, volumes, errors, finish: () => finish() };
}

test('FIFO: следующий трек запускается только после завершения текущего', async (t) => {
  const { queue, played, finish } = setup(t);
  await queue.enqueue(first);
  await queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(played, [first.url]);
  assert.equal(queue.current?.url, first.url);
  finish();
  await setImmediate();
  assert.deepEqual(played, [first.url, second.url]);
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
  assert.deepEqual(played, [first.url, second.url]);
  await queue.close();
  assert.equal(queue.current, undefined);
});

test('недоступный ролик не останавливает очередь', async (t) => {
  const { queue, played, errors } = setup(t, async (props) => {
    if (props.url === first.url) throw new Error('unavailable');
    return props as Track;
  });
  await assert.rejects(queue.enqueue(first), /unavailable/);
  await queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(played, [second.url]);
  assert.equal(errors.length, 0);
  await queue.close();
});

test('завершение очищает очередь и запрещает новые заказы', async (t) => {
  const { queue, played } = setup(t);
  await queue.enqueue(first);
  await queue.enqueue(second);
  await setImmediate();
  await queue.close();
  assert.deepEqual(played, [first.url]);
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
    [second.title],
  );
  await queue.skip();
  await setImmediate();
  assert.deepEqual(queue.queuedTracks, []);
  await queue.close();
});

test('YouTube и Яндекс Музыка воспроизводятся в общей очереди', async (t) => {
  const yandex = new Track(
    'https://music.yandex.ru/album/540508/track/4878838',
    'yandex-t',
    'yandex-u',
    'yandex-w',
    'yandex-e',
    'yandex',
    'https://music.yandex.ru/album/540508/track/4878838',
  );
  const { queue, played, finish } = setup(t);
  await queue.enqueue(first);
  await queue.enqueue(yandex);
  await queue.enqueue(second);
  await setImmediate();
  assert.deepEqual(
    queue.queuedTracks.map((track) => track.title),
    [yandex.title, second.title],
  );
  finish();
  await setImmediate();
  assert.deepEqual(played, [first.url, yandex.url]);
  await queue.skip();
  await setImmediate();
  assert.deepEqual(played, [first.url, yandex.url, second.url]);
  await queue.close();
});

test('ошибка воспроизведения сообщается и не останавливает следующие треки', async (t) => {
  const { queue, played, errors } = setup(t);
  const failure = new Error('Playback failed');

  t.mock.method(Player.prototype, 'play', async (track: Track) => {
    played.push(track.url);
    if (track.url === first.url) throw failure;
  });

  await queue.enqueue(first);
  await queue.enqueue(second);
  await setImmediate();

  assert.deepEqual(played, [first.url, second.url]);
  assert.deepEqual(errors, [String(failure)]);
  assert.equal(queue.current, undefined);
});
