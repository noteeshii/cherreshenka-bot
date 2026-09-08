import { Twitch, Music, Logger } from '#extensions';

export interface Context {
  twitch: Twitch;
  music: Music;
  logger: Logger;
}

export interface Action {
  check(input: string): boolean;
  run(args: unknown, context: Context): Promise<void>;
}
