import type { Context, Action } from './types.ts';

export default class SendTracksQueue implements Action {
  public get type() {
    return 'command' as const;
  }

  public get moderator() {
    return false;
  }

  public check(input: string) {
    return ['!очередь', '!queue'].includes(input);
  }

  public async run(_args: unknown, { twitch, music }: Context) {
    const tracks = music.queuedTracks;

    if (!tracks.length) {
      return await twitch.sendMessage('Очередь пуста.');
    }

    const messages: string[] = [];

    for (const [index, track] of tracks.entries()) {
      const title = (track.title || 'Название не найдено').replace(/[\r\n]+/g, ' ').trim();
      const entry = `${index + 1}# ${title}`;

      messages.push(entry);
    }

    await twitch.sendMessage(`Очередь: ${messages.join(' | ')}`);
  }
}
