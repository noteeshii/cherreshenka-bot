import { test } from 'node:test';
import assert from 'node:assert/strict';
import TrackResolver from '#extensions/music/TrackResolver.ts';
import Track from '#extensions/music/Track.ts';
import YouTube from '#extensions/music/providers/YouTube.ts';
import Yandex from '#extensions/music/providers/Yandex.ts';
import { testConfig } from './fixtures.ts';

const yandex = 'https://music.yandex.ru/album/540508/track/4878838';
const youtube = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

test('TrackResolver нормализует ссылки и выбирает провайдера', async (t) => {
  const resolver = new TrackResolver(testConfig());
  const youtubeMock = t.mock.method(YouTube.prototype, 'resolve', async (url: string) => ({
    title: 'Video',
    url,
  }));
  const yandexMock = t.mock.method(Yandex.prototype, 'resolve', async (url: string) => ({
    title: 'Song',
    url,
  }));
  for (const domain of ['ru', 'com', 'kz', 'by', 'ua']) {
    const url = yandex.replace('.ru', `.${domain}`);
    const track = await resolver.fromUrl(url + '/?utm_source=share#track');
    assert.ok(track instanceof Track);
    assert.equal(track.url, url);
    assert.equal(track.title, 'Song');
  }
  assert.equal(youtubeMock.mock.callCount(), 0);
  assert.equal(yandexMock.mock.callCount(), 5);
  for (const url of [
    'https://youtu.be/dQw4w9WgXcQ?t=10',
    youtube + '&list=PL123',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  ]) {
    assert.equal((await resolver.fromUrl(url)).url, youtube);
  }
  assert.equal(youtubeMock.mock.callCount(), 3);
});

test('альбомы, плейлисты и посторонние адреса отклоняются до обращения к провайдерам', async (t) => {
  const unexpected = async () => {
    throw new Error('Unexpected provider call');
  };
  const yt = t.mock.method(YouTube.prototype, 'resolve', unexpected);
  const ya = t.mock.method(Yandex.prototype, 'resolve', unexpected);
  const resolver = new TrackResolver(testConfig());
  for (const url of [
    'https://music.yandex.ru/album/540508',
    'https://music.yandex.ru/users/user/playlists/1',
    'https://music.yandex.ru/album/1/track/2/other',
    'https://music.yandex.ru/album/abc/track/2',
    'https://music.yandex.ru.evil.test/album/1/track/2',
    'https://evil.test/album/1/track/2',
    'https://user:pass@music.yandex.ru/album/1/track/2',
    'file:///album/1/track/2',
    'https://youtube.com/playlist?list=PL123',
    'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
    'hello',
  ])
    await assert.rejects(resolver.fromUrl(url));
  assert.equal(yt.mock.callCount(), 0);
  assert.equal(ya.mock.callCount(), 0);
});

test('YouTube передаёт параметры извлечения и возвращает аудиоссылку', async () => {
  const signal = new AbortController().signal;
  const provider = new YouTube(testConfig().music, async (binary, args, options) => {
    assert.equal(binary, 'yt-dlp');
    assert.equal(args[args.indexOf('--format') + 1], 'bestaudio');
    assert.equal(args.at(-1), youtube);
    assert.equal(options.signal, signal);
    return {
      stdout: JSON.stringify({ title: 'Video', url: 'https://cdn.example/audio' }),
      stderr: '',
    };
  });
  assert.deepEqual(await provider.resolve(youtube, signal), {
    title: 'Video',
    url: 'https://cdn.example/audio',
  });
});

test('YouTube отклоняет небезопасные потоки, трансляции и некорректные метаданные', async () => {
  for (const info of [
    { title: 'Video', url: 'http://cdn.example/audio' },
    { title: 'Video', url: 'https://cdn.example/audio', is_live: true },
    { title: 'Video', url: 'https://cdn.example/audio', live_status: 'is_upcoming' },
    { title: 'Video', url: 'https://cdn.example/audio', _type: 'playlist' },
    { title: 'Video' },
  ]) {
    const provider = new YouTube(testConfig().music, async () => ({
      stdout: JSON.stringify(info),
      stderr: '',
    }));
    await assert.rejects(provider.resolve(youtube, new AbortController().signal));
  }
});

test('ошибки экстрактора не заменяются фиктивными треками', async () => {
  const provider = new YouTube(testConfig().music, async () => {
    throw new Error('Authentication required');
  });
  await assert.rejects(
    provider.resolve(youtube, new AbortController().signal),
    /Authentication required/,
  );
});
