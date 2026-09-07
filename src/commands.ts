import type { StreamerbotEventData } from '@streamerbot/client';
import type { Twitch } from './twitch.ts';
import type { Music } from './music/queue.ts';

export type ChatMessage = StreamerbotEventData<'Twitch.ChatMessage'>['message'];

export interface Command {
  moderator?: boolean;
  run(args: string, message: ChatMessage): Promise<void>;
}

export function parseCommand(text: string) {
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return undefined;
  return { name: match[1].toLowerCase(), args: match[2] ?? '' };
}

export function createCommands(twitch: Twitch, music: Music): Map<string, Command> {
  return new Map<string, Command>([
    [
      '!песня',
      {
        run: () =>
          twitch.sendMessage(
            music.current
              ? `Сейчас играет: ${[...music.current.title].slice(0, 450).join('')}`
              : 'Сейчас ничего не играет.',
          ),
      },
    ],
    ['!пауза', { moderator: true, run: () => music.pause() }],
    ['!продолжить', { moderator: true, run: () => music.resume() }],
    [
      '!громкость',
      {
        moderator: true,
        run: async (args) => {
          if (!/^(?:[1-9][0-9]?|100)$/.test(args.trim())) {
            await twitch.sendMessage('Использование: !громкость <1-100> (целое число).');
            return;
          }
          await music.setVolume(Number(args.trim()));
        },
      },
    ],
    ['!пропустить', { moderator: true, run: () => music.skip() }],
  ]);
}
