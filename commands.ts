import type { ChatMessage } from './chat-message.ts';

export type { ChatMessage } from './chat-message.ts';

export interface Command {
  moderator?: boolean;
  run(args: string, message: ChatMessage): Promise<void>;
}

export function parseCommand(text: string) {
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return undefined;
  return { name: match[1].toLowerCase(), args: match[2] ?? '' };
}
