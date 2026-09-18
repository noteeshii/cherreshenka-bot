import { randomUUID } from 'node:crypto';

import type {
  OverlaySettings,
  QueuedSticker,
  Sticker,
  StickerAction,
  StickerEffect,
  StickerInput,
} from './types.ts';

const MAXIMUM_VISIBLE_STICKERS = 10;
const STICKER_GAP = 2;
const LEAVE_ANIMATION_MS = 900;
const RANDOM_ATTEMPTS = 80;

const COLORS = ['#ffd84d', '#ff8fb8', '#8de5cf', '#a9c8ff', '#c8a8ff', '#ffab76'];

/** Шансы редких эффектов: проверяются по нарастающей от броска Math.random(). */
const EFFECT_CHANCES: Array<[StickerEffect, number]> = [
  ['polychrome', 0.01],
  ['holographic', 0.03],
  ['gold', 0.05],
  ['foil', 0.07],
];

const rollEffect = (): StickerEffect => {
  const roll = Math.random();
  let total = 0;
  for (const [effect, chance] of EFFECT_CHANCES) {
    total += chance;
    if (roll < total) return effect;
  }
  return 'none';
};

type BoardOptions = {
  profileId: string;
  settings: () => OverlaySettings;
  onChange: () => void;
};

type Footprint = { width: number; height: number };

/** Доска стикеров одного профиля: позиции, очередь и таймеры жизни. */
export class StickerBoard {
  private readonly profileId: string;
  private readonly settings: () => OverlaySettings;
  private readonly onChange: () => void;
  private readonly timers = new Set<NodeJS.Timeout>();
  private stickers: Sticker[] = [];
  private queue: QueuedSticker[] = [];
  private nextId = 1;

  constructor(options: BoardOptions) {
    this.profileId = options.profileId;
    this.settings = options.settings;
    this.onChange = options.onChange;
  }

  public get items(): Sticker[] {
    return this.stickers;
  }

  public get queuedCount(): number {
    return this.queue.length;
  }

  /** Ставит стикер в очередь или сразу показывает на свободном месте. */
  public add(input: StickerInput): void {
    const queued: QueuedSticker = {
      syncId: `${this.profileId}:${input.messageId || randomUUID()}`,
      author: input.author,
      text: Array.from(input.text).slice(0, 220).join(''),
      content: input.content,
      roles: input.roles ?? [],
      effect: rollEffect(),
      pinned: input.pinned === true,
      customRewardId: input.customRewardId || null,
      lifetimeMs: input.lifetimeMs ?? this.settings().lifetime * 1000,
      forceExpiry: input.forceExpiry === true,
    };

    if (this.stickers.length >= MAXIMUM_VISIBLE_STICKERS || !this.show(queued)) {
      this.queue.push(queued);
      this.onChange();
    }
  }

