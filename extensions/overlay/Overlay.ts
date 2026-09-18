import { WebSocket, WebSocketServer } from 'ws';

import type Logger from '../logger.ts';
import { prepareMessage } from './incoming.ts';
import type { StreamerChatMessage, StreamerDeletedMessage } from './incoming.ts';
import { ProfileStore } from './ProfileStore.ts';
import { StickerBoard } from './StickerBoard.ts';
import type {
  ClientMessage,
  ConnectionStatus,
  Profile,
  ProfilePayload,
  ProfileSummary,
  ServerMessage,
  StickerAction,
  UserRole,
} from './types.ts';

// Награда канала, стикер от которой закрепляется на 10 минут в режиме наград
// (обычная — f34391e1-6624-4239-9ab8-99ee935728f3). Событие Twitch.ChatMessage
// от Streamer.bot не передаёт идентификатор награды, поэтому закрепление пока
// не срабатывает и заработает, когда id появится в событии.
const PINNED_REWARD_ID = '43c13c5b-dc6b-4b03-993f-e2321e663734';
const PINNED_REWARD_LIFETIME_MS = 10 * 60 * 1000;

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 17891;

const DEMO_MESSAGES: Array<{ author: string; text: string; roles: UserRole[] }> = [
  { author: 'pixel_fox', text: 'Это выглядит потрясающе!', roles: ['moderator'] },
  { author: 'mooncat', text: 'Ещё один раунд? 👀', roles: ['vip'] },
  { author: 'quiet_wizard', text: 'GG! Вот это концовка', roles: ['subscriber'] },
];

/** Клиент сессии: обычный WebSocket с ролью и привязкой к профилю. */
type SessionClient = WebSocket & { role: string; profileId: string | null };

