import type { Context, Action, CommandEvent, UserStorage } from './types.ts';

export default class SendShootsStat implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run({ user }: CommandEvent, { twitch, storage }: Context) {
    const userStorage = storage.getUserPermanent<UserStorage>(user.name);

    const kd = ((userStorage.killsCount || 0) / (userStorage.deathsCount || 1)).toFixed(2);
    const hitsPercent = Math.floor(
      ((userStorage.killsCount || 0) / (userStorage.shootsCount || 0) || 0) * 100,
    );
    const hitsSelfPercent = Math.floor(
      ((userStorage.killsSelfCount || 0) / (userStorage.shootsSelfCount || 0) || 0) * 100,
    );

    const msg = `@${user.name}, твоя стата:
    Всего выстрелов: ${userStorage.shootsCount || 0} |
    Попаданий: ${userStorage.killsCount || 0} |
    В тебя попали: ${userStorage.deathsCount || 0} |
    К/Д: ${kd || 0} |
    Процент попаданий: ${hitsPercent} |
    Выстрелов по себе: ${userStorage.shootsSelfCount || 0} |
    Попаданий по себе: ${userStorage.killsSelfCount || 0} |
    Процент попаданий по себе: ${hitsSelfPercent}`;

    await twitch.sendMessage(msg);
  }
}
