import { createYandexMusic } from './yandex.ts';
import type { YandexMusic } from './yandex.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { musicSource } from './source.ts';
import type { MusicSource } from './source.ts';

const execute = promisify(execFile);

export interface Track {
  title: string;
  url: string;
  audioUrl: string;
}

type Extract = (
  binary: string,
  args: string[],
  options: {
    signal: AbortSignal;
    timeout: number;
    maxBuffer: number;
    windowsHide: boolean;
  },
) => Promise<{ stdout: string }>;

function extractorArgs(source: MusicSource): string[] {
  const args = ['--ignore-config', '--no-playlist', '--no-warnings'];
  if (source.provider === 'youtube') args.push('--js-runtimes', 'node');
  return args;
}

export function createMusicResolver(
  binary: string,
  extract: Extract = execute,
  yandex: YandexMusic = createYandexMusic(),
) {
  return async (input: string, signal: AbortSignal): Promise<Track> => {
    const source = musicSource(input);
    if (source.provider === 'yandex') return yandex.resolve(source.url, signal);
    const { stdout } = await extract(
      binary,
      [...extractorArgs(source), '--dump-single-json', '--format', 'bestaudio', '--', source.url],
      { signal, timeout: 60_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
    );
    const info = JSON.parse(stdout);
    if (info.is_live || info.live_status === 'is_upcoming') {
      throw new Error('Прямые трансляции нельзя добавить в очередь.');
    }
    if (
      info._type === 'playlist' ||
      typeof info.title !== 'string' ||
      typeof info.url !== 'string'
    ) {
      throw new Error('Не удалось получить аудио трека.');
    }
    const protocol = new URL(info.url).protocol;
    if (protocol !== 'https:') {
      throw new Error('Неподдерживаемый аудиопоток.');
    }
    return { title: info.title, url: source.url, audioUrl: info.url };
  };
}

export function createMusicTitleResolver(
  binary: string,
  extract: Extract = execute,
  yandex: YandexMusic = createYandexMusic(),
) {
  return async (input: string, signal: AbortSignal): Promise<string> => {
    const source = musicSource(input);
    if (source.provider === 'yandex') return yandex.title(source.url, signal);
    const { stdout } = await extract(
      binary,
      [
        ...extractorArgs(source),
        '--skip-download',
        '--flat-playlist',
        '--print',
        'title',
        '--',
        source.url,
      ],
      { signal, timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true },
    );
    return stdout.trim();
  };
}
