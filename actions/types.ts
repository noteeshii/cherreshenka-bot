import type { StreamerbotEventData } from '@streamerbot/client';

import { Twitch, Music, Logger, Storage } from '#extensions';

export interface Context {
  twitch: Twitch;
  music: Music;
  logger: Logger;
  storage: Storage;
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
