import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StreamerbotEventData, StreamerbotClient } from '@streamerbot/client';
import { Bot } from '../bot.ts';
import { Config } from '#extensions';
import { testConfig } from './fixtures.ts';
import Track from '#extensions/music/Track';
import { Twitch } from '#extensions';

function setup(queuedTracks: { title: string | undefined }[] = [], enqueueError?: Error) {
  const calls: unknown[][] = [];
  const bot = new Bot(
    {
      sendMessage: async (...args: unknown[]) => {
        calls.push(['message', ...args]);
      },
      announce: async (...args: unknown[]) => {
        calls.push(['announce', ...args]);
      },
      timeout: async (...args: unknown[]) => {
        calls.push(['timeout', ...args]);
      },
    } as any,
    testConfig(),
    {
      queuedTracks,
      current: new Track('', 'Test song'),
      enqueue: async (input: string) => {
        if (enqueueError) throw enqueueError;
        calls.push(['enqueue', input]);
      },
      pause: async () => {
        calls.push(['pause']);
      },
      resume: async () => {
        calls.push(['resume']);
      },
      setVolume: async (volume: number) => {
        calls.push(['volume', volume]);
      },
      skip: async () => {
        calls.push(['skip']);
      },
    } as any,
    { info: () => {} },
  );
  return { bot, calls };
}

function chat(text: string, badge = '', id = '1') {
  return {
    message: {
      message: text,
      msgId: id,
      userId: '42',
      username: 'viewer',
      badges: [{ name: badge }],
    },
  } as StreamerbotEventData<'Twitch.ChatMessage'>;
}

test('команды без учёта регистра, дубликаты и cooldown', async () => {
  const { bot, calls } = setup();
  await bot.onChat(chat(' !ПЕСНЯ '));
  await bot.onChat(chat('!песня'));
  await bot.onChat(chat('!песня', '', '2'));
  assert.deepEqual(calls, [['message', 'Сейчас играет: Test song']]);
});

test('модерация недоступна зрителям и VIP', async () => {
  for (const badge of ['', 'vip']) {
    const { bot, calls } = setup();
    for (const command of ['!пауза', '!продолжить', '!пропустить', '!громкость 50'])
      await bot.onChat(chat(command, badge));
    assert.equal(calls.length, 0);
  }
});

test('модератор и стример могут выполнять команды', async () => {
  for (const badge of ['moderator', 'broadcaster']) {
    for (const [command, expected] of [
      ['!громкость 50', ['volume', 50]],
      ['!пауза', ['pause']],
      ['!продолжить', ['resume']],
      ['!пропустить', ['skip']],
    ] as const) {
      const { bot, calls } = setup();
      await bot.onChat(chat(command, badge));
      assert.deepEqual(calls, [expected]);
    }
  }
});

test('сообщения бота, internal и тестовые события игнорируются', async () => {
  for (const overrides of [{ username: 'bot' }, { internal: true }, { isTest: true }]) {
    const { bot, calls } = setup();
    const event = chat('!песня');
    Object.assign(event.message, overrides);
    await bot.onChat(event);
    assert.equal(calls.length, 0);
  }
});

test('награды обрабатываются по ID, один раз', async () => {
  const { bot, calls } = setup();
  const reward = {
    id: 'redemption',
    user_login: 'viewer',
    user_input: 'https://youtu.be/dQw4w9WgXcQ',
    status: 'unfulfilled',
    reward: { id: 'reward', title: 'Привет' },
  } as StreamerbotEventData<'Twitch.RewardRedemption'>;
  await bot.onReward({ ...reward, reward: { ...reward.reward, id: 'unknown' } });
  await bot.onReward({ ...reward, status: 'canceled' });
  await bot.onReward(reward);
  await bot.onReward(reward);
  assert.deepEqual(calls, [['enqueue', 'https://youtu.be/dQw4w9WgXcQ']]);
});

test('транспорт передаёт реальные запросы API и проверяет ошибки', async () => {
  const calls: unknown[][] = [];
  const client = {
    sendMessage: async (...args: unknown[]) => {
      calls.push(args);
      return { status: 'ok' };
    },
    doAction: async (...args: unknown[]) => {
      calls.push(args);
      return { status: 'ok' };
    },
  } as unknown as Pick<StreamerbotClient, 'sendMessage' | 'doAction'>;
  const twitch = new Twitch({ useBot: true, action: 'Dispatch' }, client);
  await twitch.sendMessage('hi');
  await twitch.announce('news');
  await twitch.timeout('@Viewer', 30, 'spam');
  assert.deepEqual(calls, [
    ['twitch', 'hi', { bot: true, internal: false }],
    [{ name: 'Dispatch' }, { operation: 'announce', message: 'news', bot: true }],
    [
      { name: 'Dispatch' },
      { operation: 'timeout', username: 'viewer', duration: 30, reason: 'spam', bot: true },
    ],
  ]);
  client.sendMessage = async () => ({ status: 'error' }) as never;
  await assert.rejects(twitch.sendMessage('hi'));
});

