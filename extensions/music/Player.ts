import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import type { Config } from '#extensions';
import type Track from './Track.ts';

// One mpv process per track: its exit marks the end of playback, including skips.
export default class Player {
  private readonly binary: string;
  private process: ChildProcess | undefined;
  private socketPath: string | undefined;
  private paused = false;
  private volume = 50;
  private volumeUpdate: Promise<void> = Promise.resolve();

  constructor(config: Config['music']) {
    this.binary = config.mpvPath;
  }

  async play(track: Track, signal: AbortSignal): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'cherreshenka-'));
    const socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\cherreshenka-${randomUUID()}`
        : join(directory, 'mpv.sock');
    try {
      signal.throwIfAborted();
      const child = spawn(
        this.binary,
        [
          '--no-config',
          '--no-video',
          '--no-terminal',
          '--no-ytdl',
          '--input-media-keys=no',
          '--network-timeout=30',
          `--pause=${this.paused ? 'yes' : 'no'}`,
          `--volume=${this.volume}`,
          `--input-ipc-server=${socketPath}`,
          '--',
          track.url,
        ],
        { stdio: 'ignore', windowsHide: true },
      );
      this.process = child;
      this.socketPath = socketPath;
      await new Promise<void>((resolve, reject) => {
        const stop = () => {
          child.kill('SIGKILL');
        };
        signal.addEventListener('abort', stop, { once: true });
        child.once('error', reject);
        child.once('close', (code) => {
          signal.removeEventListener('abort', stop);
          if (code === 0 || signal.aborted) resolve();
          else reject(new Error(`mpv завершился с кодом ${code}: ${track.title}`));
        });
        if (signal.aborted) stop();
      });
    } finally {
      this.process = undefined;
      this.socketPath = undefined;
      this.paused = false;
      await rm(directory, { recursive: true, force: true });
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    this.paused = paused;
    await this.setProperty('pause', paused);
  }

  async setVolume(volume: number): Promise<void> {
    if (!Number.isInteger(volume) || volume < 1 || volume > 100) {
      throw new Error('Громкость должна быть целым числом от 1 до 100.');
    }
    this.volume = volume;
    // Serialize updates so a delayed IPC connection cannot restore an older value.
    this.volumeUpdate = this.volumeUpdate
      .catch(() => {})
      .then(() => this.setProperty('volume', this.volume));
    await this.volumeUpdate;
  }

  private async setProperty(name: string, value: number | boolean): Promise<void> {
    const path = this.socketPath;
    if (!path) return;
    // The player may still be creating its IPC socket immediately after spawn.
    for (let attempt = 0; attempt < 20; attempt++) {
      if (this.socketPath !== path) return;
      try {
        await sendCommand(path, ['set_property', name, value]);
        return;
      } catch (error) {
        if (attempt === 19) throw error;
        await delay(100);
      }
    }
  }

  async close(): Promise<void> {
    this.process?.kill('SIGKILL');
  }
}

export function sendCommand(path: string, command: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket: Socket = connect(path);
    let buffer = '';
    let settled = false;
    const timer = setTimeout(() => finish(new Error('mpv не ответил на команду')), 2000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    }
    socket.once('error', finish);
    socket.once('end', () => finish(new Error('mpv закрыл соединение')));
    socket.once('connect', () => {
      socket.write(JSON.stringify({ command, request_id: 1 }) + '\n');
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const response = JSON.parse(line);
          if (response.request_id === 1) {
            finish(response.error === 'success' ? undefined : new Error(`mpv: ${response.error}`));
          }
        } catch {
          finish(new Error('Некорректный ответ mpv'));
        }
      }
    });
  });
}
