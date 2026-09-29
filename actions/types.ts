import type { StreamerbotEventData } from '@streamerbot/client';

import { Twitch, Music, Logger, Storage, Overlay } from '#extensions';

export interface Context {
  twitch: Twitch;
  music: Music;
  logger: Logger;
  storage: Storage;
  overlay: Overlay;
}

export interface Action {
  check(input: string): boolean;
  run(args: unknown, context: Context): Promise<void>;
}

export type RewardEvent = StreamerbotEventData<'Twitch.RewardRedemption'>;
export type CommandEvent = {
  id: string;
  name: string;
  command: string;
  message: string;
  user: {
    id: string;
    name: string;
    role: number;
  };
};

export type PermanentUserStorage = {
  killsCount?: number;
  shootsCount?: number;
  deathsCount?: number;
  shootsSelfCount?: number;
  killsSelfCount?: number;
};

export type TemporaryUserStorage = {
  countBasicStickerRedeemed?: number;
  countPinnedStickerRedeemed?: number;
};
