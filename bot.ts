import type { StreamerbotEventData } from '@streamerbot/client';

import type { Music, Twitch, Config, Logger } from '#extensions';
import {
  type Action,
  PauseCurrentTrack,
  ResumeCurrentTrack,
  SendCurrentTrack,
  SendTracksQueue,
  SendTracksQueueSize,
  SetTracksVolume,
  SkipCurrentTrack,
  AddTrackToQueue,
  RemoveTrackFromQueue,
  LikeCurrentTrack,
  DislikeCurrentTrack,
} from '#actions';

type RewardEvent = StreamerbotEventData<'Twitch.RewardRedemption'>;
type CommandEvent = {
  id: string;
  name: string;
  command: string;
  message: string;
  user: {
    id: string;
    name: string;
    role: number;
  };
};

export class Bot {
  private readonly actions: Action[];
  private readonly twitch: Twitch;
  private readonly music: Music;
  private readonly config: Config;
  private readonly logger: Logger;

  constructor(twitch: Twitch, config: Config, music: Music, logger: Logger) {
    this.twitch = twitch;
    this.music = music;
    this.config = config;
    this.logger = logger;

    this.actions = [
      new PauseCurrentTrack(),
      new ResumeCurrentTrack(),
      new SendCurrentTrack(),
      new SendTracksQueue(),
      new SendTracksQueueSize(),
      new SetTracksVolume(),
      new SkipCurrentTrack(),
      new AddTrackToQueue(this.config),
      new RemoveTrackFromQueue(),
      new LikeCurrentTrack(),
      new DislikeCurrentTrack(),
    ];
  }

  async onCommand(payload: CommandEvent) {
    const commandLogger = this.logger.withContext('Command');

    commandLogger.debug(`Starting: ${payload.name}`);

    const action = this.actions.find((action) => action.check(payload.name));

    if (!action) {
      commandLogger.debug(`Action not found: ${payload.name}`);

      return;
    }

    await action.run(payload, { twitch: this.twitch, music: this.music, logger: commandLogger });

    commandLogger.debug(`Completed: ${payload.name}`);
  }

  async onReward(reward: RewardEvent): Promise<void> {
    const rewardLogger = this.logger.withContext('Reward');

    rewardLogger.debug(`Starting action: ${reward.reward.title}`);

    if (!reward?.id || !reward.reward?.id || reward.status?.toLowerCase() === 'canceled') {
      rewardLogger.debug(`Not enough data: ${reward}`);

      return;
    }

    const action = this.actions.find((action) => action.check(reward.reward.id));

    if (!action) {
      rewardLogger.debug(`Action not found: ${reward.reward.title}`);

      return;
    }

    await action.run(reward, { twitch: this.twitch, music: this.music, logger: rewardLogger });

    rewardLogger.debug(`Completed: ${reward.reward.title}`);
  }
}
