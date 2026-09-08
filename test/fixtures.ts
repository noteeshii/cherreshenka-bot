import Config from '#extensions/config.ts';

export function testConfig(
  overrides: Partial<ConstructorParameters<typeof Config>[0]> = {},
): Config {
  return new Config({
    connection: { scheme: 'ws', host: '127.0.0.1', port: 8080, endpoint: '/', password: '' },
    logger: { level: 'all' },
    streamerBot: { useBot: true, action: 'Dispatch' },
    channel: { name: '', botLogin: 'bot' },
    rewards: { musicRewardId: 'reward' },
    music: { mpvPath: 'mpv', ytDlpPath: 'yt-dlp', yandexMusicToken: '' },
    ...overrides,
  });
}
