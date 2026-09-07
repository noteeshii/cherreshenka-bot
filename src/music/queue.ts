import { youtubeUrl } from './youtube.ts';
import type { Track } from './youtube.ts';

export interface AudioPlayer {
  play(track: Track, signal: AbortSignal): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  setVolume(volume: number): Promise<void>;
  close(): Promise<void>;
}

export interface Music {
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
  private readonly waiting: string[] = [];
  private readonly player: AudioPlayer;
  private readonly resolve: Resolver;
  private readonly reportError: (error: unknown) => void;
  private worker: Promise<void> | undefined;
  private active: AbortController | undefined;
  private closed = false;

  constructor(player: AudioPlayer, resolve: Resolver, reportError: (error: unknown) => void) {
    this.player = player;
    this.resolve = resolve;
    this.reportError = reportError;
  }

  enqueue(input: string): void {
    if (this.closed) throw new Error('Музыкальная очередь остановлена.');
    if (this.waiting.length >= 100) throw new Error('Очередь заполнена.');
    this.waiting.push(youtubeUrl(input));
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

  async skip(): Promise<void> {
    this.active?.abort();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.waiting.length = 0;
    this.active?.abort();
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
      const url = this.waiting.shift()!;
      const controller = new AbortController();
      this.active = controller;
      try {
        const track = await this.resolve(url, controller.signal);
        controller.signal.throwIfAborted();
        this.current = track;
        await this.player.play(track, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) this.reportError(error);
      } finally {
        this.current = undefined;
        this.active = undefined;
      }
    }
  }
}