  /** Обрабатывает действия контроллера: закрепление, перемещение, удаление. */
  public applyAction(action: StickerAction): void {
    const sticker = this.findBySyncId(action.stickerId);
    if (!sticker) return;
    if (action.action === 'pin') {
      if (action.pinned) {
        sticker.pinned = true;
        sticker.leaving = false;
        this.onChange();
      } else {
        sticker.pinned = false;
        this.beginLeaving(sticker.syncId);
      }
    } else if (action.action === 'move') {
      const x = Number(action.x);
      const y = Number(action.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      sticker.x = x;
      sticker.y = y;
      this.onChange();
    } else if (action.action === 'remove') {
      this.remove(sticker.syncId);
    }
  }

  /** Убирает стикер удалённого сообщения, показывая анимацию ухода. */
  public removeByMessageId(messageId: string): void {
    const syncId = `${this.profileId}:${messageId}`;
    const wasVisible = this.findBySyncId(syncId) !== undefined;
    if (wasVisible) {
      this.beginLeaving(syncId);
    }
    const queueLength = this.queue.length;
    this.queue = this.queue.filter((item) => item.syncId !== syncId);
    if (!wasVisible && this.queue.length !== queueLength) {
      this.onChange();
    }
  }

  /** Снимает с доски все стикеры конкретной награды (например, при повторном выкупе). */
  public removeByCustomRewardId(rewardId: string): void {
    const before = this.stickers.length + this.queue.length;
    this.stickers = this.stickers.filter((sticker) => sticker.customRewardId !== rewardId);
    this.queue = this.queue.filter((sticker) => sticker.customRewardId !== rewardId);
    if (this.stickers.length + this.queue.length !== before) {
      this.onChange();
    }
  }

  /** Сбрасывает доску; вызывается при смене режима безопасной зоны профиля. */
  public reset(): void {
    this.stickers = [];
    this.queue = [];
    this.clearTimers();
  }

  /** Отменяет таймеры; вызывается при закрытии оверлея. */
  public dispose(): void {
    this.clearTimers();
  }

  private findBySyncId(syncId: string): Sticker | undefined {
    return this.stickers.find((sticker) => sticker.syncId === syncId);
  }

  private show(queued: QueuedSticker): boolean {
    const position = this.findPosition();
    if (!position) return false;
    const id = this.nextId++;
    const sticker: Sticker = {
      id,
      syncId: queued.syncId,
      author: queued.author,
      text: queued.text,
      content: queued.content,
      color: COLORS[id % COLORS.length],
      x: position.x,
      y: position.y,
      rotation: -6 + Math.random() * 12,
      leaving: false,
      pinned: queued.pinned,
      effect: queued.effect,
      roles: queued.roles,
      customRewardId: queued.customRewardId,
    };
    this.stickers.push(sticker);
    this.onChange();

    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const current = this.findBySyncId(sticker.syncId);
      if (current && (queued.forceExpiry || !current.pinned)) {
        this.beginLeaving(sticker.syncId);
      }
    }, queued.lifetimeMs);
    this.timers.add(timer);
    return true;
  }

  private beginLeaving(syncId: string): void {
    const sticker = this.findBySyncId(syncId);
    if (!sticker || sticker.leaving) return;
    sticker.leaving = true;
    this.onChange();
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.remove(syncId);
    }, LEAVE_ANIMATION_MS);
    this.timers.add(timer);
  }

  private remove(syncId: string): void {
    if (!this.findBySyncId(syncId)) return;
    this.stickers = this.stickers.filter((item) => item.syncId !== syncId);
    this.releaseQueue();
    this.onChange();
  }

  private releaseQueue(): void {
    while (this.stickers.length < MAXIMUM_VISIBLE_STICKERS) {
      const next = this.queue.shift();
      if (!next) break;
      if (!this.show(next)) {
        this.queue.unshift(next);
        break;
      }
    }
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  /** Габарит стикера: вне безопасной зоны стикеры крупнее. */
  private getStickerFootprint(): Footprint {
    const settings = this.settings();
    const horizontalScale = settings.safeAreaExcluded
      ? 1
      : Math.max(0.2, (100 - settings.safeLeft - settings.safeRight) / 100);
    const verticalScale = settings.safeAreaExcluded
      ? 1
      : Math.max(0.2, (100 - settings.safeTop - settings.safeBottom) / 100);
    return {
      width: Math.min(96, 16 / horizontalScale),
      height: Math.min(96, 24 / verticalScale),
    };
  }

  private positionIsAllowed(x: number, y: number): boolean {
    const settings = this.settings();
    if (!settings.safeAreaExcluded) return true;
    return (
      x < settings.safeLeft ||
      x > 100 - settings.safeRight ||
      y < settings.safeTop ||
      y > 100 - settings.safeBottom
    );
  }

  private positionOverlaps(x: number, y: number, footprint: Footprint): boolean {
    return this.stickers.some((sticker) => {
      if (sticker.leaving) return false;
      return !(
        x + footprint.width + STICKER_GAP <= sticker.x ||
        x >= sticker.x + footprint.width + STICKER_GAP ||
        y + footprint.height + STICKER_GAP <= sticker.y ||
        y >= sticker.y + footprint.height + STICKER_GAP
      );
    });
  }

  /** Ищет свободное место: случайные точки плюс полная сетка, в случайном порядке. */
  private findPosition(): { x: number; y: number } | undefined {
    const footprint = this.getStickerFootprint();
    const maximumX = Math.max(0, 100 - footprint.width);
    const maximumY = Math.max(0, 100 - footprint.height);
    const candidates: Array<{ x: number; y: number }> = [];

    for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
      candidates.push({ x: Math.random() * maximumX, y: Math.random() * maximumY });
    }
    for (let y = 0; y <= maximumY; y += footprint.height + STICKER_GAP) {
      for (let x = 0; x <= maximumX; x += footprint.width + STICKER_GAP) {
        candidates.push({ x, y });
      }
    }

    candidates.sort(() => Math.random() - 0.5);
    return candidates.find(
      ({ x, y }) => this.positionIsAllowed(x, y) && !this.positionOverlaps(x, y, footprint),
    );
  }
}
