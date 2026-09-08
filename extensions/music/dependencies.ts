import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function checkMusicDependencies(mpvPath: string, ytDlpPath: string): Promise<void> {
  for (const binary of [mpvPath, ytDlpPath]) {
    try {
      await execute(binary, ['--version'], { timeout: 10_000, windowsHide: true });
    } catch {
      throw new Error(
        `Не удалось запустить ${binary}. Установите mpv и yt-dlp; проверьте MPV_PATH и YT_DLP_PATH в .env.`,
      );
    }
  }
}
