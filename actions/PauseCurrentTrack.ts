import type { Context, Action } from './types.ts';

export default class PauseCurrentTrack implements Action {
  public get type() {
    return 'command' as const;
  }

  public get moderator() {
    return true;
  }

  public check(input: string) {
    return ['!пауза', '!pause'].includes(input);
  }

  public async run(_args: unknown, { music }: Context) {
    await music.pause();
  }
}
