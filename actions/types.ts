import { Twitch, Music } from '#extensions';

export interface Context {
  twitch: Twitch;
  music: Music;
}

export interface Action {
  name: string;
  type: 'command' | 'reward';
  check(input: string): boolean;
  run(args: unknown, context: Context): Promise<void>;
}
