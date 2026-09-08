import type { Context, Action } from './types.ts';

export default class ResumeCurrentTrack implements Action {
  public get name() {
    return this.constructor.name;
  }

  public get type() {
    return 'command' as const;
  }

  public get moderator() {
    return true;
  }

  public check(input: string) {
    return ['!продолжить', '!resume'].includes(input);
  }

  public async run(_args: unknown, { music }: Context) {
    await music.resume();
  }
}
