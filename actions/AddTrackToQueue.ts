import type { Config } from '#extensions';
import type { Context, Action } from './types.ts';

export default class AddTrackToQueue implements Action {
  private readonly rewardId;

  constructor(config: Config) {
    this.rewardId = config.rewards.musicRewardId;
  }

  public get type() {
    return 'reward' as const;
  }

  public get moderator() {
    return false;
  }

  public check(rewardId: string) {
    return this.rewardId === rewardId;
  }

  public async run(reward: { user_login: string; user_input: string }, { music, twitch }: Context) {
    try {
      await music.enqueue(reward.user_input);
    } catch (error) {
      await twitch.sendMessage(`@${reward.user_login}, Не удалось добавить трек.`);
    }
  }
}
