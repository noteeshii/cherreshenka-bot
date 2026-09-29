import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

import { Logger, Overlay } from '#extensions';
import type { ServerMessage, Sticker, StreamerChatMessage } from '#extensions';

const HOST = '127.0.0.1';

const CHAT_MESSAGE: StreamerChatMessage = {
  user: {
    role: 5,
    badges: [],
    color: '#1E90FF',
    subscribed: false,
    subscriptionTier: '0',
    monthSubscribed: 0,
    id: 'user-one',
    login: 'viewer',
    name: 'Viewer',
    type: 'twitch',
  },
  messageId: 'message-one',
  meta: {
    internal: false,
    firstMessage: false,
    firstMessageTimestamp: '2026-09-18T12:32:16.944931Z',
    returningChatter: false,
    isHighlighted: false,
    isMe: false,
    isCustomReward: false,
    isInSharedChat: false,
    isSharedChatHost: false,
    isFromSharedChatGuest: false,
    createdAt: '2026-09-18T12:32:16.944931Z',
    isTest: false,
  },
  text: '😀 @viewer2 Kappa',
  emotes: [
    {
      id: '25',
      type: 'Twitch',
      name: 'Kappa',
      startIndex: 11,
      endIndex: 15,
      imageUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/2.0',
    },
  ],
  parts: [
    { type: 'text', text: '😀 ' },
    {
      type: 'mention',
      userId: 'user-two',
      text: '@viewer2',
      userName: 'Viewer2',
      userLogin: 'viewer2',
    },
    { type: 'text', text: ' ' },
    {
      type: 'emote',
      text: 'Kappa',
      source: 'Twitch',
      imageUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/2.0',
      zeroWidth: false,
    },
  ],
  broadcaster: { id: '123', login: 'fixture', name: 'Fixture', type: 'twitch' },
  isReplay: false,
  isInSharedChat: false,
  isSharedChatHost: false,
  isFromSharedChatGuest: false,
  createdAt: '2026-09-18T12:32:16.944931Z',
};

/** Сообщение автора, выкупившего награду: текст с эмоутами 7TV и Twitch. */
const REWARD_MESSAGE: StreamerChatMessage = {
  ...CHAT_MESSAGE,
  user: { ...CHAT_MESSAGE.user, id: 'user-two', login: 'noteeshii', name: 'noteeshii' },
  messageId: 'message-reward',
  text: '12313 xdd cherry444Flash',
  emotes: [
    {
      id: '7tv-xdd',
      type: '7TVChannel',
      name: 'xdd',
      startIndex: 6,
      endIndex: 8,
      imageUrl: 'https://cdn.7tv.app/emote/7tv-xdd/2x.webp',
    },
    {
      id: '555',
      type: 'Twitch',
      name: 'cherry444Flash',
      startIndex: 10,
      endIndex: 23,
      imageUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/555/default/light/2.0',
    },
  ],
  parts: [
    { type: 'text', text: '12313 ' },
    {
      type: 'emote',
      text: 'xdd',
      source: '7TVChannel',
      imageUrl: 'https://cdn.7tv.app/emote/7tv-xdd/2x.webp',
      zeroWidth: false,
    },
    { type: 'text', text: ' ' },
    {
      type: 'emote',
      text: 'cherry444Flash',
      source: 'Twitch',
      imageUrl: 'https://static-cdn.jtvnw.net/emoticons/v2/555/default/light/2.0',
      zeroWidth: false,
    },
  ],
};

type StickersMessage = Extract<ServerMessage, { type: 'stickers' }>;

/** Клиент оверлея: подключается, здоровается и собирает все входящие сообщения. */
class TestClient {
  readonly messages: ServerMessage[] = [];
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', (raw) => {
      this.messages.push(JSON.parse(String(raw)) as ServerMessage);
    });
  }

  static connect(url: string, hello: unknown): Promise<TestClient> {
    return new Promise((resolve) => {
      const socket = new WebSocket(url);
      socket.once('open', () => {
        socket.send(JSON.stringify(hello));
        resolve(new TestClient(socket));
      });
    });
  }

  public close(): void {
    this.socket.close();
  }
}

