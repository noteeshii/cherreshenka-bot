import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StreamerbotClient } from '@streamerbot/client';
import { checkChatConnection } from '../src/chat-connection.ts';
import { readConfig } from '../src/config.ts';
import { createTwitch } from '../src/twitch.ts';

function connection(authenticated = true, botUser = 'bot') {
  return {
    authenticated,
    getBroadcaster: async () => ({
      status: 'ok',
      connected: ['twitch'],
      platforms: { twitch: { broadcastUser: 'streamer', botUser } },
    }),
  } as unknown as Pick<StreamerbotClient, 'authenticated' | 'getBroadcaster'>;
}

test('подключение без авторизации объясняет необходимость пароля', async () => {
  await assert.rejects(
    checkChatConnection(connection(false), readConfig({})),
    /STREAMERBOT_PASSWORD/,
  );
});

test('проверка обнаруживает отсутствующий Bot Account и неверный канал', async () => {
  await assert.rejects(checkChatConnection(connection(true, ''), readConfig({})), /Bot Account/);
  await assert.rejects(
    checkChatConnection(connection(), readConfig({ TWITCH_CHANNEL: 'wrong' })),
    /TWITCH_CHANNEL/,
  );
});

test('проверка сообщает выбранные аккаунты без отправки сообщения', async () => {
  assert.match(
    await checkChatConnection(connection(), readConfig({})),
    /Канал: streamer; аккаунт для ответов: bot/,
  );
});

test('SendMessage сохраняет причину ошибки и объясняет Authentication required', async () => {
  for (const [error, expected] of [
    ['Authentication required', /STREAMERBOT_PASSWORD/],
    ['Bot account disconnected', /Bot account disconnected/],
  ] as const) {
    const client = {
      sendMessage: async () => ({ status: 'error', error }),
    } as unknown as StreamerbotClient;
    await assert.rejects(createTwitch(client, 'Dispatch', true).sendMessage('test'), expected);
  }
});
