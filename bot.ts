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
  name: string;
  command: string;
  message: string;
  user: {
    id: string;
    name: string;
    role: number;
  };
};

const EVENT_RETENTION_MS = 10 * 60 * 1000;
const MAX_TRACKED_EVENTS = 10_000;

function removeExpiredEntries(entries: Map<string, number>, now: number): void {
  for (const [key, expiresAt] of entries) {
    if (expiresAt <= now) {
      entries.delete(key);
    }
  }
}

export class Bot {
  private readonly actions: Action[];

  private readonly seenEvents = new Map<string, number>();
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
    const action = this.actions.find((action) => action.name === payload.name);

    if (!action) {
      return
    }

    await action.run(payload.message, {twitch: this.twitch, music: this.music});
  }

  async onReward(reward: RewardEvent): Promise<void> {
    if (!reward?.id || !reward.reward?.id || reward.status?.toLowerCase() === 'canceled') {
      return;
    }

    const action = this.actions.find((action) => {
      return action.type === 'reward' && action.check(reward.reward.id);
    });

    if (!action || this.isDuplicateEvent(`reward:${reward.id}`)) {
      return;
    }

    await action.run(reward, { twitch: this.twitch, music: this.music });
  }

  // Reserve the event before awaiting a handler to prevent concurrent duplicates.
  private isDuplicateEvent(key: string): boolean {
    const now = Date.now();
    removeExpiredEntries(this.seenEvents, now);

    if (this.seenEvents.has(key)) {
      return true;
    }
    if (this.seenEvents.size >= MAX_TRACKED_EVENTS) {
      const oldestKey = this.seenEvents.keys().next().value;
      if (oldestKey !== undefined) {
        this.seenEvents.delete(oldestKey);
      }
    }

    this.seenEvents.set(key, now + EVENT_RETENTION_MS);
    return false;
  }
}
