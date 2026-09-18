import type { MessageFragment, UserRole } from './types.ts';

/** Эмоут в списке эмоутов сообщения от Streamer.bot. */
export type StreamerChatEmote = {
  id: string;
  type: 'Twitch' | '7TVChannel' | '7TVGlobal';
  name: string;
  startIndex: number;
  endIndex: number;
  imageUrl: string;
};

/** Значок пользователя в сообщении чата от Streamer.bot. */
export type StreamerChatBadge = {
  name: string;
  version: string;
  imageUrl: string;
  info: string;
};

/** Часть разобранного сообщения Streamer.bot: текст, эмоут Twitch/7TV или упоминание. */
export type StreamerChatPart =
  | { type: 'text'; text: string }
  | {
      type: 'emote';
      text: string;
      source: 'Twitch' | '7TVChannel' | '7TVGlobal';
      imageUrl: string;
      zeroWidth: boolean;
    }
  | {
      type: 'mention';
      userId: string;
      text: string;
      userName: string;
      userLogin: string;
    };

/** Сообщение чата Twitch в формате события Streamer.bot Twitch.ChatMessage. */
export type StreamerChatMessage = {
  user: {
    role: number;
    badges: StreamerChatBadge[];
    color: string;
    subscribed: boolean;
    subscriptionTier: string;
    monthSubscribed: number;
    id: string;
    login: string;
    name: string;
    type: 'twitch';
  };
  messageId: string;
  meta: {
    internal: boolean;
    firstMessage: boolean;
    firstMessageTimestamp: string;
    returningChatter: boolean;
    isHighlighted: boolean;
    isMe: boolean;
    isCustomReward: boolean;
    isInSharedChat: boolean;
    isSharedChatHost: boolean;
    isFromSharedChatGuest: boolean;
    createdAt: string;
    isTest: boolean;
  };
  text: string;
  emotes: StreamerChatEmote[];
  parts: StreamerChatPart[];
  broadcaster: {
    id: string;
    login: string;
    name: string;
    type: 'twitch';
  };
  isReplay: boolean;
  isInSharedChat: boolean;
  isSharedChatHost: boolean;
  isFromSharedChatGuest: boolean;
  createdAt: string;
};

/** Удалённое сообщение в формате события Streamer.bot Twitch.ChatMessageDeleted. */
export type StreamerDeletedMessage = {
  targetMessageId: string;
};

/** Коды ролей пользователя в событиях Streamer.bot. */
const STREAMERBOT_ROLE = {
  broadcaster: 1,
  moderator: 2,
  vip: 3,
  subscriber: 4,
} as const;

/** Результат подготовки сообщения: общий для всех профилей, чтобы разбирать его один раз. */
export type PreparedMessage = {
  author: string;
  text: string;
  content: MessageFragment[];
  roles: UserRole[];
  rewardId: string | null;
  isReward: boolean;
};

/** Максимум кодовых точек сообщения, попадающих на стикер. */
const MAXIMUM_TEXT_LENGTH = 220;

/** Резервный поиск идентификатора эмоута в ссылке на картинку. */
const emoteIdFromUrl = (url: string): string =>
  /(?:emoticons\/v2|emote)\/([\w-]+)\//.exec(url)?.[1] ?? '';

/**
 * Переводит готовые parts Streamer.bot во фрагменты оверлея.
 * Текст обрезается по кодовым точкам; эмоут, переходящий границу, отбрасывается.
 */
const toContent = (parts: StreamerChatPart[], ids: Map<string, string>): MessageFragment[] => {
  const content: MessageFragment[] = [];
  let remaining = MAXIMUM_TEXT_LENGTH;

  for (const part of parts) {
    if (part.type === 'emote') {
      // Zero-width эмоуты 7TV накладываются на предыдущий; оверлей этого не умеет.
      if (part.zeroWidth) continue;
      const size = Array.from(part.text).length;
      if (size > remaining) break;
      content.push({
        type: 'emote',
        provider: part.source === 'Twitch' ? 'twitch' : '7tv',
        id: ids.get(part.text) ?? emoteIdFromUrl(part.imageUrl),
        code: part.text,
        url: part.imageUrl,
      });
      remaining -= size;
    } else {
      // Текст и упоминания идут как текст: подсветку канала делает фронтенд.
      const chars = Array.from(part.text);
      if (remaining <= 0) break;
      if (chars.length > remaining) {
        content.push({ type: 'text', text: chars.slice(0, remaining).join('') });
        break;
      }
      content.push({ type: 'text', text: part.text });
      remaining -= chars.length;
    }
  }
  return content;
};

/** Переводит роль и значки Streamer.bot в роли, понятные оверлею. */
const deriveRoles = (payload: StreamerChatMessage): UserRole[] => {
  const badges = payload.user.badges.map((badge) => badge.name);
  const roles: UserRole[] = [];
  const isOwner =
    payload.user.login.toLowerCase() === payload.broadcaster.login.toLowerCase() ||
    badges.includes('broadcaster');
  if (isOwner) roles.push('channelOwner');
  if (badges.includes('moderator') || payload.user.role === STREAMERBOT_ROLE.moderator) {
    roles.push('moderator');
  }
  if (badges.includes('vip') || payload.user.role === STREAMERBOT_ROLE.vip) {
    roles.push('vip');
  }
  if (
    !isOwner &&
    (badges.includes('subscriber') ||
      payload.user.subscribed ||
      payload.user.role === STREAMERBOT_ROLE.subscriber)
  ) {
    roles.push('subscriber');
  }
  return roles;
};

/** Разбирает сообщение Streamer.bot: фрагменты, роли и признак награды. */
export const prepareMessage = (payload: StreamerChatMessage): PreparedMessage => {
  // Идентификаторы эмоутов Streamer.bot отдаёт отдельным списком, parts — без них.
  const ids = new Map(payload.emotes.map((emote) => [emote.name, emote.id]));
  return {
    author: payload.user.name || payload.user.login,
    text: payload.text,
    content: toContent(payload.parts, ids),
    roles: deriveRoles(payload),
    rewardId: null,
    isReward: payload.meta.isCustomReward,
  };
};
