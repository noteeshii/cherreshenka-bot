import type { Context, Action } from './types.ts';

export default class SendTracksQueueSize implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run(_args: unknown, { twitch, music, logger }: Context) {
    const tracks = music.queuedTracks;

    if (!tracks.length) {
      return await twitch.sendMessage('Очередь пуста.')
        .catch(logger.error.bind(logger));
    }

    await twitch.sendMessage(`Количество треков в очереди: ${tracks.length}.`)
      .catch(logger.error.bind(logger));
  }
}
