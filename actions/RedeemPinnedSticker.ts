import type { StreamerbotEventData } from '@streamerbot/client';

import type { Config } from '#extensions';
import type { Context, Action, TemporaryUserStorage } from './types.ts';

type RewardEvent = StreamerbotEventData<'Twitch.RewardRedemption'>;

export default class RedeemPinnedSticker implements Action {
  private readonly rewardId;

  constructor(config: Config) {
    this.rewardId = config.rewards.pinnedStickerId;
  }

  public check(rewardId: string) {
    return this.rewardId === rewardId;
  }

  public async run(reward: RewardEvent, { storage }: Context) {
    const userStorage = storage.getUserTemporary<TemporaryUserStorage>(reward.user_login);

    userStorage.countPinnedStickerRedeemed = (userStorage.countPinnedStickerRedeemed || 0) + 1;

    storage.setUserTemporary(reward.user_login, userStorage);
  }
}
