import type { Context, Action } from './types.ts';

export default class SendCurrentTrack implements Action {
  public get name() {
    return this.constructor.name;
  }

  public get type() {
    return 'command' as const;
  }

  public get moderator() {
    return false;
  }

  public check(input: string) {
    return ['!песня', '!трек', '!track', '!song'].includes(input);
  }

  public async run(_args: unknown, { twitch, music }: Context) {
    await twitch.sendMessage(
      music.current ? `Сейчас играет: ${music.current.title}` : 'Сейчас ничего не играет.',
    );
  }
}