test('настройки читаются из изолированного окружения', (t) => {
  t.mock.property(process, 'env', { STREAMERBOT_URL: 'ws://localhost:8080/', TWITCH_USE_BOT: '1' });
  assert.equal(Config.fromEnv().connection.port, 8080);
  assert.equal(Config.fromEnv().streamerBot.useBot, true);
  process.env.TWITCH_USE_BOT = '0';
  assert.equal(Config.fromEnv().streamerBot.useBot, false);
  process.env.STREAMERBOT_URL = 'https://localhost';
  assert.throws(() => Config.fromEnv());
});

test('старые команды удалены', async () => {
  const { bot, calls } = setup();
  for (const command of ['!ping', '!help', '!say hi', '!announce hi', '!timeout viewer 60']) {
    await bot.onChat(chat(command, 'moderator'));
  }
  assert.deepEqual(calls, []);
});

test('управление не блокируется cooldown предыдущей команды', async () => {
  const { bot, calls } = setup();
  await bot.onChat(chat('!пауза', 'moderator', '1'));
  await bot.onChat(chat('!продолжить', 'moderator', '2'));
  await bot.onChat(chat('!пропустить', 'moderator', '3'));
  assert.deepEqual(calls, [['pause'], ['resume'], ['skip']]);
});

test('громкость: границы диапазона и некорректные аргументы', async () => {
  for (const volume of [1, 100]) {
    const { bot, calls } = setup();
    await bot.onChat(chat(`!громкость ${volume}`, 'moderator'));
    assert.deepEqual(calls, [['volume', volume]]);
  }
  for (const value of ['', '0', '101', '-1', '1.5', 'NaN', '50 extra', '1e2']) {
    const { bot, calls } = setup();
    await bot.onChat(chat(`!громкость ${value}`, 'moderator'));
    assert.deepEqual(calls, [['message', 'Использование: !громкость <1-100> (целое число).']]);
  }
});

function modernChat(command: string, badge = '', id = 'modern-1') {
  return {
    text: command,
    messageId: id,
    user: { id: '42', login: 'viewer', badges: [{ name: badge }] },
    broadcaster: { id: '100', login: 'streamer' },
    meta: { internal: false, isTest: false },
    isTest: false,
  };
}

test('актуальный ChatMessage: !песня отвечает и повторное событие игнорируется', async () => {
  const { bot, calls } = setup();
  await bot.onChat(modernChat('!песня'));
  await bot.onChat(modernChat('!песня'));
  assert.deepEqual(calls, [['message', 'Сейчас играет: Test song']]);
});

test('актуальный ChatMessage: права читаются из user.badges', async () => {
  for (const badge of ['', 'vip', 'moderator', 'broadcaster']) {
    const { bot, calls } = setup();
    await bot.onChat(modernChat('!громкость 50', badge));
    assert.deepEqual(calls, ['moderator', 'broadcaster'].includes(badge) ? [['volume', 50]] : []);
  }
});

test('актуальный ChatMessage: тестовые, внутренние и сообщения бота игнорируются', async () => {
  for (const override of [
    { isTest: true },
    { meta: { isTest: true } },
    { meta: { internal: true } },
    { user: { id: '42', login: 'bot', badges: [] } },
  ]) {
    const { bot, calls } = setup();
    await bot.onChat({ ...modernChat('!песня'), ...override });
    assert.deepEqual(calls, []);
  }
});

test('повреждённые события не запускают команды и не вызывают исключений', async () => {
  const { bot, calls } = setup();
  for (const payload of [
    null,
    undefined,
    {},
    { text: '!песня' },
    { message: null },
    { ...modernChat('!громкость 50'), user: null },
  ]) {
    await bot.onChat(payload);
  }
  assert.deepEqual(calls, []);
});

test('!очередь доступна зрителям и показывает порядок ожидающих треков', async () => {
  const { bot, calls } = setup([{ title: 'First' }, { title: 'Second' }]);
  await bot.onChat(chat('!очередь'));
  assert.deepEqual(calls, [['message', 'Очередь: 1# First | 2# Second']]);
});

test('!очередь сообщает о пустой очереди даже при играющем треке', async () => {
  const { bot, calls } = setup();
  await bot.onChat(chat('!очередь'));
  assert.deepEqual(calls, [['message', 'Очередь пуста.']]);
});

test('ошибка асинхронного заказа возвращается пользователю в чат', async () => {
  const { bot, calls } = setup([], new Error('Трек недоступен'));
  await bot.onReward({
    id: 'failed-order',
    user_input: 'https://youtu.be/dQw4w9WgXcQ',
    user_login: 'viewer',
    reward: { id: 'reward', title: 'Музыка' },
  } as StreamerbotEventData<'Twitch.RewardRedemption'>);
  assert.deepEqual(calls, [['message', '@viewer, Не удалось добавить трек.']]);
});
