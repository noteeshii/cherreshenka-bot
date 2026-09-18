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
    streamerbot: {
      connection: {
        scheme: string;
        host: string;
        port: number;
        endpoint: string;
        password: string;
      };
    };
    overlay: {
      connection: {
        host: string;
        port: number;
      };
    };
    logger: {
      level: string;
    };
    channel: {
      id: string;
      name: string;
      botLogin: string;
      accessToken: string;
      clientId: string;
    };
    donates: {
      accessToken: string;
    };
    rewards: {
      musicRewardId: string;
    };
    music: {
      mpvPath: string;
      ytDlpPath: string;
      yandexMusicToken: string;
    };
    actions: {
      hitChance: number;
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

    const streamerbotUrl = parseConnectionUrl(String(env.STREAMERBOT_URL));
    const overlayUrl = parseConnectionUrl(String(env.OVERLAY_URL));
    const defaultPort = streamerbotUrl.protocol === 'wss:' ? 443 : 80;

    return new Config({
      streamerbot: {
        connection: {
          scheme: streamerbotUrl.protocol.slice(0, -1),
          host: streamerbotUrl.hostname,
          port: Number(streamerbotUrl.port ?? defaultPort),
          endpoint: streamerbotUrl.pathname,
          password: env.STREAMERBOT_PASSWORD || '',
        },
      },
      overlay: {
        connection: {
          host: overlayUrl.hostname,
          port: Number(overlayUrl.port ?? defaultPort),
        },
      },
      channel: {
        id: String(env.TWITCH_CHANNEL_ID ?? ''),
        name: (env.TWITCH_CHANNEL_NAME ?? '').toLowerCase(),
        botLogin: (env.TWITCH_BOT_LOGIN ?? '').toLowerCase(),
        accessToken: String(env.TWITCH_ACCESS_TOKEN ?? ''),
        clientId: String(env.TWITCH_CLIENT_ID ?? ''),
      },

      donates: {
        accessToken: String(env.DONATION_ALERTS_ACCESS_TOKEN ?? ''),
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

      actions: {
        hitChance: Number(env.HIT_CHANCE || 6),
      },
    });
  }

  get streamerbot() {
    return this.props.streamerbot;
  }
  get overlay() {
    return this.props.overlay;
  }
  get logger() {
    return this.props.logger;
  }
  get channel() {
    return this.props.channel;
  }
  get donates() {
    return this.props.donates;
  }
  get rewards() {
    return this.props.rewards;
  }
  get music() {
    return this.props.music;
  }
  get actions() {
    return this.props.actions;
  }
}

export default Config;
