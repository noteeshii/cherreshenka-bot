import type Config from './config';

const API_URL = 'https://www.donationalerts.com/api/v1';
const SOCKET_URL = 'wss://centrifugo.donationalerts.com/connection/websocket';
const RECONNECT_DELAY_MS = 5_000;

export type Donation = {
  id: number;
  username: string;
  messageType: 'text' | 'audio';
  message: string | null;
  amount: number;
  currency: string;
  createdAt: string;
};

export type DonationListener = (donation: Donation) => void | Promise<void>;

type User = {
  id: number;
  socket_connection_token: string;
};

type Subscription = {
  channel: string;
  token: string;
};

type CentrifugoMessage = {
  id?: number;
  error?: { message?: string };
  result?: {
    client?: string;
    data?: unknown;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toDonation = (value: unknown): Donation | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const { id, username, message, message_type, amount, currency, created_at } = value;
  if (
    typeof id !== 'number' ||
    typeof username !== 'string' ||
    (typeof message !== 'string' && message !== null) ||
    (message_type !== 'text' && message_type !== 'audio') ||
    typeof amount !== 'number' ||
    typeof currency !== 'string' ||
    typeof created_at !== 'string'
  ) {
    return undefined;
  }

  return {
    id,
    username,
    messageType: message_type,
    message,
    amount,
    currency,
    createdAt: created_at,
  };
};

/** Receives real-time donation alerts through the official DonationAlerts API. */
export default class DonationAlerts {
  private readonly accessToken: string;
  private readonly listeners = new Set<DonationListener>();
  private socket?: WebSocket;
  private connectPromise?: Promise<void>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(config: Config['donates']) {
    if (!config.accessToken.trim()) {
      throw new Error('Для DonationAlerts необходим OAuth access token.');
    }

    this.accessToken = config.accessToken;
  }

  /**
   * Registers a listener for new donations and opens the subscription if needed.
   * The returned function unregisters this particular listener.
   */
  public async onDonate(listener: DonationListener) {
    this.listeners.add(listener);

    try {
      await this.connect();
    } catch (error) {
      this.listeners.delete(listener);
      throw error;
    }
  }

  /** Stops the socket and prevents automatic reconnection. */
  public close() {
    this.closed = true;
    this.connectPromise = undefined;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = undefined;
  }

  private async connect() {
    if (this.closed || this.listeners.size === 0) {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.open().finally(() => {
        this.connectPromise = undefined;
      });
    }

    return this.connectPromise;
  }

  private async open() {
    const user = await this.request<User>('/user/oauth');
    const channel = `$alerts:donation_${user.id}`;
    const socket = new WebSocket(SOCKET_URL);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let subscribed = false;

      const fail = (error: Error) => {
        if (!subscribed) {
          reject(error);
        }
      };

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ id: 1, params: { token: user.socket_connection_token } }));
      });

      socket.addEventListener('error', () =>
        fail(new Error('Не удалось подключиться к DonationAlerts.')),
      );

      socket.addEventListener('close', () => {
        if (!subscribed) {
          fail(new Error('DonationAlerts закрыл соединение до оформления подписки.'));
        }
        this.scheduleReconnect();
      });

      socket.addEventListener('message', (event) => {
        this.handleMessage(event.data, async (message) => {
          if (message.error) {
            fail(new Error(message.error.message ?? 'DonationAlerts отклонил запрос.'));
            return;
          }

          if (message.id === 1 && message.result?.client) {
            try {
              const subscription = await this.subscribe(channel, message.result.client);
              socket.send(
                JSON.stringify({
                  id: 2,
                  method: 1,
                  params: { channel: subscription.channel, token: subscription.token },
                }),
              );
            } catch (error) {
              fail(error instanceof Error ? error : new Error(String(error)));
            }
            return;
          }

          if (message.id === 2) {
            subscribed = true;
            resolve();
            return;
          }

          const data = message.result?.data;
          const donation = toDonation(isRecord(data) ? (data.data ?? data) : data);
          if (donation) {
            this.emit(donation);
          }
        });
      });
    });
  }

  private async handleMessage(
    value: unknown,
    handler: (message: CentrifugoMessage) => Promise<void>,
  ) {
    try {
      const text = typeof value === 'string' ? value : await new Response(value as BodyInit).text();
      const message: unknown = JSON.parse(text);
      if (isRecord(message)) {
        await handler(message as CentrifugoMessage);
      }
    } catch {
      // Ignore malformed or non-text WebSocket frames.
    }
  }

  private async subscribe(channel: string, client: string) {
    const response = await this.request<{ channels: Subscription[] }>(
      '/centrifuge/subscribe',
      {
        method: 'POST',
        body: JSON.stringify({ channels: [channel], client }),
      },
      false,
    );
    const subscription = response.channels.find((item) => item.channel === channel);
    if (!subscription) {
      throw new Error('DonationAlerts не вернул токен подписки на донаты.');
    }

    return subscription;
  }

  private async request<Response>(path: string, init: RequestInit = {}, unwrapData = true) {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      console.log(response);
      throw new Error(`DonationAlerts API вернул HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || (unwrapData && !('data' in payload))) {
      throw new Error('DonationAlerts API вернул неожиданный ответ.');
    }

    return (unwrapData ? payload.data : payload) as Response;
  }

  private emit(donation: Donation) {
    for (const listener of this.listeners) {
      Promise.resolve(listener(donation)).catch(() => undefined);
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.listeners.size === 0 || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(() => this.scheduleReconnect());
    }, RECONNECT_DELAY_MS);
  }
}
