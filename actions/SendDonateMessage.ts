import type { Donation } from '#extensions';

import type { Context, Action } from './types.ts';

export default class SendDonateMessage implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run(donate: Donation, { twitch }: Context) {
    if (donate.message) {
      await twitch.sendAnnounce(
        `Донат от ${donate.username} на сумму ${donate.amount}${donate.currency}: ${donate.message}`,
      );
    } else {
      await twitch.sendAnnounce(
        `Донат от ${donate.username} на сумму ${donate.amount}${donate.currency}`,
      );
    }
  }
}
