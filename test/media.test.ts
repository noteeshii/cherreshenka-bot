import { test } from 'node:test';
import assert from 'node:assert/strict';
import { musicSource } from '../src/music/source.ts';
import { createMusicResolver, createMusicTitleResolver } from '../src/music/media.ts';

const yandex = 'https://music.yandex.ru/album/540508/track/4878838';
const youtube = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

test('ссылка Яндекс Музыки нормализуется и сохраняет региональный домен', () => {
  for (const domain of ['ru', 'com', 'kz', 'by', 'ua']) {
    const url = yandex.replace('.ru', `.${domain}`);
    assert.deepEqual(musicSource(url + '/?utm_source=share#track'), { provider: 'yandex', url });
  }
  assert.deepEqual(musicSource('https://youtu.be/dQw4w9WgXcQ'), {
    provider: 'youtube',
    url: youtube,
  });
});

test('альбомы, плейлисты и посторонние адреса отклоняются', () => {
  for (const url of [
    'https://music.yandex.ru/album/540508',
    'https://music.yandex.ru/users/user/playlists/1',
    'https://music.yandex.ru/album/1/track/2/other',
    'https://music.yandex.ru/album/abc/track/2',
    'https://music.yandex.ru.evil.test/album/1/track/2',
    'https://evil.test/album/1/track/2',
    'https://user:pass@music.yandex.ru/album/1/track/2',
    'file:///album/1/track/2',
  ])
    assert.throws(() => musicSource(url));
});

test('Яндекс использует отдельный API, не вызывая yt-dlp', async () => {
  const api = {
    resolve: async (url: string) => ({
      title: 'Artist - Song',
      url,
      audioUrl: 'https://cdn.yandex.net/audio',
    }),
    title: async () => 'Artist - Song',
  };
  const extract = async () => {
    throw new Error('yt-dlp не должен вызываться');
  };
  const track = await createMusicResolver(
    'yt-dlp',
    extract,
    api,
  )(yandex, new AbortController().signal);
  assert.equal(track.title, 'Artist - Song');
  assert.equal(
    await createMusicTitleResolver('yt-dlp', extract, api)(yandex, new AbortController().signal),
    'Artist - Song',
  );
});

test('YouTube сохраняет выбор bestaudio и требование HTTPS', async () => {
  const resolve = createMusicResolver('yt-dlp', async (_binary, args) => {
    assert.equal(args[args.indexOf('--format') + 1], 'bestaudio');
    return { stdout: JSON.stringify({ title: 'Video', url: 'http://cdn.example/audio' }) };
  });
  await assert.rejects(resolve(youtube, new AbortController().signal), /Неподдерживаемый/);
});

test('ошибки экстрактора не заменяются фиктивными треками', async () => {
  const resolve = createMusicResolver('yt-dlp', async () => {
    throw new Error('Authentication required');
  });
  await assert.rejects(resolve(youtube, new AbortController().signal), /Authentication required/);
});
