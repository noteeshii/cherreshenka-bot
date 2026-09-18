import { StickerBoard } from './StickerBoard.ts';
import type { OverlaySettings, Profile, ProfilePayload } from './types.ts';

const DEFAULT_SETTINGS: OverlaySettings = {
  channel: '',
  lifetime: 12,
  rewardMode: false,
  safeTop: 8,
  safeRight: 8,
  safeBottom: 8,
  safeLeft: 8,
  safeAreaExcluded: false,
};

const clampSetting = (value: unknown, fallback: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Number(value))) : fallback;

/** Приводит присланные настройки к валидному виду, дополняя их текущими значениями. */
export const sanitizeSettings = (
  value: Partial<OverlaySettings> | undefined,
  current: OverlaySettings = DEFAULT_SETTINGS,
): OverlaySettings => ({
  channel:
    typeof value?.channel === 'string'
      ? value.channel.trim().toLowerCase().replace(/^[@#]/, '')
      : current.channel,
  lifetime:
    value && Number.isFinite(value.lifetime)
      ? Math.max(2, Number(value.lifetime))
      : current.lifetime,
  rewardMode: typeof value?.rewardMode === 'boolean' ? value.rewardMode : current.rewardMode,
  safeTop: clampSetting(value?.safeTop, current.safeTop),
  safeRight: clampSetting(value?.safeRight, current.safeRight),
  safeBottom: clampSetting(value?.safeBottom, current.safeBottom),
  safeLeft: clampSetting(value?.safeLeft, current.safeLeft),
  safeAreaExcluded:
    typeof value?.safeAreaExcluded === 'boolean'
      ? value.safeAreaExcluded
      : current.safeAreaExcluded,
});

export type BoardFactory = (profile: Profile) => StickerBoard;

export type ProfileUpsert = {
  profile: Profile;
  /** Профиль только что создан. */
  created: boolean;
  /** Имя или настройки профиля обновлены. */
  changed: boolean;
  /** Доска сброшена из-за смены режима безопасной зоны. */
  boardReset: boolean;
};

type ProfileRecord = { profile: Profile; board: StickerBoard };

/** Хранилище профилей оверлея: создание, обновление и поиск по каналу. */
export class ProfileStore {
  private readonly records = new Map<string, ProfileRecord>();
  private readonly createBoard: BoardFactory;

  constructor(createBoard: BoardFactory) {
    this.createBoard = createBoard;
  }

  public get(id: string): Profile | undefined {
    return this.records.get(id)?.profile;
  }

  public all(): Profile[] {
    return [...this.records.values()].map((record) => record.profile);
  }

  /** Доска профиля; профиль ожидается существующим. */
  public board(profile: Profile): StickerBoard {
    return this.records.get(profile.id)!.board;
  }

  public findByChannel(channel: string): Profile[] {
    return this.all().filter((profile) => profile.settings.channel === channel);
  }

  private create(payload: ProfilePayload): ProfileUpsert {
    const profile: Profile = {
      id: payload.id as string,
      name: payload.name?.trim() || 'Новый профиль',
      updatedAt: Number(payload.updatedAt) || Date.now(),
      settings: sanitizeSettings(payload.settings),
    };
    this.records.set(profile.id, { profile, board: this.createBoard(profile) });
    return { profile, created: true, changed: true, boardReset: false };
  }

  /**
   * Создаёт или обновляет профиль по данным клиента.
   * Возвращает null, если payload отсутствует, у него нет id либо профиль не новее существующего.
   */
  public upsert(payload: ProfilePayload | undefined): ProfileUpsert | null {
    if (!payload) return null;
    const id = typeof payload.id === 'string' ? payload.id : undefined;
    if (!id) return null;
    const existing = this.records.get(id);
    if (!existing) return this.create(payload);

    const incomingUpdatedAt = Number(payload.updatedAt) || 0;
    if (incomingUpdatedAt <= existing.profile.updatedAt) {
      return { profile: existing.profile, created: false, changed: false, boardReset: false };
    }

    const settings = sanitizeSettings(payload.settings, existing.profile.settings);
    const boardReset = settings.safeAreaExcluded !== existing.profile.settings.safeAreaExcluded;
    existing.profile.name = payload.name?.trim() || existing.profile.name;
    existing.profile.updatedAt = incomingUpdatedAt || Date.now();
    existing.profile.settings = settings;
    if (boardReset) existing.board.reset();
    return { profile: existing.profile, created: false, changed: true, boardReset };
  }
}
