import { getRandomNumber } from '#utils';

import type { Context, Action, CommandEvent } from './types.ts';

type UserStorage = {
  killsCount?: number;
  shootsCount?: number;
  deathsCount?: number;
};

export default class ShootUser implements Action {
  private get name() {
    return this.constructor.name;
  }

  private get chance() {
    return 6;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run({ message: userName, user }: CommandEvent, { twitch, storage }: Context) {
    const parsed = userName.startsWith('@') ? userName.replace('@', '').trim() : userName.trim();

    const randomNumber = getRandomNumber(1, 6);
    const targetStorage = storage.getUserPermanent<UserStorage>(parsed);
    const userStorage = storage.getUserPermanent<UserStorage>(user.name);

    userStorage.shootsCount = (userStorage.shootsCount || 0) + 1;

    if (randomNumber !== this.chance) {
      storage.setUserPermanent(user.name, userStorage);

      await twitch.sendMessage('Промах');
    } else {
      userStorage.killsCount = (userStorage.killsCount || 0) + 1;
      targetStorage.deathsCount = (targetStorage.deathsCount || 0) + 1;

      storage.setUserPermanent(parsed, targetStorage);
      storage.setUserPermanent(user.name, userStorage);

      await twitch.sendMessage(`Папау @${parsed}`);
      await twitch.timeoutUser(parsed);
    }
  }
}
