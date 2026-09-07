import { createHash } from 'node:crypto';
import { musicSource } from './source.ts';
import type { Track } from './media.ts';

export interface YandexMusic {
  resolve(url: string, signal: AbortSignal): Promise<Track>;
  title(url: string, signal: AbortSignal): Promise<string>;
}

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Яндекс Музыка: некорректный ответ сервиса.');
  }
  return value as JsonObject;
}

function serviceUrl(value: string): URL {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !['yandex.net', 'yandex.ru'].some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    )
  ) {
    throw new Error('Яндекс Музыка: неподдерживаемый адрес аудио.');
  }
  url.protocol = 'https:';
  return url;
}

export function createYandexMusic(token = '', request: typeof fetch = fetch): YandexMusic {
  async function json(url: URL, signal: AbortSignal, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await request(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      });
    } catch {
      signal.throwIfAborted();
      throw new Error('Яндекс Музыка: запрос не выполнен. Проверьте доступ к сервису и сеть.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Яндекс Музыка: доступ запрещён. Проверьте YANDEX_MUSIC_TOKEN, подписку и доступность трека в вашем регионе.',
      );
    }
    if (response.status === 404)
      throw new Error('Яндекс Музыка: трек или ресурс не найден (HTTP 404).');
    if (!response.ok) throw new Error(`Яндекс Музыка: HTTP ${response.status}.`);
    try {
      return await response.json();
    } catch {
      throw new Error('Яндекс Музыка: сервер вернул некорректный JSON.');
    }
  }

  async function api(path: string, signal: AbortSignal, body?: URLSearchParams): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `OAuth ${token}`;
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const data = object(
      await json(new URL(`https://api.music.yandex.net${path}`), signal, {
        method: body ? 'POST' : 'GET',
        headers,
        body,
      }),
    );
    if (data.error)
      throw new Error('Яндекс Музыка отклонила запрос. Проверьте токен и доступ к треку.');
    return data.result;
  }

  function trackId(input: string) {
    const source = musicSource(input);
    if (source.provider !== 'yandex') throw new Error('Ожидалась ссылка на Яндекс Музыку.');
    const parts = new URL(source.url).pathname.split('/');
    return { url: source.url, id: `${parts[4]}:${parts[2]}` };
  }

  async function metadata(input: string, signal: AbortSignal) {
    const { url, id } = trackId(input);
    const result = await api('/tracks', signal, new URLSearchParams({ 'track-ids': id }));
    if (!Array.isArray(result) || !result.length) throw new Error('Яндекс Музыка: трек не найден.');
    const track = object(result[0]);
    if (track.available === false)
      throw new Error('Яндекс Музыка: трек недоступен этому аккаунту или в регионе.');
    if (typeof track.title !== 'string' || !track.title.trim())
      throw new Error('Яндекс Музыка: отсутствует название трека.');
    const artists = Array.isArray(track.artists)
      ? track.artists
          .map((artist) => object(artist).name)
          .filter((name) => typeof name === 'string')
          .join(', ')
      : '';
    const version = typeof track.version === 'string' ? ` (${track.version})` : '';
    const title = `${artists ? `${artists} - ` : ''}${track.title}${version}`;
    return { url, id, title };
  }

  return {
    async title(input, signal) {
      return (await metadata(input, signal)).title;
    },
    async resolve(input, signal) {
      const track = await metadata(input, signal);
      const result = await api(`/tracks/${track.id}/download-info`, signal);
      if (!Array.isArray(result)) throw new Error('Яндекс Музыка: нет вариантов аудио.');
      const formats = result
        .map(object)
        .filter(
          (format) =>
            format.codec === 'mp3' &&
            format.preview === false &&
            typeof format.downloadInfoUrl === 'string',
        );
      formats.sort((a, b) => Number(b.bitrateInKbps || 0) - Number(a.bitrateInKbps || 0));
      const format = formats[0];
      if (!format)
        throw new Error(
          'Яндекс Музыка: полное MP3-аудио недоступно. Задайте YANDEX_MUSIC_TOKEN аккаунта с доступом к треку; предпросмотр не воспроизводится.',
        );
      const location = serviceUrl(String(format.downloadInfoUrl));
      let audioUrl: string;
      if (format.direct === true) {
        audioUrl = location.href;
      } else {
        location.searchParams.set('format', 'json');
        // Never send the account token to the storage/CDN endpoint.
        const data = object(await json(location, signal));
        const { host, path, ts, s } = data;
        if (
          typeof host !== 'string' ||
          !/^[a-z0-9.-]+$/i.test(host) ||
          typeof path !== 'string' ||
          !path.startsWith('/') ||
          typeof ts !== 'string' ||
          !/^\d+$/.test(ts) ||
          typeof s !== 'string'
        ) {
          throw new Error('Яндекс Музыка: некорректные данные аудиоссылки.');
        }
        const sign = createHash('md5')
          .update('XGRlBW9FXlekgbPrRHuSiA' + path.slice(1) + s)
          .digest('hex');
        audioUrl = serviceUrl(`https://${host}/get-mp3/${sign}/${ts}${path}`).href;
      }
      return { title: track.title, url: track.url, audioUrl };
    },
  };
}
