import type { Context, Action } from './types.ts';

export default class SendCurrentTrack implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run(_args: unknown, { twitch, music }: Context) {
    await twitch.sendMessage(
      music.current ? `Сейчас играет: ${music.current.title}` : 'Сейчас ничего не играет.',
    );
  }
}
