import Config from './config.ts';
import type Logger from './logger.ts';

type Lot = {
  message: string;
  cost: number;
  username: string;
};

export default class Auction {
  private readonly config: Config['auction'];
  private readonly logger: Logger;

  constructor(config: Config, logger: Logger) {
    this.config = config.auction;
    this.logger = logger;
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
      this.logger.debug(await response.text());

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
