import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Provider, RawTrack } from '../types.ts';
import type Config from '#extensions/config.ts';

const extract = promisify(execFile);
type Extract = (
  binary: string,
  args: string[],
  options: { signal: AbortSignal; timeout: number; maxBuffer: number; windowsHide: boolean },
) => Promise<{ stdout: string; stderr: string }>;

export interface Track {
  title: string;
  url: string;
  audioUrl: string;
}

export default class YouTube implements Provider {
  private readonly config: Config['music'];
  private readonly extract: Extract;
  constructor(config: Config['music'], request: Extract = extract) {
    this.extract = request;
    this.config = config;
  }

  public async resolve(url: string, signal: AbortSignal): Promise<RawTrack> {
    const { stdout } = await this.extract(
      this.config.ytDlpPath,
      [
        '--ignore-config',
        '--no-playlist',
        '--no-warnings',
        '--js-runtimes',
        'node',
        '--dump-single-json',
        '--format',
        'bestaudio',
        '--',
        url,
      ],
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

    return { title: info.title, url: info.url };
  }
}
