import type { Config } from '#extensions';
import { getRandomNumber } from '#utils';

import type { Context, Action, CommandEvent } from './types.ts';

type UserStorage = {
  killsCount?: number;
  shootsCount?: number;
  deathsCount?: number;
  shootsSelfCount?: number;
  killsSelfCount?: number;
};

export default class ShootUser implements Action {
  private readonly chance: number;
  constructor(config: Config) {
    this.chance = config.actions.hitChance;
  }

  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run({ message: targetUserName, user }: CommandEvent, { twitch, storage }: Context) {
    const randomNumber = getRandomNumber(1, this.chance);
    const parsed = targetUserName.startsWith('@')
      ? (targetUserName?.replace('@', '').toLowerCase().trim() ?? null)
      : (targetUserName?.toLowerCase().trim() ?? null);

    const isHit = randomNumber === this.chance;
    const userStorage = storage.getUserPermanent<UserStorage>(user.name);

    if (!parsed || !parsed.length || parsed === user.name) {
      userStorage.shootsSelfCount = (userStorage.shootsSelfCount || 0) + 1;

      if (isHit) {
        userStorage.killsSelfCount = (userStorage.killsSelfCount || 0) + 1;

        await twitch.doAction('UserHitYourself', { user: user.name });
      } else {
        await twitch.doAction('UserMissYourself', { user: user.name });
      }

      storage.setUserPermanent(user.name, userStorage);

      return;
    }

    const targetUser = await twitch.getUser(parsed).catch(async (err) => {
      console.error(err);

      await twitch.sendMessage('Ошибка при обработке команды, не удалось получить пользователя.');

      return null;
    });

    if (!targetUser) {
      return;
    }

    userStorage.shootsCount = (userStorage.shootsCount || 0) + 1;

    if (targetUser.isModerator) {
      userStorage.deathsCount = (userStorage.deathsCount || 0) + 1;

      await twitch.doAction('UserHitModerator', { user: user.name, targetUser: targetUser.name });

      storage.setUserPermanent(user.name, userStorage);

      return;
    }

    const targetStorage = storage.getUserPermanent<UserStorage>(parsed);

    if (isHit) {
      userStorage.killsCount = (userStorage.killsCount || 0) + 1;
      targetStorage.deathsCount = (targetStorage.deathsCount || 0) + 1;

      await twitch.doAction('UserHitOtherUser', { user: user.name, targetUser: targetUser.name });
    } else {
      await twitch.doAction('UserMissOtherUser', { user: user.name, targetUser: targetUser.name });
    }

    storage.setUserPermanent(parsed, targetStorage);
    storage.setUserPermanent(user.name, userStorage);
  }
}
