import type { Context, Action, CommandEvent, TemporaryUserStorage } from './types.ts';

export default class UseSweet implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run({ user, message }: CommandEvent, { storage, auction }: Context) {
    const userStorage = storage.getUserTemporary<TemporaryUserStorage>(user.name);

    if (userStorage.countSweet) {
      userStorage.countSweet = userStorage.countSweet - 1;

      await auction.addLot({ message, cost: 500, username: user.name });
    }

    storage.setUserTemporary(user.name, userStorage);
  }
}
