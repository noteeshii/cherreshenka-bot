import type { Context, Action } from './types.ts';

export default class LikeCurrentTrack implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run(_args: unknown, { music, twitch, logger }: Context) {
    try {
      await music.likeCurrent();
    } catch(err) {
      if (err === 'Track is not exists') {
        await twitch.sendMessage('Сейчас ничего не играет.');
        return;
      }
      if (err === 'Track source is not yandex') {
        await twitch.sendMessage('Лайкать можно только треки из Яндекс.Музыки.');
        return;
      }

      logger.error(String(err));
    }
  }
}
