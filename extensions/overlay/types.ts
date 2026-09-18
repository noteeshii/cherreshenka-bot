/** Состояние чата, которое видит настройка оверлея. */
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type StickerEffect = 'none' | 'foil' | 'holographic' | 'polychrome' | 'gold';

export type UserRole = 'channelOwner' | 'moderator' | 'vip' | 'subscriber' | 'follower';

export type MessageFragment =
  | { type: 'text'; text: string }
  | {
      type: 'emote';
      provider: 'twitch' | '7tv';
      id: string;
      code: string;
      url: string;
      width?: number;
      height?: number;
    };

export type OverlaySettings = {
  channel: string;
  lifetime: number;
  rewardMode: boolean;
  safeTop: number;
  safeRight: number;
  safeBottom: number;
  safeLeft: number;
  safeAreaExcluded: boolean;
};

export type Sticker = {
  id: number;
  syncId: string;
  author: string;
  text: string;
  content?: MessageFragment[];
  color: string;
  x: number;
  y: number;
  rotation: number;
  leaving: boolean;
  pinned: boolean;
  effect: StickerEffect;
  roles: UserRole[];
  customRewardId?: string | null;
};

/** Стикер, ожидающий свободного места на доске. */
export type QueuedSticker = {
  syncId: string;
  author: string;
  text: string;
  content?: MessageFragment[];
  roles: UserRole[];
  effect: StickerEffect;
  pinned: boolean;
  customRewardId: string | null;
  lifetimeMs: number;
  forceExpiry: boolean;
};

/** Данные для создания стикера: из сообщения чата или демо-режима. */
export type StickerInput = {
  messageId?: string;
  author: string;
  text: string;
  content?: MessageFragment[];
  roles?: UserRole[];
  pinned?: boolean;
  customRewardId?: string | null;
  lifetimeMs?: number;
  forceExpiry?: boolean;
};

/** Действие контроллера над стикером. */
export type StickerAction = {
  action: 'pin' | 'move' | 'remove';
  stickerId: string;
  pinned?: boolean;
  x?: number;
  y?: number;
};

/** Профиль в том виде, в каком его присылает фронтенд оверлея. */
export type ProfilePayload = {
  id?: string;
  name?: string;
  updatedAt?: number;
  settings?: Partial<OverlaySettings>;
};

export type Profile = {
  id: string;
  name: string;
  updatedAt: number;
  settings: OverlaySettings;
};

export type ProfileSummary = {
  id: string;
  name: string;
  updatedAt: number;
  settings: OverlaySettings;
  clientCount: number;
};

export type ClientMessage =
  | { type: 'hello'; role: string; profile?: ProfilePayload }
  | { type: 'select-profile'; profileId?: string }
  | { type: 'profile-update'; profile?: ProfilePayload }
  | { type: 'connect-chat'; profile?: ProfilePayload }
  | { type: 'sticker-action'; profileId?: string; action?: StickerAction }
  | { type: 'demo'; profileId?: string };

export type ServerMessage =
  | { type: 'profile-list'; profiles: ProfileSummary[] }
  | { type: 'profile'; profile: ProfileSummary }
  | { type: 'chat-status'; profileId: string; status: ConnectionStatus }
  | { type: 'stickers'; profileId: string; stickers: Sticker[]; queueSize: number }
  | { type: 'error'; message: string };
