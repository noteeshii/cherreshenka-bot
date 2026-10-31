import Config from './config.ts';

type Lot = {
  message: string;
  cost: number;
  username: string;
};

export default class Auction {
  private readonly config: Config['auction'];

  constructor(config: Config) {
    this.config = config.auction;
  }

  private request = async (method: string, endponit: string, body?: Object) => {
    const response = await fetch(`${this.config.basePath}/${endponit}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Auction return error status: ${response.status}`);
    }

    const payload = await response.json();

    return payload;
  };

  public addLot = async (lot: Lot) => {
    return this.request('post', 'bids', {
      bids: [
        {
          ...lot,
          insertStrategy: 'none',
          isDonation: false,
        },
      ],
    });
  };
}
