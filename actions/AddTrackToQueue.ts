import type { StreamerbotEventData } from '@streamerbot/client';


import type { Config } from '#extensions';
import type { Context, Action } from './types.ts';

type RewardEvent = StreamerbotEventData<'Twitch.RewardRedemption'>;

export default class AddTrackToQueue implements Action {
  private readonly rewardId;

  constructor(config: Config) {
    this.rewardId = config.rewards.musicRewardId;
  }

  public check(rewardId: string) {
    return this.rewardId === rewardId;
  }

  public async run(reward: RewardEvent, { music, twitch }: Context) {
    let isError = false;

    try {
      await music.enqueue(reward.user_input);
    } catch (error) {
      isError = true;
      await twitch.sendMessage(`@${reward.user_login}, Не удалось добавить трек.`);
    } finally {
      await twitch.updateRedemptionStatus(
        reward.id,
        reward.reward.id,
        isError ? 'CANCELED' : 'FULFILLED'
      );
    }
  }
}
