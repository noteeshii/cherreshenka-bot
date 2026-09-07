import type { StreamerbotEventData } from '@streamerbot/client';
import { createCommands, parseCommand } from './commands.ts';
import type { ChatMessage, Command } from './commands.ts';
import type { Config } from './config.ts';
import type { Twitch } from './twitch.ts';
import type { Music } from './music/queue.ts';

type ChatEvent = StreamerbotEventData<'Twitch.ChatMessage'>;
type RewardEvent = StreamerbotEventData<'Twitch.RewardRedemption'>;
type RewardHandler = (reward: RewardEvent) => Promise<void>;

const EVENT_RETENTION_MS = 10 * 60 * 1000;
const MAX_TRACKED_EVENTS = 10_000;
const COMMAND_COOLDOWN_MS = 3000;

function removeExpiredEntries(entries: Map<string, number>, now: number): void {
  for (const [key, expiresAt] of entries) {
    if (expiresAt <= now) {
      entries.delete(key);
    }
  }
}

function isModerator(message: ChatMessage): boolean {
  return (
    message.badges?.some((badge) => badge.name === 'broadcaster' || badge.name === 'moderator') ??
    false
  );
}

export class Bot {
  readonly commands: Map<string, Command>;
  readonly rewards = new Map<string, RewardHandler>();

  private readonly seenEvents = new Map<string, number>();
  private readonly userCooldowns = new Map<string, number>();
  private readonly config: Config;

  constructor(twitch: Twitch, config: Config, music: Music) {
    this.config = config;
    this.commands = createCommands(twitch, music);

    if (config.musicRewardId) {
      this.rewards.set(config.musicRewardId, async (reward) => {
        try {
          music.enqueue(reward.user_input);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Не удалось добавить трек.';
          await twitch.sendMessage(`@${reward.user_login}, ${message}`);
        }
      });
    }
  }

  async onChat({ message }: ChatEvent): Promise<void> {
    if (!message || typeof message.message !== 'string' || !message.msgId || !message.userId) {
      this.trace('Пропуск: событие не содержит message, msgId или userId.');
      return;
    }
    if (this.shouldIgnoreMessage(message)) {
      return;
    }

    const parsed = parseCommand(message.message);
    if (!parsed) {
      return;
    }

    this.trace(
      `Получена команда ${parsed.name}; канал=${message.channel}; пользователь=${message.username}`,
    );
    const command = this.commands.get(parsed.name);
    if (!command || (command.moderator && !isModerator(message))) {
      this.trace(!command ? 'Пропуск: неизвестная команда.' : 'Пропуск: нет прав модератора.');
      return;
    }
    if (this.isDuplicateEvent(`chat:${message.msgId}`)) {
      this.trace('Пропуск: повторное событие.');
      return;
    }
    if (!command.moderator && this.isOnCooldown(message.userId)) {
      this.trace('Пропуск: cooldown 3 секунды.');
      return;
    }

    this.trace(`Выполнение ${parsed.name}`);
    await command.run(parsed.args, message);
    this.trace(`Обработчик ${parsed.name} завершён.`);
  }

  async onReward(reward: RewardEvent): Promise<void> {
    if (!reward?.id || !reward.reward?.id || reward.status?.toLowerCase() === 'canceled') {
      return;
    }

    const handler = this.rewards.get(reward.reward.id);
    if (!handler || this.isDuplicateEvent(`reward:${reward.id}`)) {
      return;
    }

    await handler(reward);
  }

  private shouldIgnoreMessage(message: ChatMessage): boolean {
    const isBotMessage = message.username?.toLowerCase() === this.config.botLogin;
    const isOtherChannel =
      this.config.channel !== '' && message.channel?.toLowerCase() !== this.config.channel;

    const reason = message.internal
      ? 'внутреннее сообщение'
      : message.isTest
        ? 'тестовое сообщение'
        : isBotMessage
          ? 'сообщение от Bot Account'
          : isOtherChannel
            ? `канал ${message.channel} не совпадает с TWITCH_CHANNEL=${this.config.channel}`
            : undefined;
    if (reason) this.trace(`Пропуск: ${reason}.`);
    return reason !== undefined;
  }

  private trace(message: string): void {
    if (this.config.debugChat) console.info(`[Chat] ${message}`);
  }

  // Reserve the event before awaiting a handler to prevent concurrent duplicates.
  private isDuplicateEvent(key: string): boolean {
    const now = Date.now();
    removeExpiredEntries(this.seenEvents, now);

    if (this.seenEvents.has(key)) {
      return true;
    }
    if (this.seenEvents.size >= MAX_TRACKED_EVENTS) {
      const oldestKey = this.seenEvents.keys().next().value;
      if (oldestKey !== undefined) {
        this.seenEvents.delete(oldestKey);
      }
    }

    this.seenEvents.set(key, now + EVENT_RETENTION_MS);
    return false;
  }

  private isOnCooldown(userId: string): boolean {
    const now = Date.now();
    removeExpiredEntries(this.userCooldowns, now);

    if (this.userCooldowns.has(userId)) {
      return true;
    }

    this.userCooldowns.set(userId, now + COMMAND_COOLDOWN_MS);
    return false;
  }
}
