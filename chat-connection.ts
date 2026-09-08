import type { StreamerbotClient } from '@streamerbot/client';
import type { Config } from '#extensions';

type ChatConnection = Pick<StreamerbotClient, 'authenticated' | 'getBroadcaster'>;

export const checkChatConnection = async (client: ChatConnection, config: Config) => {
  if (!client.authenticated) {
    throw new Error(
      'WebSocket подключён без авторизации: отправка в чат недоступна. Включите Authentication в WebSocket Server streamer.bot и задайте тот же пароль в STREAMERBOT_PASSWORD в .env.',
    );
  }

  const response = await client.getBroadcaster();
  if (response.status !== 'ok') {
    throw new Error('Не удалось проверить Twitch-аккаунты через GetBroadcaster.');
  }
  const twitch = response.platforms.twitch;
  if (!response.connected.includes('twitch') || !twitch?.broadcastUser) {
    throw new Error('Подключите Twitch Broadcaster Account в streamer.bot.');
  }
  if (!twitch.botUser) {
    throw new Error(
      'Подключите Twitch Bot Account в streamer.bot: музыкальные ответы отправляются от него.',
    );
  }
  if (config.channel.name !== twitch.broadcastUser.toLowerCase()) {
    throw new Error(
      'TWITCH_CHANNEL не совпадает с каналом streamer.bot; команды этого канала будут игнорироваться.',
    );
  }
  if (config.channel.botLogin !== twitch.botUser.toLowerCase()) {
    throw new Error(
      'TWITCH_BOT_LOGIN не совпадает с Bot Account в streamer.bot. Укажите логин Bot Account.',
    );
  }

  return `Авторизация WebSocket подтверждена. Канал: ${twitch.broadcastUser}; аккаунт для ответов: ${twitch.botUser}. Проверка: !песня с аккаунта зрителя или стримера.`;
};
