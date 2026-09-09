import type { StreamerbotClient } from '@streamerbot/client';
import type { Config } from '#extensions';

const MAX_MESSAGE_LENGTH = 500;
const MAX_TIMEOUT_SECONDS = 14 * 24 * 60 * 60;
const TWITCH_LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;

type Client = Pick<StreamerbotClient, 'sendMessage' | 'doAction'> &
  Partial<Pick<StreamerbotClient, 'send'>>;

const chatText = (value: string) => {
  const text = value.replace(/[\r\n]+/g, ' ').trim();
  if (!text || [...text].length > MAX_MESSAGE_LENGTH) {
    throw new Error('Сообщение должно содержать от 1 до 500 символов');
  }

  return text;
};

const timeoutArgs = (username: string, duration: number, reason = '') => {
  const login = username.replace(/^@/, '').toLowerCase();

  if (!TWITCH_LOGIN_PATTERN.test(login)) {
    throw new Error('Некорректный Twitch login');
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_TIMEOUT_SECONDS) {
    throw new Error('Таймаут: целое число от 1 до 1209600 секунд');
  }
  if ([...reason].length > MAX_MESSAGE_LENGTH) {
    throw new Error('Причина длиннее 500 символов');
  }

  return { username: login, duration, reason };
};

export default class Twitch {
  private readonly config: Config['streamerBot'];
  private readonly client: Client;
  constructor(config: Config['streamerBot'], client: Client) {
    this.config = config;
    this.client = client;
  }

  private async ensureSuccess(request: Promise<{ status: string; error?: string }>) {
    const response = await request;

    if (response.status !== 'ok') {
      if (response.error === 'Authentication required') {
        throw new Error(
          'Отправка в чат требует авторизации: включите Authentication в WebSocket Server streamer.bot и укажите его пароль в STREAMERBOT_PASSWORD в .env.',
        );
      }

      throw new Error(`Streamer.bot отклонил запрос: ${response.error || 'причина не указана'}`);
    }
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
        bot: this.config.useBot,
        internal: false,
      });
      return;
    }

    await this.ensureSuccess(
      this.client.sendMessage('twitch', text, {
        bot: this.config.useBot,
        internal: false,
      }),
    );
  }

  public async announce(message: string) {
    await this.ensureSuccess(
      this.client.doAction(
        { name: this.config.action },
        {
          operation: 'announce',
          message: chatText(message),
          bot: this.config.useBot,
        },
      ),
    );
  }

  public async timeout(username: string, duration: number, reason?: string) {
    await this.ensureSuccess(
      this.client.doAction(
        { name: this.config.action },
        {
          operation: 'timeout',
          ...timeoutArgs(username, duration, reason),
          bot: this.config.useBot,
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
}
