import type { StreamerbotClient } from '@streamerbot/client';

import type { Config } from '#extensions';

import User from './User.ts';
import TwitchApi from './TwitchApi.ts';

const MAX_MESSAGE_LENGTH = 500;

type Client = Pick<StreamerbotClient, 'sendMessage' | 'doAction'> &
  Partial<Pick<StreamerbotClient, 'send'>>;

const chatText = (value: string) => {
  const text = value.replace(/[\r\n]+/g, ' ').trim();
  if (!text || [...text].length > MAX_MESSAGE_LENGTH) {
    throw new Error('Сообщение должно содержать от 1 до 500 символов');
  }

  return text;
};

export default class Twitch {
  private readonly cachedUsers: Map<string, User>;
  private readonly config: Config;
  private readonly client: Client;
  private readonly twitchApi: TwitchApi;
  constructor(config: Config, client: Client) {
    this.config = config;
    this.client = client;
    this.cachedUsers = new Map();
    this.twitchApi = new TwitchApi({
      accessToken: this.config.channel.accessToken,
      broadcasterId: this.config.channel.id,
      clientId: this.config.channel.clientId,
    });
  }

  private async ensureSuccess<Response>(
    request: Promise<{ status: string; error?: string } & Response>,
  ) {
    const response = await request;

    if (response.status !== 'ok') {
      if (response.error === 'Authentication required') {
        throw new Error(
          'Отправка в чат требует авторизации: включите Authentication в WebSocket Server streamer.bot и укажите его пароль в STREAMERBOT_PASSWORD в .env.',
        );
      }

      throw new Error(`Streamer.bot отклонил запрос: ${response.error || 'причина не указана'}`);
    }

    return response;
  }

  public async sendMessage(message: string) {
    const text = chatText(message);

    // A command trigger is executed by Streamer.bot's action queue. Waiting for
    // the response to SendMessage from inside that trigger can deadlock: the
    // queue waits for this handler while the response waits for the queue.
    // Send the request without awaiting its response so the command action can
    // finish and Streamer.bot can deliver the chat message immediately after.
    if (this.client.send) {
      this.client.send({
        request: 'SendMessage',
        id: crypto.randomUUID(),
        platform: 'twitch',
        message: text,
        bot: true,
        internal: false,
      });
      return;
    }

    await this.ensureSuccess(
      this.client.sendMessage('twitch', text, {
        bot: true,
        internal: false,
      }),
    );
  }

  public async announce(message: string) {
    await this.ensureSuccess(
      this.client.doAction(
        { name: 'SendAnnounce' },
        {
          message: chatText(message),
          bot: true,
        },
      ),
    );
  }

  public async timeoutUser(userName: string) {
    await this.ensureSuccess(
      this.client.doAction(
        { name: 'TimeoutUser' },
        {
          userName,
        },
      ),
    );
  }

  public async updateRedemptionStatus(
    redemptionId: string,
    rewardId: string,
    status: 'CANCELED' | 'FULFILLED',
  ) {
    await this.ensureSuccess(
      this.client.doAction(
        { name: 'UpdateRedemptionStatus' },
        {
          redemptionId,
          rewardId,
          status,
        },
      ),
    );
  }

  public async getUser(userName: string) {
    const trimmed = userName.trim();

    const cached = this.cachedUsers.get(trimmed);

    if (cached) {
      return cached;
    }

    const user = await this.twitchApi.getUser(trimmed);

    this.cachedUsers.set(user.name, user);

    return user;
  }

  public async doAction(name: string, args: Record<string, unknown>) {
    await this.ensureSuccess(this.client.doAction({ name }, args));
  }
}