const hello = (profileId: string, rewardMode: boolean) => ({
  type: 'hello',
  role: 'overlay',
  profile: {
    id: profileId,
    name: profileId,
    updatedAt: Date.now(),
    settings: { channel: 'fixture', lifetime: 30, rewardMode },
  },
});

const lastStickers = (client: TestClient, profileId: string): StickersMessage | undefined => {
  const stickers = client.messages.filter(
    (message) => message.type === 'stickers' && message.profileId === profileId,
  );
  return stickers.at(-1) as StickersMessage | undefined;
};

/** Стикер без случайных полей (позиция, наклон, эффект) для сравнения между клиентами. */
const stable = (sticker: Sticker) => ({
  syncId: sticker.syncId,
  author: sticker.author,
  text: sticker.text,
  content: sticker.content,
  color: sticker.color,
  roles: sticker.roles,
  pinned: sticker.pinned,
  leaving: sticker.leaving,
  customRewardId: sticker.customRewardId,
});

const waitUntil = async (condition: () => boolean, timeoutMs = 5000): Promise<void> => {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Истекло время ожидания условия теста');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

test('награда создаёт стикер с эмоутами, а повторный выкуп закрепляет его', async (t) => {
  const overlay = new Overlay(
    {
      connection: { host: HOST, port: 0 },
      rewards: { basicStickerId: 'reward-basic', pinnedStickerId: 'reward-pinned' },
    },
    new Logger({ level: '' }),
  );
  await overlay.open();
  t.after(async () => {
    await overlay.close();
  });

  const rewards = await TestClient.connect(`ws://${HOST}:${overlay.port}`, hello('rewards', true));
  const regular = await TestClient.connect(`ws://${HOST}:${overlay.port}`, hello('chat', false));
  await waitUntil(() => rewards.messages.some((message) => message.type === 'profile'));
  await waitUntil(() => regular.messages.some((message) => message.type === 'profile'));

  // Сообщение-уведомление о награде (isCustomReward) никогда не становится стикером.
  overlay.onMessage(
    { ...REWARD_MESSAGE, meta: { ...REWARD_MESSAGE.meta, isCustomReward: true } },
    { isPinned: true, isReward: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(lastStickers(rewards, 'rewards')?.stickers.length, 0);
  assert.equal(lastStickers(regular, 'chat')?.stickers.length, 0);

  // Выкуп обычной награды помечает сообщение как награду.
  overlay.onMessage(REWARD_MESSAGE, { isPinned: false, isReward: true });
  await waitUntil(() => lastStickers(rewards, 'rewards')?.stickers.length === 1);
  assert.equal(lastStickers(regular, 'chat')?.stickers.length, 0);
  const sticker = lastStickers(rewards, 'rewards')!.stickers[0];
  assert.equal(sticker.syncId, 'rewards:message-reward');
  assert.equal(sticker.author, 'noteeshii');
  assert.equal(sticker.text, '12313 xdd cherry444Flash');
  assert.equal(sticker.pinned, false);
  assert.equal(sticker.customRewardId, 'reward-basic');
  assert.deepEqual(sticker.content, [
    { type: 'text', text: '12313 ' },
    {
      type: 'emote',
      provider: '7tv',
      id: '7tv-xdd',
      code: 'xdd',
      url: 'https://cdn.7tv.app/emote/7tv-xdd/2x.webp',
    },
    { type: 'text', text: ' ' },
    {
      type: 'emote',
      provider: 'twitch',
      id: '555',
      code: 'cherry444Flash',
      url: 'https://static-cdn.jtvnw.net/emoticons/v2/555/default/light/2.0',
    },
  ]);

  // Обычное сообщение не попадает в профиль режима наград.
  overlay.onMessage(CHAT_MESSAGE, { isPinned: false, isReward: false });
  await waitUntil(() => lastStickers(regular, 'chat')?.stickers.length === 1);
  assert.equal(lastStickers(rewards, 'rewards')?.stickers.length, 1);

  // Выкуп закрепляемой награды закрепляет стикер на 10 минут.
  overlay.onMessage(
    { ...REWARD_MESSAGE, messageId: 'message-pinned-one' },
    { isPinned: true, isReward: true },
  );
  await waitUntil(
    () =>
      lastStickers(rewards, 'rewards')?.stickers.some(
        (item) => item.syncId === 'rewards:message-pinned-one',
      ) === true,
  );
  const pinnedSticker = lastStickers(rewards, 'rewards')!.stickers.find(
    (item) => item.syncId === 'rewards:message-pinned-one',
  );
  assert.equal(pinnedSticker?.pinned, true);
  assert.equal(pinnedSticker?.customRewardId, 'reward-pinned');

  // Повторный выкуп снимает прежний закреплённый стикер и закрепляет новый.
  overlay.onMessage(
    { ...REWARD_MESSAGE, messageId: 'message-pinned-two' },
    { isPinned: true, isReward: true },
  );
  await waitUntil(
    () =>
      lastStickers(rewards, 'rewards')?.stickers.some(
        (item) => item.syncId === 'rewards:message-pinned-two',
      ) === true,
  );
  const stickers = lastStickers(rewards, 'rewards')!.stickers;
  assert.equal(stickers.length, 2);
  assert.equal(
    stickers.find((item) => item.customRewardId === 'reward-pinned')?.syncId,
    'rewards:message-pinned-two',
  );
});

test('стикеры синхронизируются между клиентами одного профиля', async (t) => {
  const overlay = new Overlay({ connection: { host: HOST, port: 0 } }, new Logger({ level: '' }));
  await overlay.open();
  t.after(async () => {
    await overlay.close();
  });

  const chatFirst = await TestClient.connect(`ws://${HOST}:${overlay.port}`, hello('chat', false));
  const chatSecond = await TestClient.connect(`ws://${HOST}:${overlay.port}`, hello('chat', false));
  const rewards = await TestClient.connect(`ws://${HOST}:${overlay.port}`, hello('rewards', true));

  // Профили должны быть зарегистрированы до отправки сообщения в чат.
  await waitUntil(() => chatFirst.messages.some((message) => message.type === 'profile'));
  await waitUntil(() => chatSecond.messages.some((message) => message.type === 'profile'));
  await waitUntil(() => rewards.messages.some((message) => message.type === 'profile'));

  overlay.onMessage(CHAT_MESSAGE, { isPinned: false, isReward: false });

  await waitUntil(() => lastStickers(chatFirst, 'chat')?.stickers.length === 1);
  await waitUntil(() => lastStickers(chatSecond, 'chat')?.stickers.length === 1);
  assert.equal(lastStickers(rewards, 'rewards')?.stickers.length, 0);

  const first = lastStickers(chatFirst, 'chat')!.stickers[0];
  const second = lastStickers(chatSecond, 'chat')!.stickers[0];
  assert.deepEqual(stable(first), stable(second));
  assert.equal(first.syncId, 'chat:message-one');
  assert.deepEqual(first.content, [
    { type: 'text', text: '😀 ' },
    { type: 'text', text: '@viewer2' },
    { type: 'text', text: ' ' },
    {
      type: 'emote',
      provider: 'twitch',
      id: '25',
      code: 'Kappa',
      url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/light/2.0',
    },
  ]);

  // Переподключение клиента восстанавливает то же содержимое из снапшота профиля.
  chatFirst.close();
  const reconnected = await TestClient.connect(
    `ws://${HOST}:${overlay.port}`,
    hello('chat', false),
  );
  await waitUntil(() => lastStickers(reconnected, 'chat')?.stickers.length === 1);
  assert.deepEqual(stable(lastStickers(reconnected, 'chat')!.stickers[0]), stable(second));

  // Удаление сообщения в чате убирает стикер после анимации ухода.
  overlay.onDeleteMessage({ targetMessageId: 'message-one' });
  await waitUntil(
    () =>
      lastStickers(chatSecond, 'chat')?.stickers.length === 0 &&
      lastStickers(reconnected, 'chat')?.stickers.length === 0,
    5000,
  );
});
