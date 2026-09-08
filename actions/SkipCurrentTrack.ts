import type { Context, Action } from './types.ts';

export default class SkipCurrentTrack implements Action {
  public get type() {
    return 'command' as const;
  }

  public get moderator() {
    return true;
  }

  public check(input: string) {
    return ['!пропустить', '!skip'].includes(input);
  }

  public async run(_args: unknown, { music }: Context) {
    await music.skip();
  }
}
