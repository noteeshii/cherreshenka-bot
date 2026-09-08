import { StreamerbotClient } from '@streamerbot/client';

import { checkMusicDependencies } from '#extensions/music/dependencies.ts';

import { Config, Logger, Music, Twitch } from '#extensions';

import { Bot } from './bot.ts';
import { checkChatConnection } from './chat-connection.ts';

const config = Config.fromEnv();
const logger = Logger.fromConfig(config);

await checkMusicDependencies(config.music.mpvPath, config.music.ytDlpPath);

const socketLogger = logger.withContext('WebSocket');
const client = new StreamerbotClient({
  ...config.connection,
  immediate: false,
  autoReconnect: true,
  retries: -1,
  logLevel: 'warn',
  onData: (payload) => {
    if (payload?.event?.source && payload?.event?.type) {
      socketLogger.info(`${payload.event.source}.${payload.event.type}`);
    }
  },
  onConnect: () => {
    socketLogger.info('Подключено к streamer.bot');

    checkChatConnection(client, config)
      .then(socketLogger.info)
      .catch(socketLogger.error);
  },
  onDisconnect: () => socketLogger.warn('Соединение закрыто; ожидается переподключение'),
  onError: (error) => socketLogger.error(`Ошибка WebSocket: ${error.message}`),
});

const music = new Music(config, logger.withContext('Music'));
const twitch = new Twitch(config.streamerBot, client);
const bot = new Bot(twitch, config, music, logger.withContext('Bot'));

client.on('Command.Triggered', ({ data }) => {
  bot.onCommand(data).catch(socketLogger.error);
});

client.on('Twitch.RewardRedemption', ({ data }) => {
  bot.onReward(data).catch(socketLogger.error);
});

let stopping = false;

const shutdown = () => {
  if (stopping) {
    return;
  }

  stopping = true;

  Promise.all([music.close(), client.disconnect()])
    .catch(logger.error)
    .finally(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await client.connect().catch(logger.error);
