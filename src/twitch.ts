import type { StreamerbotClient } from '@streamerbot/client';

const MAX_MESSAGE_LENGTH = 500;
const MAX_TIMEOUT_SECONDS = 14 * 24 * 60 * 60;
const TWITCH_LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;

type StreamerbotTransport = Pick<StreamerbotClient, 'sendMessage' | 'doAction'>;

export interface Twitch {
  sendMessage(message: string): Promise<void>;
  announce(message: string): Promise<void>;
  timeout(username: string, duration: number, reason?: string): Promise<void>;
}

export function chatText(value: string): string {
  const text = value.replace(/[\r\n]+/g, ' ').trim();
  if (!text || [...text].length > MAX_MESSAGE_LENGTH) {
    throw new Error('Сообщение должно содержать от 1 до 500 символов');
  }

  return text;
}

export function timeoutArgs(username: string, duration: number, reason = '') {
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
}

async function ensureSuccess(request: Promise<{ status: string }>): Promise<void> {
  const response = await request;
  if (response.status !== 'ok') {
    throw new Error('Streamer.bot отклонил запрос');
  }
}

export function createTwitch(
  client: StreamerbotTransport,
  actionName: string,
  useBot: boolean,
): Twitch {
  return {
    sendMessage(message) {
      return ensureSuccess(
        client.sendMessage('twitch', chatText(message), {
          bot: useBot,
          internal: false,
        }),
      );
    },

    announce(message) {
      return ensureSuccess(
        client.doAction(
          { name: actionName },
          {
            operation: 'announce',
            message: chatText(message),
            bot: useBot,
          },
        ),
      );
    },

    timeout(username, duration, reason) {
      return ensureSuccess(
        client.doAction(
          { name: actionName },
          {
            operation: 'timeout',
            ...timeoutArgs(username, duration, reason),
            bot: useBot,
          },
        ),
      );
    },
  };
}
