import type { Context, Action } from './types.ts';

export default class ResumeCurrentTrack implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run(_args: unknown, { music, logger }: Context) {
    await music.resume().catch(logger.error.bind(logger));
  }
}
