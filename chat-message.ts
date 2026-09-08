export interface ChatMessage {
  message: string;
  msgId: string;
  userId: string;
  username: string;
  channel: string;
  internal: boolean;
  isTest: boolean;
  badges: { name: string }[];
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// The client package still declares the legacy nested message schema.
// Current schema: https://docs.streamer.bot/api/websocket/events/twitch/chat-message
export function parseChatMessage(payload: unknown): ChatMessage | undefined {
  const data = object(payload);
  const legacy = object(data.message);
  const modern = typeof data.text === 'string';
  const user = object(data.user);
  const meta = object(data.meta);
  const broadcaster = object(data.broadcaster);

  const message = modern ? data.text : legacy.message;
  const msgId = text(modern ? data.messageId : legacy.msgId);
  const userId = text(modern ? user.id : legacy.userId);
  if (typeof message !== 'string' || !msgId || !userId) return undefined;

  const rawBadges = modern ? user.badges : legacy.badges;
  const badges = Array.isArray(rawBadges)
    ? rawBadges.map((badge) => ({ name: text(object(badge).name) })).filter((badge) => badge.name)
    : [];

  return {
    message,
    msgId,
    userId,
    username: text(modern ? user.login : legacy.username),
    channel: text(modern ? broadcaster.login : legacy.channel),
    internal: (modern ? meta.internal : legacy.internal) === true,
    isTest: modern ? data.isTest === true || meta.isTest === true : legacy.isTest === true,
    badges,
  };
}