export type OverlayOptions = {
  /** Адрес, на котором слушает сервер синхронизации. */
  connection?: { host?: string; port?: number };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toProfilePayload = (value: unknown): ProfilePayload | undefined =>
  isRecord(value) ? (value as ProfilePayload) : undefined;

const parseStickerAction = (raw: Record<string, unknown>): StickerAction | undefined => {
  if (raw.action !== 'pin' && raw.action !== 'move' && raw.action !== 'remove') return undefined;
  if (typeof raw.stickerId !== 'string') return undefined;
  return {
    action: raw.action,
    stickerId: raw.stickerId,
    pinned: raw.pinned === true,
    x: typeof raw.x === 'number' ? raw.x : undefined,
    y: typeof raw.y === 'number' ? raw.y : undefined,
  };
};

/** Разбирает сообщение клиента, не доверяя его содержимому. */
const parseClientMessage = (raw: unknown): ClientMessage => {
  const message: unknown = JSON.parse(String(raw));
  if (!isRecord(message)) throw new Error('Сообщение не является объектом');
  switch (message.type) {
    case 'hello':
      return {
        type: 'hello',
        role: optionalString(message.role) ?? 'unknown',
        profile: toProfilePayload(message.profile),
      };
    case 'select-profile':
      return { type: 'select-profile', profileId: optionalString(message.profileId) };
    case 'profile-update':
      return { type: 'profile-update', profile: toProfilePayload(message.profile) };
    case 'connect-chat':
      return { type: 'connect-chat', profile: toProfilePayload(message.profile) };
    case 'sticker-action':
      return {
        type: 'sticker-action',
        profileId: optionalString(message.profileId),
        action: parseStickerAction(message),
      };
    case 'demo':
      return { type: 'demo', profileId: optionalString(message.profileId) };
    default:
      throw new Error('Неизвестный тип сообщения');
  }
};

/** WebSocket-сервер синхронизации стикеров между настройками и оверлеем OBS. */
export default class Overlay {
  private readonly logger: Logger;
  private readonly store: ProfileStore;
  private readonly demoCounters = new Map<string, number>();
  private readonly server: WebSocketServer;
  private listening = false;

  constructor(options: OverlayOptions, logger: Logger) {
    this.logger = logger;
    this.store = new ProfileStore(
      (profile) =>
        new StickerBoard({
          profileId: profile.id,
          settings: () => profile.settings,
          onChange: () => this.broadcastStickers(profile),
        }),
    );
    this.server = new WebSocketServer({
      host: options.connection?.host ?? DEFAULT_HOST,
      port: options.connection?.port ?? DEFAULT_PORT,
    });
    this.server.on('error', this.handleServerError);
  }

  /** Порт, на котором слушает сервер; undefined до запуска. */
  public get port(): number | undefined {
    const address = this.server.address();
    return typeof address === 'object' && address !== null ? address.port : undefined;
  }

  /** Запускает WebSocket-сервер. */
  public open(): Promise<void> {
    if (this.listening) return Promise.resolve();
    this.server.on('connection', this.handleConnection);
    const host = this.server.options.host ?? DEFAULT_HOST;
    return new Promise<void>((resolve, reject) => {
      const onListening = () => {
        this.listening = true;
        this.logger.info(`Синхронизация оверлея запущена: ws://${host}:${this.port}`);
        this.logger.info('Профили создаются автоматически при подключении OBS.');
        resolve();
      };
      const onError = (error: Error) => reject(error);
      this.server.once('listening', onListening);
      this.server.once('error', onError);
    });
  }

  /** Останавливает сервер и отменяет таймеры профилей. */
  public async close(): Promise<void> {
    for (const profile of this.store.all()) {
      this.store.board(profile).dispose();
    }
    for (const socket of this.server.clients) {
      socket.terminate();
    }
    if (!this.listening) return;
    this.listening = false;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Добавляет стикер с сообщением чата; вызывается при новом сообщении в чате. */
  public onMessage(payload: StreamerChatMessage): void {
    const prepared = prepareMessage(payload);
    const channel = payload.broadcaster.login.toLowerCase();

    for (const profile of this.store.findByChannel(channel)) {
      const { rewardMode } = profile.settings;
      // В режиме наград показываем только выкупленные награды, иначе — только обычные сообщения.
      if (rewardMode !== prepared.isReward) continue;

      const pinned = prepared.rewardId === PINNED_REWARD_ID;
      const board = this.store.board(profile);
      if (pinned) board.removeByCustomRewardId(PINNED_REWARD_ID);
      board.add({
        messageId: payload.messageId,
        author: prepared.author,
        text: prepared.text,
        content: prepared.content,
        roles: prepared.roles,
        pinned,
        customRewardId: rewardMode ? prepared.rewardId : null,
        lifetimeMs: pinned ? PINNED_REWARD_LIFETIME_MS : undefined,
        forceExpiry: pinned,
      });
    }
  }

  /** Убирает стикеры удалённого сообщения чата, показывая анимацию ухода. */
  public onDeleteMessage(payload: StreamerDeletedMessage): void {
    for (const profile of this.store.all()) {
      this.store.board(profile).removeByMessageId(payload.targetMessageId);
    }
  }

  private handleConnection = (socket: WebSocket): void => {
    const client = socket as SessionClient;
    client.role = 'unknown';
    client.profileId = null;
    client.on('message', (rawMessage) => this.handleClientMessage(client, rawMessage));
    client.on('close', () => this.broadcastProfileList());
  };

  private handleClientMessage(client: SessionClient, rawMessage: unknown): void {
    let message: ClientMessage;
    try {
      message = parseClientMessage(rawMessage);
    } catch {
      this.send(client, { type: 'error', message: 'Некорректное сообщение' });
      return;
    }

    switch (message.type) {
      case 'hello': {
        client.role = message.role;
        const upsert = this.store.upsert(message.profile);
        if (!upsert) break;
        client.profileId = upsert.profile.id;
        this.sendProfileSnapshot(client, upsert.profile);
        if (upsert.boardReset) this.broadcastStickers(upsert.profile);
        if (upsert.changed && !upsert.created) this.broadcastProfile(upsert.profile);
        this.broadcastProfileList();
        break;
      }
      case 'select-profile': {
        const profile = message.profileId ? this.store.get(message.profileId) : undefined;
        if (!profile) break;
        client.profileId = profile.id;
        this.sendProfileSnapshot(client, profile);
        this.broadcastProfileList();
        break;
      }
      case 'profile-update': {
        const upsert = this.store.upsert(message.profile);
        if (!upsert) break;
        client.profileId = upsert.profile.id;
        if (upsert.boardReset) this.broadcastStickers(upsert.profile);
        if (upsert.changed && !upsert.created) this.broadcastProfile(upsert.profile);
        if (upsert.changed) this.broadcastProfileList();
        this.sendProfileSnapshot(client, upsert.profile);
        break;
      }
      case 'connect-chat': {
        const upsert = this.store.upsert(message.profile);
        if (!upsert) break;
        if (upsert.boardReset) this.broadcastStickers(upsert.profile);
        if (upsert.changed && !upsert.created) this.broadcastProfile(upsert.profile);
        if (upsert.changed || upsert.created) this.broadcastProfileList();
        this.broadcastChatStatus(upsert.profile);
        break;
      }
      case 'sticker-action': {
        const profile = this.resolveProfile(message.profileId || client.profileId);
        if (profile && message.action) {
          this.store.board(profile).applyAction(message.action);
        }
        break;
      }
      case 'demo': {
        const profile = this.resolveProfile(message.profileId || client.profileId);
        if (!profile) break;
        const index = this.demoCounters.get(profile.id) ?? 0;
        this.demoCounters.set(profile.id, index + 1);
        const demo = DEMO_MESSAGES[index % DEMO_MESSAGES.length];
        this.store.board(profile).add({ author: demo.author, text: demo.text, roles: demo.roles });
        break;
      }
    }
  }

  private resolveProfile(profileId: string | null | undefined): Profile | undefined {
    return profileId ? this.store.get(profileId) : undefined;
  }

  private send(client: SessionClient, message: ServerMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage, predicate: (client: SessionClient) => boolean): void {
    for (const socket of this.server.clients) {
      const client = socket as SessionClient;
      if (predicate(client)) this.send(client, message);
    }
  }

  private toSummary(profile: Profile): ProfileSummary {
    let clientCount = 0;
    for (const socket of this.server.clients) {
      if ((socket as SessionClient).profileId === profile.id) clientCount += 1;
    }
    return {
      id: profile.id,
      name: profile.name,
      updatedAt: profile.updatedAt,
      settings: profile.settings,
      clientCount,
    };
  }

  private broadcastProfileList(): void {
    this.broadcast(
      {
        type: 'profile-list',
        profiles: this.store.all().map((profile) => this.toSummary(profile)),
      },
      (client) => client.role === 'controller',
    );
  }

  private broadcastProfile(profile: Profile): void {
    this.broadcast(
      { type: 'profile', profile: this.toSummary(profile) },
      (client) => client.profileId === profile.id,
    );
  }

  private stickersMessage(profile: Profile): ServerMessage {
    const board = this.store.board(profile);
    return {
      type: 'stickers',
      profileId: profile.id,
      stickers: board.items,
      queueSize: board.queuedCount,
    };
  }

  private broadcastStickers(profile: Profile): void {
    this.broadcast(this.stickersMessage(profile), (client) => client.profileId === profile.id);
  }

  private chatStatus(profile: Profile): ConnectionStatus {
    // Соединением с чатом управляет Streamer.bot, поэтому канал либо задан и работает, либо нет.
    return profile.settings.channel ? 'connected' : 'idle';
  }

  private broadcastChatStatus(profile: Profile): void {
    this.broadcast(
      { type: 'chat-status', profileId: profile.id, status: this.chatStatus(profile) },
      (client) => client.profileId === profile.id,
    );
  }

  private sendProfileSnapshot(client: SessionClient, profile: Profile): void {
    this.send(client, { type: 'profile', profile: this.toSummary(profile) });
    this.send(client, {
      type: 'chat-status',
      profileId: profile.id,
      status: this.chatStatus(profile),
    });
    this.send(client, this.stickersMessage(profile));
  }

  private handleServerError = (error: NodeJS.ErrnoException): void => {
    const port = this.server.options.port ?? DEFAULT_PORT;
    this.logger.error(
      error.code === 'EADDRINUSE'
        ? `Порт ${port} уже занят. Возможно, сервер уже запущен.`
        : `Ошибка WebSocket-сервера: ${error.message}`,
    );
  };
}
