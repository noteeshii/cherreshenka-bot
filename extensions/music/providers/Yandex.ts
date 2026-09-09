import { createHash } from 'node:crypto';

import type { Config } from '#extensions';
import type { RawTrack } from '../types.ts';

import type { Provider } from '../types.ts';

const API_URL = 'https://api.music.yandex.net';
const REQUEST_TIMEOUT_MS = 20_000;
const AUDIO_SIGN_SALT = 'XGRlBW9FXlekgbPrRHuSiA';

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

export default class YandexMusicClient implements Provider {
  private readonly token: string;
  private readonly request: typeof fetch;
  private accountId: string | undefined;

  constructor(config: Config['music'], request: typeof fetch = fetch) {
    this.request = request;
    this.token = config.yandexMusicToken;
  }

  public async resolve(input: string, signal: AbortSignal): Promise<RawTrack> {
    const track = await this.getMetadata(input, signal);
    const format = await this.getAudioFormat(track.id, signal);
    const audioUrl = await this.getAudioUrl(format, signal);
    return { title: track.title, url: audioUrl };
  }

  /** Add a track to the account's "Liked tracks" collection. */
  public async likeTrack(input: string, signal = new AbortController().signal): Promise<void> {
    await this.setTrackPreference('likes', input, signal);
  }

  /** Mark a track as "Do not recommend" for the account. */
  public async dislikeTrack(input: string, signal = new AbortController().signal): Promise<void> {
    await this.setTrackPreference('dislikes', input, signal);
  }

  private async requestJson(
    url: URL,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
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

  private async requestApi(
    path: string,
    signal: AbortSignal,
    body?: URLSearchParams,
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `OAuth ${this.token}`;
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const data = object(
      await this.requestJson(new URL(`${API_URL}${path}`), signal, {
        method: body ? 'POST' : 'GET',
        headers,
        body,
      }),
    );
    if (data.error)
      throw new Error('Яндекс Музыка отклонила запрос. Проверьте токен и доступ к треку.');
    return data.result;
  }

  private async setTrackPreference(
    preference: 'likes' | 'dislikes',
    input: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.token) {
      throw new Error('Яндекс Музыка: для оценки трека задайте YANDEX_MUSIC_TOKEN.');
    }

    const accountId = await this.getAccountId(signal);
    const trackId = this.getTrackId(input);
    await this.requestApi(
      `/users/${encodeURIComponent(accountId)}/${preference}/tracks/add-multiple`,
      signal,
      new URLSearchParams({ 'track-ids': trackId }),
    );
  }

  private async getAccountId(signal: AbortSignal): Promise<string> {
    if (this.accountId) return this.accountId;

    const result = object(await this.requestApi('/account/status', signal));
    const account = object(result.account);
    if (typeof account.uid !== 'number' && typeof account.uid !== 'string') {
      throw new Error('Яндекс Музыка: не удалось получить ID аккаунта из токена.');
    }

    this.accountId = String(account.uid);
    return this.accountId;
  }

  private getTrackId(input: string): string {
    if (/^\d+$/.test(input.trim())) return input.trim();

    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error('Яндекс Музыка: укажите ID или ссылку на трек.');
    }
    const match = /^\/album\/\d+\/track\/(\d+)\/?$/.exec(url.pathname);
    if (!match || !/^music\.yandex\.(ru|com|kz|by|ua)$/.test(url.hostname)) {
      throw new Error('Яндекс Музыка: укажите ссылку на трек или его числовой ID.');
    }
    return match[1];
  }

  private parseTrackId(url: string) {
    const parts = new URL(url).pathname.split('/');

    return { url: url, id: `${parts[4]}:${parts[2]}` };
  }

  private async getMetadata(input: string, signal: AbortSignal) {
    const { url, id } = this.parseTrackId(input);
    const result = await this.requestApi(
      '/tracks',
      signal,
      new URLSearchParams({ 'track-ids': id }),
    );
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

  private async getAudioFormat(trackId: string, signal: AbortSignal): Promise<JsonObject> {
    const result = await this.requestApi(`/tracks/${trackId}/download-info`, signal);
    if (!Array.isArray(result)) {
      throw new Error('Яндекс Музыка: нет вариантов аудио.');
    }

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
    if (!format) {
      throw new Error(
        'Яндекс Музыка: полное MP3-аудио недоступно. Задайте YANDEX_MUSIC_TOKEN аккаунта с доступом к треку; предпросмотр не воспроизводится.',
      );
    }
    return format;
  }

  private async getAudioUrl(format: JsonObject, signal: AbortSignal): Promise<string> {
    const location = serviceUrl(String(format.downloadInfoUrl));
    if (format.direct === true) return location.href;

    location.searchParams.set('format', 'json');
    // Storage requests must not carry the account's OAuth token.
    const data = object(await this.requestJson(location, signal));
    return this.buildSignedAudioUrl(data);
  }

  private buildSignedAudioUrl(data: JsonObject): string {
    const { host, path, ts, s } = data;
    if (
      typeof host !== 'string' ||
      !/^[a-z0-9.-]+$/i.test(host) ||
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      typeof ts !== 'string' ||
      !/^[0-9a-f]+$/i.test(ts) ||
      typeof s !== 'string'
    ) {
      throw new Error('Яндекс Музыка: некорректные данные аудиоссылки.');
    }

    const sign = createHash('md5')
      .update(AUDIO_SIGN_SALT + path.slice(1) + s)
      .digest('hex');
    // The hexadecimal timestamp must retain its leading zeroes.
    return serviceUrl(`https://${host}/get-mp3/${sign}/${ts}${path}`).href;
  }
}
