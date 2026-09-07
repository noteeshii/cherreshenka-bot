import { youtubeUrl } from './youtube.ts';
import type { Track } from './youtube.ts';

export interface AudioPlayer {
  play(track: Track, signal: AbortSignal): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  setVolume(volume: number): Promise<void>;
  close(): Promise<void>;
}

export interface QueuedTrack {
  readonly url: string;
  readonly title?: string;
}

export interface Music {
  readonly queuedTracks: readonly QueuedTrack[];
  readonly current: Track | undefined;
  enqueue(input: string): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  setVolume(volume: number): Promise<void>;
}

type Resolver = (url: string, signal: AbortSignal) => Promise<Track>;

export class MusicQueue implements Music {
  current: Track | undefined;
  private readonly waiting: { url: string; title?: string }[] = [];
  private loading: { url: string; title?: string } | undefined;
  private readonly titleResolver?: (url: string, signal: AbortSignal) => Promise<string>;
  private titleWorker: Promise<void> | undefined;
  private readonly titleAbort = new AbortController();
  private readonly player: AudioPlayer;
  private readonly resolve: Resolver;
  private readonly reportError: (error: unknown) => void;
  private worker: Promise<void> | undefined;
  private active: AbortController | undefined;
  private closed = false;

  constructor(
    player: AudioPlayer,
    resolve: Resolver,
    reportError: (error: unknown) => void,
    titleResolver?: (url: string, signal: AbortSignal) => Promise<string>,
  ) {
    this.titleResolver = titleResolver;
    this.player = player;
    this.resolve = resolve;
    this.reportError = reportError;
  }

  get queuedTracks(): readonly QueuedTrack[] {
    const entries = this.loading ? [this.loading, ...this.waiting] : this.waiting;
    return entries.map(({ url, title }) => ({ url, title }));
  }

  enqueue(input: string): void {
    if (this.closed) throw new Error('Музыкальная очередь остановлена.');
    if (this.waiting.length >= 100) throw new Error('Очередь заполнена.');
    this.waiting.push({ url: youtubeUrl(input) });
    this.startWorker();
    this.startTitleWorker();
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

  async skip(): Promise<void> {
    this.active?.abort();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.waiting.length = 0;
    this.active?.abort();
    this.titleAbort.abort();
    await this.titleWorker;
    await this.worker;
    await this.player.close();
  }

  private startTitleWorker(): void {
    if (!this.titleResolver || this.titleWorker || this.closed) return;
    this.titleWorker = this.loadTitles().finally(() => {
      this.titleWorker = undefined;
      if (this.waiting.some((track) => track.title === undefined)) this.startTitleWorker();
    });
  }

  private async loadTitles(): Promise<void> {
    while (!this.closed) {
      const track = this.waiting.find((track) => track.title === undefined);
      if (!track || !this.titleResolver) return;
      try {
        track.title = await this.titleResolver(track.url, this.titleAbort.signal);
      } catch {
        // Keep the request playable even when its display title cannot be fetched.
        track.title = '';
      }
    }
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
      this.loading = entry;
      const { url } = entry;
      const controller = new AbortController();
      this.active = controller;
      try {
        const track = await this.resolve(url, controller.signal);
        controller.signal.throwIfAborted();
        this.loading = undefined;
        this.current = track;
        await this.player.play(track, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) this.reportError(error);
      } finally {
        this.loading = undefined;
        this.current = undefined;
        this.active = undefined;
      }
    }
  }
}
