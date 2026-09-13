import type { Context, Action, CommandEvent, UserStorage } from './types.ts';

export default class SendShootLeaders implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run(_args: CommandEvent, { twitch, storage }: Context) {
    const userStorage = storage.getPermanent();

    const leaders = Object.entries<UserStorage>(userStorage.users)
      .map(([name, node]) => {
        return {
          name,
          kd: ((node.killsCount || 0) / (node.deathsCount || 1)).toFixed(2),
          kills: node.killsCount || 0,
        };
      })
      .toSorted((a, b) => b.kills - a.kills)
      .slice(0, 5)
      .map(({ name, kd, kills }, idx) => `${idx + 1}# @${name}: ${kills} попаданий, К/Д: ${kd}`)
      .join(' | ');

    await twitch.sendMessage(`Таблица лидеров: ${leaders}`);
  }
}
