import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StreamerbotEventData, StreamerbotClient } from '@streamerbot/client';
import { Bot } from '../bot.ts';
import { Config } from '#extensions';
import { testConfig } from './fixtures.ts';
import Track from '#extensions/music/Track';
import { Twitch, Logger } from '#extensions';

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
    new Logger({level: ''}),
  );
  return { bot, calls };
}

function command(name: string, message = '') {
  return {
    name,
    message
  } as any;
}

test('action срабатывает', async () => {
  const { bot, calls } = setup();
  await bot.onCommand(command('SendCurrentTrack'));
  assert.deepEqual(calls, [['message', 'Сейчас играет: Test song']]);
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

test('громкость: границы диапазона и некорректные аргументы', async () => {
  for (const volume of [1, 100]) {
    const { bot, calls } = setup();

    await bot.onCommand(command(`SetTracksVolume`, String(volume)));

    assert.deepEqual(calls, [['volume', volume]]);
  }

  for (const value of ['', '0', '101', '-1', '1.5', 'NaN', '50 extra', '1e2']) {
    const { bot, calls } = setup();

    await bot.onCommand(command(`SetTracksVolume`, String(value)));

    assert.deepEqual(calls, [['message', 'Использование: !громкость <1-100> (целое число).']]);
  }
});

test('!очередь сообщает о пустой очереди даже при играющем треке', async () => {
  const { bot, calls } = setup();
  await bot.onCommand(command('SendTracksQueue'));
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
