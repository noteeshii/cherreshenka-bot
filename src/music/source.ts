import { youtubeUrl } from './youtube.ts';

export interface MusicSource {
  provider: 'youtube' | 'yandex';
  url: string;
}

export function musicSource(input: string): MusicSource {
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
      provider: 'yandex',
      url: `https://${url.hostname}/album/${track[1]}/track/${track[2]}`,
    };
  }

  if (
    ['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(
      url.hostname,
    )
  ) {
    return { provider: 'youtube', url: youtubeUrl(input) };
  }
  throw new Error('Поддерживаются только видео YouTube и треки Яндекс Музыки.');
}
