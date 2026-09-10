import type { Context, Action } from './types.ts';

export default class SendTracksQueue implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run(_args: unknown, { twitch, music, logger }: Context) {
    const tracks = music.queuedTracks.slice(0, 10);

    if (!tracks.length) {
      return await twitch.sendMessage('Очередь пуста.').catch(logger.error.bind(logger));
    }

    const messages: string[] = [];
    const prefix = 'Очередь: ';
    const separator = ' | ';
    const messageLimit = 500;
    const maxIdx = tracks.length - 1;
    let messageSize = prefix.length;

    for (const [index, track] of tracks.entries()) {
      const title = (track.title || 'Название не найдено').replace(/[\r\n]+/g, ' ').trim();
      const entry = `${index + 1}# ${title}`;

      messageSize += entry.length;

      if (index < maxIdx) {
        messageSize += separator.length;
      }

      if (messageSize >= messageLimit) {
        continue;
      }

      messages.push(entry);
    }

    await twitch
      .sendMessage(`${prefix}${messages.join(separator)}`)
      .catch(logger.error.bind(logger));
  }
}
