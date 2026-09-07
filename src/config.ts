const DEFAULT_STREAMERBOT_URL = 'ws://127.0.0.1:8080/';

function parseConnectionUrl(value: string): URL {
  const url = new URL(value);
  const isWebSocket = url.protocol === 'ws:' || url.protocol === 'wss:';
  const hasUnsupportedParts = url.username || url.password || url.search || url.hash;

  if (!isWebSocket || hasUnsupportedParts) {
    throw new Error('STREAMERBOT_URL должен быть ws://host:port/path или wss://host:port/path');
  }

  return url;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = parseConnectionUrl(env.STREAMERBOT_URL ?? DEFAULT_STREAMERBOT_URL);
  const defaultPort = url.protocol === 'wss:' ? 443 : 80;
  const useBot = env.TWITCH_USE_BOT ?? 'true';

  if (useBot !== 'true' && useBot !== 'false') {
    throw new Error('TWITCH_USE_BOT: true или false');
  }

  return {
    connection: {
      scheme: url.protocol.slice(0, -1),
      host: url.hostname,
      port: Number(url.port || defaultPort),
      endpoint: url.pathname,
      password: env.STREAMERBOT_PASSWORD,
    },
    debugChat: env.DEBUG_CHAT === 'true',
    useBot: useBot === 'true',
    botLogin: (env.TWITCH_BOT_LOGIN ?? '').toLowerCase(),
    channel: (env.TWITCH_CHANNEL ?? '').toLowerCase(),
    action: env.STREAMERBOT_ACTION ?? 'Cherreshenka Dispatch',
    musicRewardId: env.MUSIC_REWARD_ID ?? '',
    mpvPath: env.MPV_PATH ?? 'mpv',
    ytDlpPath: env.YT_DLP_PATH ?? 'yt-dlp',
    yandexMusicToken: env.YANDEX_MUSIC_TOKEN?.trim() ?? '',
  };
}

export type Config = ReturnType<typeof readConfig>;
