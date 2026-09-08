import { StreamerbotClient } from '@streamerbot/client';

import { checkMusicDependencies } from '#extensions/music/dependencies.ts';

import { Config, Logger, Music, Twitch } from '#extensions';

import { Bot } from './bot.ts';
import { checkChatConnection } from './chat-connection.ts';

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'неизвестная ошибка';
  console.error('Ошибка обработки события:', message);
}

const config = Config.fromEnv();
const logger = Logger.fromConfig(config);

await checkMusicDependencies(config.music.mpvPath, config.music.ytDlpPath);

const client = new StreamerbotClient({
  ...config.connection,
  immediate: false,
  autoReconnect: true,
  retries: -1,
  logLevel: 'warn',
  onData: (payload) => {
    if (payload?.event?.source && payload?.event?.type) {
      logger.withContext('WebSocket').info(`${payload.event.source}.${payload.event.type}`);
    }
  },
  onConnect: () => {
    logger.info('Подключено к streamer.bot');

    checkChatConnection(client, config).then(console.info).catch(reportError);
  },
  onDisconnect: () => console.warn('Соединение закрыто; ожидается переподключение'),
  onError: (error) => console.error('Ошибка WebSocket:', error.message),
});

const music = new Music(config, reportError);
const twitch = new Twitch(config.streamerBot, client);
const bot = new Bot(twitch, config, music, logger);

client.on('Twitch.ChatMessage', ({ data }) => {
  bot.onChat(data).catch(reportError);
});

client.on('Command.Triggered', ({ data }) => {
  logger.info('TODO: Command.Triggered');
});

client.on('Twitch.RewardRedemption', ({ data }) => {
  bot.onReward(data).catch(reportError);
});

let stopping = false;

const shutdown = () => {
  if (stopping) {
    return;
  }

  stopping = true;

  Promise.all([music.close(), client.disconnect()])
    .catch(reportError)
    .finally(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await client.connect().catch(reportError);
