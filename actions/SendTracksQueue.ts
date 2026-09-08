import type { Context, Action } from './types.ts';

export default class SendTracksQueue implements Action {
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
    const messages: string[] = [];

    for (const [index, track] of tracks.entries()) {
      const title = (track.title || 'Название не найдено').replace(/[\r\n]+/g, ' ').trim();
      const entry = `${index + 1}# ${title}`;

      messages.push(entry);
    }

    await twitch.sendMessage(`Очередь: ${messages.join(' | ')}`)
      .catch(logger.error.bind(logger));
  }
}
