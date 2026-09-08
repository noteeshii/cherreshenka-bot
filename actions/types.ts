import { Twitch, Music } from '#extensions';

export interface Context {
  twitch: Twitch;
  music: Music;
}

export interface Action {
  type: 'command' | 'reward';
  check(input: string): boolean;
  moderator: boolean;
  run(args: unknown, context: Context): Promise<void>;
}
