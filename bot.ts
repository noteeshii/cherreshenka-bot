import type { StreamerbotEventData } from '@streamerbot/client';

import type { Music, Twitch, Config, Logger } from '#extensions';
import {
  type Action,
  PauseCurrentTrack,
  ResumeCurrentTrack,
  SendCurrentTrack,
  SendTracksQueue,
  SetTracksVolume,
  SkipCurrentTrack,
  AddTrackToQueue,
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
  private readonly logger: Pick<Logger, 'info'>;

  constructor(twitch: Twitch, config: Config, music: Music, logger: Pick<Logger, 'info'>) {
    this.twitch = twitch;
    this.music = music;
    this.config = config;
    this.logger = logger;

    this.actions = [
      new PauseCurrentTrack(),
      new ResumeCurrentTrack(),
      new SendCurrentTrack(),
      new SendTracksQueue(),
      new SetTracksVolume(),
      new SkipCurrentTrack(),
      new AddTrackToQueue(this.config),
    ];
  }

  async onCommand(payload: CommandEvent) {
    const action = this.actions.find((action) => action.check(payload.name));

    if (!action) {
      return;
    }

    await action.run(payload.message, { twitch: this.twitch, music: this.music });
  }

  async onReward(reward: RewardEvent): Promise<void> {
    if (!reward?.id || !reward.reward?.id || reward.status?.toLowerCase() === 'canceled') {
      return;
    }

    const action = this.actions.find((action) => action.check(reward.reward.id));

    if (!action) {
      return;
    }

    await action.run(reward, { twitch: this.twitch, music: this.music });
  }
}
