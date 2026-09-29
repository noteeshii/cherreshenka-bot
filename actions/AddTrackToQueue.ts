import type { StreamerbotEventData } from '@streamerbot/client';

import type { Config } from '#extensions';
import type { Context, Action } from './types.ts';

type RewardEvent = StreamerbotEventData<'Twitch.RewardRedemption'>;

export default class AddTrackToQueue implements Action {
  private readonly rewardId;

  constructor(config: Config) {
    this.rewardId = config.rewards.musicId;
  }

  public check(rewardId: string) {
    return this.rewardId === rewardId;
  }

  public async run(reward: RewardEvent, { music, twitch }: Context) {
    try {
      const { id, track } = await music.enqueue({
        url: reward.user_input,
        userName: reward.user_login,
        rewardId: reward.reward.id,
        redemptionId: reward.id,
      });

      await twitch.sendMessage(`Трек добавлен в очередь: #${id} ${track.title}`);
    } catch (error) {
      await twitch.sendMessage(`@${reward.user_login}, Не удалось добавить трек.`);
      await twitch.updateRedemptionStatus(reward.id, reward.reward.id, 'CANCELED');
    }
  }
}
