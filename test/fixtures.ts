import Config from '#extensions/config.ts';

export function testConfig(
  overrides: Partial<ConstructorParameters<typeof Config>[0]> = {},
): Config {
  return new Config({
    streamerbot: {
      connection: { scheme: 'ws', host: '127.0.0.1', port: 8080, endpoint: '/', password: '' },
    },
    overlay: { connection: { host: '127.0.0.1', port: 17891 } },
    logger: { level: 'all' },
    channel: {
      id: '123',
      name: 'streamer',
      botLogin: 'bot',
      accessToken: 'access-token',
      clientId: 'client-id',
    },
    donates: { accessToken: 'donation-alerts-access-token' },
    rewards: { musicRewardId: 'reward' },
    music: { mpvPath: 'mpv', ytDlpPath: 'yt-dlp', yandexMusicToken: '' },
    actions: { hitChance: 6 },
    ...overrides,
  });
}
