import { checkMusicDependencies } from './music/dependencies.ts';
import { StreamerbotClient } from '@streamerbot/client';
import { MusicQueue } from './music/queue.ts';
import { MpvPlayer } from './music/mpv.ts';
import { createYoutubeResolver } from './music/youtube.ts';
import { Bot } from './bot.ts';
import { readConfig } from './config.ts';
import { createTwitch } from './twitch.ts';

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'неизвестная ошибка';
  console.error('Ошибка обработки события:', message);
}

const config = readConfig();
await checkMusicDependencies(config.mpvPath, config.ytDlpPath);
const client = new StreamerbotClient({
  ...config.connection,
  immediate: false,
  autoReconnect: true,
  retries: -1,
  logLevel: 'warn',
  onConnect: () => console.info('Подключено к streamer.bot'),
  onDisconnect: () => console.warn('Соединение закрыто; ожидается переподключение'),
  onError: (error) => console.error('Ошибка WebSocket:', error.message),
});

const music = new MusicQueue(
  new MpvPlayer(config.mpvPath),
  createYoutubeResolver(config.ytDlpPath),
  reportError,
);
// Musical replies always use the bot account.
const botChat = createTwitch(client, config.action, true);
const bot = new Bot(botChat, config, music);

client.on('Twitch.ChatMessage', ({ data }) => {
  void bot.onChat(data).catch(reportError);
});

client.on('Twitch.RewardRedemption', ({ data }) => {
  void bot.onReward(data).catch(reportError);
});

let stopping = false;

function shutdown(): void {
  if (stopping) {
    return;
  }

  stopping = true;
  void Promise.all([music.close(), client.disconnect()])
    .catch(reportError)
    .finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await client.connect().catch(reportError);
