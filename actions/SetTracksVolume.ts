import type { Context, Action } from './types.ts';

export default class SetTracksVolume implements Action {
  public get name() {
    return this.constructor.name;
  }

  public get type() {
    return 'command' as const;
  }

  public get moderator() {
    return true;
  }

  public check(input: string) {
    return ['!громкость', '!volume'].includes(input);
  }

  public async run(args: string, { music, twitch }: Context) {
    if (!/^(?:[1-9][0-9]?|100)$/.test(args.trim())) {
      return await twitch.sendMessage('Использование: !громкость <1-100> (целое число).');
    }

    await music.setVolume(Number(args.trim()));
  }
}
