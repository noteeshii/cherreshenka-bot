import { Twitch, Music } from '#extensions';

export interface Context {
  twitch: Twitch;
  music: Music;
}

export interface Action {
  check(input: string): boolean;
  run(args: unknown, context: Context): Promise<void>;
}
