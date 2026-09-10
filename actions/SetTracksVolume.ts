import type { Context, Action } from './types.ts';

export default class SetTracksVolume implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run({ message: args }: { message: string }, { music, twitch }: Context) {
    if (!/^(?:[1-9][0-9]?|100)$/.test(args.trim())) {
      return await twitch.sendMessage('Использование: !громкость <1-100> (целое число).');
    }

    await music.setVolume(Number(args.trim()));
  }
}
