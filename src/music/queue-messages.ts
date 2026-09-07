import type { QueuedTrack } from './queue.ts';

export function queueMessages(tracks: readonly QueuedTrack[]): string[] {
  if (tracks.length === 0) return ['Очередь пуста.'];

  const messages: string[] = [];
  const prefix = 'Очередь: ';
  let message = prefix;
  for (const [index, track] of tracks.entries()) {
    const title = (track.title || track.url).replace(/[\r\n]+/g, ' ').trim();
    const characters = [...title];
    const label = characters.length > 150 ? characters.slice(0, 149).join('') + '…' : title;
    const entry = `${index + 1}. ${label}`;
    const separator = message === prefix ? '' : ' | ';
    if ([...message, ...separator, ...entry].length > 500) {
      messages.push(message);
      message = prefix + entry;
    } else {
      message += separator + entry;
    }
  }
  messages.push(message);
  return messages;
}
