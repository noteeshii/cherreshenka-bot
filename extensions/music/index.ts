import type { Config, Logger } from '#extensions';

import Track, {type TrackProps} from './Track.ts';
import TrackResolver from './TrackResolver.ts';
import AudioPlayer from './Player.ts';

export default class Music {
  private readonly config: Config;
  private readonly logger: Logger;
  current: Track | undefined;
  private waiting: Track[] = [];
  private loading: { url: string; title?: string } | undefined;
  private titleWorker: Promise<void> | undefined;
  private readonly titleAbort = new AbortController();
  private readonly player: AudioPlayer;
  private readonly resolver: TrackResolver;
  private worker: Promise<void> | undefined;
  private active: AbortController | undefined;
  private closed = false;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.player = new AudioPlayer(this.config.music);
    this.resolver = new TrackResolver(this.config);
  }

  public get queuedTracks() {
    const entries = this.loading ? [this.loading, ...this.waiting] : this.waiting;

    return entries.map(({ title }) => ({ title }));
  }

  public async enqueue(props: TrackProps) {
    if (this.closed) throw new Error('Музыкальная очередь остановлена.');
    if (this.waiting.length >= 100) throw new Error('Очередь заполнена.');

    const track = await this.resolver.fromProps(props);

    this.waiting.push(track);
    this.startWorker();
  }

  pause(): Promise<void> {
    return this.player.setPaused(true);
  }

  resume(): Promise<void> {
    return this.player.setPaused(false);
  }

  setVolume(volume: number): Promise<void> {
    return this.player.setVolume(volume);
  }

  skip() {
    const track = this.current;

    this.active?.abort();

    return track;
  }

  cancel(userName: string, idx: number) {
    const track = this.waiting.at(idx);

    if (!track) {
      return;
    }
    if (track.userName !== userName) {
      throw 'permission denied';
    }

    this.waiting = this.waiting.toSpliced(idx, 1);

    return track;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.waiting = [];
    this.active?.abort();
    this.titleAbort.abort();

    await this.titleWorker;
    await this.worker;
    await this.player.close();
  }

  private startWorker(): void {
    if (this.worker || this.closed) return;
    this.worker = this.run().finally(() => {
      this.worker = undefined;
      // A redemption can arrive between the last track ending and this callback.
      if (this.waiting.length > 0) this.startWorker();
    });
  }

  private async run(): Promise<void> {
    while (!this.closed && this.waiting.length > 0) {
      const entry = this.waiting.shift()!;
      const controller = new AbortController();

      this.active = controller;

      try {
        this.loading = undefined;
        this.current = entry;

        await this.player.play(entry, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) this.logger.error(String(error));
      } finally {
        this.loading = undefined;
        this.current = undefined;
        this.active = undefined;
      }
    }
  }
}
