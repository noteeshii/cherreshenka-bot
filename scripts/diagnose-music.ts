import Config from '#extensions/config.ts';
import TrackResolver from '#extensions/music/TrackResolver.ts';

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input || process.argv.length !== 3) {
    throw new Error('Использование: npm run diagnose:music -- "ссылка на трек"');
  }
  const track = await new TrackResolver(Config.fromEnv()).fromUrl(input);
  console.info('Аудиоссылка получена:', track.title);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Ошибка диагностики');
  process.exitCode = 1;
});
