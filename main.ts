import { StreamerbotClient } from '@streamerbot/client';

import { checkMusicDependencies } from '#extensions/music/dependencies.ts';
import {
  Config,
  Logger,
  Music,
  Twitch,
  Storage,
  DonationAlerts,
  Overlay,
  type StreamerChatMessage,
} from '#extensions';

import { Bot } from './bot.ts';
import { checkChatConnection } from './chat-connection.ts';

const config = Config.fromEnv();
const logger = Logger.fromConfig(config);

await checkMusicDependencies(config.music.mpvPath, config.music.ytDlpPath);

const socketLogger = logger.withContext('WebSocket');
const client = new StreamerbotClient({
  ...config.streamerbot.connection,
  immediate: false,
  autoReconnect: true,
  retries: -1,
  logLevel: 'warn',
  onData: (payload) => {
    if (payload?.status === 'error') {
      socketLogger.error(`Streamer.bot отклонил запрос: ${payload.error ?? 'причина не указана'}`);
      return;
    }
    if (payload?.event?.source && payload?.event?.type) {
      socketLogger.info(`${payload.event.source}.${payload.event.type}`);
    }
  },
  onConnect: () => {
    socketLogger.info('Подключено к streamer.bot');

    checkChatConnection(client, config)
      .then(socketLogger.info.bind(socketLogger))
      .catch(socketLogger.error.bind(socketLogger));
  },
  onDisconnect: () => socketLogger.warn('Соединение закрыто; ожидается переподключение'),
  onError: (error) => socketLogger.error(`Ошибка WebSocket: ${error.message}`),
});

const storage = new Storage();

await storage.open();

const overlay = new Overlay(
  { connection: config.overlay.connection },
  logger.withContext('Overlay'),
);

await overlay.open();

const music = new Music(config, logger.withContext('Music'));
const twitch = new Twitch(config, client);
const bot = new Bot(twitch, config, music, logger.withContext('Bot'), storage, overlay);
const donationAlerts = new DonationAlerts(config.donates);

client.on('Twitch.ChatMessage', ({ data }) => {
  bot
    .onMessage(data as unknown as StreamerChatMessage)
    .catch(socketLogger.error.bind(socketLogger));
});

client.on('Twitch.ChatMessageDeleted', ({ data }) => {
  bot.onDeleteMessage(data).catch(socketLogger.error.bind(socketLogger));
});

client.on('Command.Triggered', ({ data }) => {
  bot.onCommand(data).catch(socketLogger.error.bind(socketLogger));
});

client.on('Twitch.RewardRedemption', ({ data }) => {
  bot.onReward(data).catch(socketLogger.error.bind(socketLogger));
});

donationAlerts.onDonate((donate) => {
  bot.onDonate(donate).catch(socketLogger.error.bind(socketLogger));
});

let stopping = false;

const shutdown = () => {
  if (stopping) {
    return;
  }

  stopping = true;

  Promise.all([
    storage.close(),
    music.close(),
    client.disconnect(),
    donationAlerts.close(),
    overlay.close(),
  ])
    .catch(logger.error.bind(logger))
    .finally(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

await client.connect().catch(logger.error.bind(logger));
