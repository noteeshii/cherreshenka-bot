import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export interface Track {
  title: string;
  url: string;
  audioUrl: string;
}

export function youtubeUrl(input: string): string {
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
}

export function createYoutubeResolver(binary: string) {
  return async (url: string, signal: AbortSignal): Promise<Track> => {
    const { stdout } = await execute(
      binary,
      [
        '--ignore-config',
        '--no-playlist',
        '--no-warnings',
        '--dump-single-json',
        '--format',
        'bestaudio',
        '--js-runtimes',
        'node',
        '--',
        youtubeUrl(url),
      ],
      { signal, timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    );
    const info = JSON.parse(stdout);
    if (info.is_live || info.live_status === 'is_upcoming') {
      throw new Error('Прямые трансляции нельзя добавить в очередь.');
    }
    if (typeof info.title !== 'string' || typeof info.url !== 'string') {
      throw new Error('Не удалось получить аудио видео.');
    }
    if (new URL(info.url).protocol !== 'https:') throw new Error('Неподдерживаемый аудиопоток.');
    return { title: info.title, url, audioUrl: info.url };
  };
}

export function createYoutubeTitleResolver(binary: string) {
  return async (url: string, signal: AbortSignal): Promise<string> => {
    const { stdout } = await execute(
      binary,
      [
        '--ignore-config',
        '--no-playlist',
        '--no-warnings',
        '--skip-download',
        '--flat-playlist',
        '--print',
        'title',
        '--js-runtimes',
        'node',
        '--',
        youtubeUrl(url),
      ],
      { signal, timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true },
    );
    return stdout.trim();
  };
}
