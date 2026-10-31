import type { Context, Action, CommandEvent, TemporaryUserStorage } from './types.ts';

const rollChance = () => {
  const roll = Math.random();

  if (roll < 0.1) return 'SweetRolled' as const;
  if (roll < 0.3) return 'DeathRolled' as const;

  return 'PoopRolled' as const;
};

export default class TrickOrTreat implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run({ user }: CommandEvent, { twitch, storage }: Context) {
    const chance = rollChance();

    if (chance === 'SweetRolled') {
      const userStorage = storage.getUserTemporary<TemporaryUserStorage>(user.name);

      userStorage.countSweet = (userStorage.countSweet ?? 0) + 1;

      storage.setUserTemporary(user.name, userStorage);
    }

    await twitch.doAction(chance, { user: user.name });
  }
}
