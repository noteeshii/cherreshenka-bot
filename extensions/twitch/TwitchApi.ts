import User from './User.ts';

type Fetch = typeof globalThis.fetch;

type TwitchUser = {
  id: string;
  login: string;
};

type HelixResponse<T> = {
  data: T[];
  message?: string;
};

export type TwitchApiOptions = {
  clientId: string;
  accessToken: string;
  broadcasterId: string;
  fetch?: Fetch;
};

/** Client for the Twitch Helix API scoped to one broadcaster's channel. */
export default class TwitchApi {
  private static readonly baseUrl = 'https://api.twitch.tv/helix';

  private readonly accessToken: string;
  private readonly broadcasterId: string;
  private readonly clientId: string;
  private readonly fetch: Fetch;

  constructor(options: TwitchApiOptions) {
    this.clientId = options.clientId;
    this.accessToken = options.accessToken;
    this.broadcasterId = options.broadcasterId;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  public async getUser(login: string) {
    const user = await this.findUser('login', login.trim());
    return this.createUser(user);
  }

  public async getUserById(id: string) {
    const user = await this.findUser('id', id);
    return this.createUser(user);
  }

  public async isModerator(userId: string) {
    return this.hasRecord('/moderation/moderators', userId);
  }

  public async isSubscribed(userId: string) {
    return this.hasRecord('/subscriptions', userId);
  }

  public async isVip(userId: string) {
    return this.hasRecord('/channels/vips', userId);
  }

  public async isFollowing(userId: string) {
    return this.hasRecord('/channels/followers', userId);
  }

  private async createUser(user: TwitchUser) {
    const [isModerator, isSubscribed, isVip, isFollowing] = await Promise.all([
      this.isModerator(user.id),
      this.isSubscribed(user.id),
      this.isVip(user.id),
      this.isFollowing(user.id),
    ]);

    return new User(user.id, user.login, isModerator, isSubscribed, isVip, isFollowing);
  }

  private async findUser(field: 'id' | 'login', value: string) {
    if (!value) {
      throw new Error(`Twitch user ${field} must not be empty`);
    }

    const response = await this.request<TwitchUser>('/users', { [field]: value });
    const [user] = response.data;

    if (!user) {
      throw new Error(`Twitch user not found: ${value}`);
    }

    return user;
  }

  private async hasRecord(path: string, userId: string) {
    const response = await this.request(path, {
      broadcaster_id: this.broadcasterId,
      user_id: userId,
    });
    return response.data.length > 0;
  }

  private async request<T = Record<string, unknown>>(
    path: string,
    parameters: Record<string, string>,
  ) {
    console.log(JSON.stringify(parameters, undefined, 2));
    const query = new URLSearchParams(parameters);
    const response = await this.fetch(`${TwitchApi.baseUrl}${path}?${query}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Client-Id': this.clientId,
      },
    });

    const body = (await response.json()) as HelixResponse<T>;
    if (!response.ok) {
      throw new Error(
        `Twitch API request failed (${response.status}): ${body.message ?? 'unknown error'}`,
      );
    }

    return body;
  }
}
