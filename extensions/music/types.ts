export interface RawTrack {
  title: string;
  url: string;
}

export interface Provider {
  resolve(url: string, signal: AbortSignal): Promise<RawTrack>;
}
