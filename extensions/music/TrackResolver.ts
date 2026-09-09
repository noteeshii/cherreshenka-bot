import type { Config } from '#extensions';

import { Yandex, YouTube } from './providers/index.ts';
import Track, {type TrackProps} from './Track.ts';


const youtubeUrl = (input: string) => {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Укажите ссылку на видео YouTube.');
  }
  const host = url.hostname.toLowerCase();
  const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Укажите обычную ссылку на видео YouTube.');
  }
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  if (youtubeHosts.includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw new Error('Нужна ссылка на одно видео YouTube, а не на плейлист.');
  }
  return `https://www.youtube.com/watch?v=${id}`;
};

export default class TrackResolver {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getProvider(input: string) {
    let url: URL;
    try {
      url = new URL(input.trim());
    } catch {
      throw new Error('Укажите ссылку на видео YouTube или трек Яндекс Музыки.');
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
      throw new Error('Нужна обычная ссылка на YouTube или Яндекс Музыку.');
    }

    if (/^music\.yandex\.(ru|com|kz|by|ua)$/.test(url.hostname)) {
      const track = /^\/album\/([0-9]+)\/track\/([0-9]+)\/?$/.exec(url.pathname);
      if (!track) {
        throw new Error(
          'Для Яндекс Музыки нужна ссылка вида https://music.yandex.ru/album/123/track/456.',
        );
      }
      return {
        source: 'yandex' as const,
        provider: new Yandex(this.config.music),
        url: `https://${url.hostname}/album/${track[1]}/track/${track[2]}`,
      };
    }

    if (
      ['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(
        url.hostname,
      )
    ) {
      return {
        source: 'youtube' as const,
        provider: new YouTube(this.config.music),
        url: youtubeUrl(input)
      };
    }
    throw new Error('Поддерживаются только видео YouTube и треки Яндекс Музыки.');
  }

  public async fromProps({url: input, userName, rewardId, redemptionId}: TrackProps) {
    const { source, provider, url: parsedUrl } = this.getProvider(input);
    const controller = new AbortController();

    const { title, url } = await provider.resolve(parsedUrl, controller.signal);

    return new Track(url, title, userName, rewardId, redemptionId, source);
  }

  public async likeTrack(track: Track) {
    if (track.source !== 'yandex') {
      throw 'Track source is not yandex';
    }

    const provider = new Yandex(this.config.music);

    await provider.likeTrack(track.url);
  }

  public async dislikeTrack(track: Track) {
    if (track.source !== 'yandex') {
      throw 'Track source is not yandex';
    }

    const provider = new Yandex(this.config.music);

    await provider.dislikeTrack(track.url);
  }
}
