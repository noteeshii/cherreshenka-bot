import { spawn } from 'node:child_process';
import { readConfig } from '../src/config.ts';
import { musicSource } from '../src/music/source.ts';

function run(binary: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input || process.argv.length !== 3) {
    throw new Error('Использование: npm run diagnose:music -- "ссылка на трек"');
  }
  const source = musicSource(input);
  const { ytDlpPath } = readConfig();
  console.info('Проверка версии yt-dlp:');
  const versionExit = await run(ytDlpPath, ['--ignore-config', '--version']);
  if (versionExit !== 0) {
    process.exitCode = versionExit;
    return;
  }

  console.info(`Диагностика ${source.provider}: ${source.url}`);
  const args = ['--ignore-config', '--verbose', '--no-playlist', '--simulate', '--print', 'title'];
  if (source.provider === 'youtube') args.push('--js-runtimes', 'node');
  args.push('--format', source.provider === 'yandex' ? 'best' : 'bestaudio', '--', source.url);
  process.exitCode = await run(ytDlpPath, args);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Ошибка диагностики');
  process.exitCode = 1;
});
