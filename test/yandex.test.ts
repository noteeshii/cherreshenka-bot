import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createYandexMusic } from '../src/music/yandex.ts';

const url = 'https://music.yandex.ru/album/7251786/track/44252390';
const metadata = {
  result: [{ id: '44252390', title: 'Song', available: true, artists: [{ name: 'Artist' }] }],
};
const format = {
  codec: 'mp3',
  preview: false,
  bitrateInKbps: 192,
  direct: false,
  downloadInfoUrl: 'https://storage.mds.yandex.net/file-download-info/test',
};

function mock(responses: unknown[], status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const request: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const body = responses.shift();
    assert.notEqual(body, undefined, 'unexpected request');
    return Response.json(body, { status });
  };
  return { request, calls };
}

test('полный трек: метаданные, download-info и подписанный HTTPS URL', async () => {
  const { request, calls } = mock([
    metadata,
    { result: [format] },
    { host: 'cdn.yandex.net', path: '/audio.mp3', ts: '123', s: 'salt' },
  ]);
  const track = await createYandexMusic('test-token', request).resolve(
    url,
    new AbortController().signal,
  );
  const sign = createHash('md5').update('XGRlBW9FXlekgbPrRHuSiAaudio.mp3salt').digest('hex');
  assert.equal(track.title, 'Artist - Song');
  assert.equal(track.audioUrl, `https://cdn.yandex.net/get-mp3/${sign}/123/audio.mp3`);
  assert.equal(calls[0]?.url, 'https://api.music.yandex.net/tracks');
  assert.equal(String(calls[0]?.init?.body), 'track-ids=44252390%3A7251786');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'OAuth test-token');
  assert.equal(new Headers(calls[2]?.init?.headers).get('Authorization'), null);
  assert.equal(calls[2]?.init?.redirect, 'error');
});

test('preview не выдаётся за полный трек', async () => {
  const { request } = mock([metadata, { result: [{ ...format, preview: true }] }]);
  await assert.rejects(
    createYandexMusic('', request).resolve(url, new AbortController().signal),
    /предпросмотр/,
  );
});

test('HTTP 404 и отказ авторизации дают понятную ошибку', async () => {
  for (const [status, message] of [
    [404, /HTTP 404/],
    [403, /YANDEX_MUSIC_TOKEN/],
  ] as const) {
    const { request } = mock([{}], status);
    await assert.rejects(
      createYandexMusic('secret', request).title(url, new AbortController().signal),
      message,
    );
  }
});

test('получение названия не запрашивает аудио', async () => {
  const { request, calls } = mock([metadata]);
  assert.equal(
    await createYandexMusic('', request).title(url, new AbortController().signal),
    'Artist - Song',
  );
  assert.equal(calls.length, 1);
});

test('посторонний адрес download-info отклоняется до сетевого запроса', async () => {
  const { request, calls } = mock([
    metadata,
    { result: [{ ...format, downloadInfoUrl: 'https://evil.test/audio' }] },
  ]);
  await assert.rejects(
    createYandexMusic('secret', request).resolve(url, new AbortController().signal),
    /адрес аудио/,
  );
  assert.equal(calls.length, 2);
});

test('некорректный результат сервиса не вызывает TypeError', async () => {
  const { request } = mock([false]);
  await assert.rejects(
    createYandexMusic('', request).title(url, new AbortController().signal),
    /некорректный ответ/,
  );
});

test('hex timestamp Яндекса сохраняется вместе с ведущими нулями', async () => {
  const timestamp = '00065ae7388a63cc';
  const { request } = mock([
    metadata,
    { result: [format] },
    { host: 'cdn.yandex.net', path: '/audio.mp3', ts: timestamp, s: 'salt' },
  ]);
  const track = await createYandexMusic('test-token', request).resolve(
    url,
    new AbortController().signal,
  );
  const sign = createHash('md5').update('XGRlBW9FXlekgbPrRHuSiAaudio.mp3salt').digest('hex');
  assert.equal(track.audioUrl, `https://cdn.yandex.net/get-mp3/${sign}/${timestamp}/audio.mp3`);
});

test('некорректные timestamp не принимаются как части URL', async () => {
  for (const timestamp of ['', '12/../34', '12?query=1', 'xyz', null, 123]) {
    const { request } = mock([
      metadata,
      { result: [format] },
      { host: 'cdn.yandex.net', path: '/audio.mp3', ts: timestamp, s: 'salt' },
    ]);
    await assert.rejects(
      createYandexMusic('', request).resolve(url, new AbortController().signal),
      /некорректные данные аудиоссылки/,
    );
  }
});
