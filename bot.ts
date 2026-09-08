import type { StreamerbotEventData } from '@streamerbot/client';

import type { Music, Twitch, Config, Logger } from '#extensions';
import {
  type Action,
  PauseCurrentTrack,
  ResumeCurrentTrack,
  SendCurrentTrack,
  SendTracksQueue,
  SetTracksVolume,
  SkipCurrentTrack,
  AddTrackToQueue,
} from '#actions';

import { parseChatMessage } from './chat-message.ts';
import { parseCommand } from './commands.ts';
import type { ChatMessage } from './commands.ts';

type RewardEvent = StreamerbotEventData<'Twitch.RewardRedemption'>;

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
  private readonly actions: Action[];

  private readonly seenEvents = new Map<string, number>();
  private readonly userCooldowns = new Map<string, number>();
  private readonly twitch: Twitch;
  private readonly music: Music;
  private readonly config: Config;
  private readonly logger: Pick<Logger, 'info'>;

  constructor(twitch: Twitch, config: Config, music: Music, logger: Pick<Logger, 'info'>) {
    this.twitch = twitch;
    this.music = music;
    this.config = config;
    this.logger = logger;

    this.actions = [
      new PauseCurrentTrack(),
      new ResumeCurrentTrack(),
      new SendCurrentTrack(),
      new SendTracksQueue(),
      new SetTracksVolume(),
      new SkipCurrentTrack(),
      new AddTrackToQueue(this.config),
    ];
  }

  async onChat(payload: unknown): Promise<void> {
    const message = parseChatMessage(payload);
    if (!message) {
      this.trace(
        'Пропуск: неизвестный формат ChatMessage или отсутствуют текст, ID сообщения либо ID пользователя.',
      );
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

    const action = this.actions.find((action) => {
      return action.type === 'command' && action.check(parsed.name);
    });

    if (!action || (action.moderator && !isModerator(message))) {
      this.trace(!action ? 'Пропуск: неизвестная команда.' : 'Пропуск: нет прав модератора.');
      return;
    }
    if (this.isDuplicateEvent(`chat:${message.msgId}`)) {
      this.trace('Пропуск: повторное событие.');
      return;
    }
    if (!action.moderator && this.isOnCooldown(message.userId)) {
      this.trace('Пропуск: cooldown 3 секунды.');
      return;
    }

    this.trace(`Выполнение ${parsed.name}`);

    await action.run(parsed.args, { twitch: this.twitch, music: this.music });

    this.trace(`Обработчик ${parsed.name} завершён.`);
  }

  async onReward(reward: RewardEvent): Promise<void> {
    if (!reward?.id || !reward.reward?.id || reward.status?.toLowerCase() === 'canceled') {
      return;
    }

    const action = this.actions.find((action) => {
      return action.type === 'reward' && action.check(reward.reward.id);
    });

    if (!action || this.isDuplicateEvent(`reward:${reward.id}`)) {
      return;
    }

    await action.run(reward, { twitch: this.twitch, music: this.music });
  }

  private shouldIgnoreMessage(message: ChatMessage): boolean {
    const isBotMessage = message.username?.toLowerCase() === this.config.channel.botLogin;
    const isOtherChannel =
      this.config.channel.name !== '' &&
      message.channel?.toLowerCase() !== this.config.channel.name;

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
    this.logger.info(`[Chat] ${message}`);
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
