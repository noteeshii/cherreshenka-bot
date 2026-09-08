const parseConnectionUrl = (value: string): URL => {
  const url = new URL(value);
  const isWebSocket = url.protocol === 'ws:' || url.protocol === 'wss:';
  const hasUnsupportedParts = url.username || url.password || url.search || url.hash;

  if (!isWebSocket || hasUnsupportedParts) {
    throw new Error('STREAMERBOT_URL должен быть ws://host:port/path или wss://host:port/path');
  }

  return url;
};

export namespace Config {
  export type Props = {
    connection: {
      scheme: string;
      host: string;
      port: number;
      endpoint: string;
      password: string;
    };
    logger: {
      level: string;
    };
    streamerBot: {
      useBot: boolean;
      action: string;
    };
    channel: {
      name: string;
      botLogin: string;
    };
    rewards: {
      musicRewardId: string;
    };
    music: {
      mpvPath: string;
      ytDlpPath: string;
      yandexMusicToken: string;
    };
  };
}

class Config {
  private readonly props: Config.Props;

  constructor(props: Config.Props) {
    this.props = props;
  }

  static fromEnv() {
    const { env } = process;

    const url = parseConnectionUrl(String(env.STREAMERBOT_URL));
    const defaultPort = url.protocol === 'wss:' ? 443 : 80;
    const useBot = Boolean(Number(env.TWITCH_USE_BOT || 1));

    return new Config({
      connection: {
        scheme: url.protocol.slice(0, -1),
        host: url.hostname,
        port: Number(url.port || defaultPort),
        endpoint: url.pathname,
        password: env.STREAMERBOT_PASSWORD || '',
      },

      streamerBot: {
        useBot,
        action: env.STREAMERBOT_ACTION ?? 'Cherreshenka Dispatch',
      },

      channel: {
        name: (env.TWITCH_CHANNEL ?? '').toLowerCase(),
        botLogin: (env.TWITCH_BOT_LOGIN ?? '').toLowerCase(),
      },

      rewards: {
        musicRewardId: env.MUSIC_REWARD_ID ?? '',
      },

      music: {
        mpvPath: env.MPV_PATH ?? 'mpv',
        ytDlpPath: env.YT_DLP_PATH ?? 'yt-dlp',
        yandexMusicToken: env.YANDEX_MUSIC_TOKEN?.trim() ?? '',
      },

      logger: {
        level: env.LOG_LEVEL || 'all',
      },
    });
  }

  get connection() {
    return this.props.connection;
  }
  get logger() {
    return this.props.logger;
  }
  get streamerBot() {
    return this.props.streamerBot;
  }
  get channel() {
    return this.props.channel;
  }
  get rewards() {
    return this.props.rewards;
  }
  get music() {
    return this.props.music;
  }
}

export default Config;
