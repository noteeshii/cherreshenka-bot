import type { Context, Action } from './types.ts';

export default class RemoveTrackFromQueue implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run({ message, user }: CommandEvent, { music, twitch, logger }: Context) {
    if (!/^(?:[1-9][0-9]?|100)$/.test(message.trim())) {
      await twitch.sendMessage(
        'Использование: !отмена <номер трека из очереди> (целое число >= 1).',
      );
      return;
    }

    let track;

    try {
      track = music.cancel(user.name, Number(message.trim()) - 1);
    } catch (err) {
      if (err === 'permission denied') {
        await twitch.sendMessage('Ты пытаешься отменить чужой трек.');
      } else {
        logger.error(String(err));
      }

      return;
    }
    if (!track) {
      return;
    }

    await twitch.updateRedemptionStatus(track.redemptionId, track.rewardId, 'CANCELED');
    await twitch.sendMessage(`Трек "${track.title}" отменен, баллы возвращены.`);
  }
}

type CommandEvent = {
  message: string;
  user: {
    name: string;
  };
};
