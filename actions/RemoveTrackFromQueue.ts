import type { Context, Action } from './types.ts';

export default class RemoveTrackFromQueue implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run({message, user}: CommandEvent, { music, twitch }: Context) {
    if (!/^(?:[1-9][0-9]?|100)$/.test(message.trim())) {
      return await twitch.sendMessage('Использование: !отмена <номер трека из очереди> (целое число >= 1).');
    }

    const track = music.cancel(user.name, Number(message.trim()) - 1);

    if (!track) {
      return;
    }

    await twitch.updateRedemptionStatus(track.redemptionId, track.rewardId, 'CANCELED');
  }
}

type CommandEvent = {
  message: string;
  user: {
    name: string;
  };
};