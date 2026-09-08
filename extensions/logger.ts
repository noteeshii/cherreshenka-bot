import Config from './config.ts';

class Logger {
  private readonly config: Config['logger'];
  private context: string[];

  constructor(config: Config['logger'], context: string[] = []) {
    this.config = config;
    this.context = context;
  }

  static fromConfig(config: Config) {
    return new Logger(config.logger);
  }

  public withContext(contextLevel: string) {
    return new Logger(this.config, this.context.concat([contextLevel]));
  }

  private checkLevel(level: string) {
    if (this.config.level !== level || this.config.level !== 'all') {
      return false;
    }

    return true;
  }

  public error(message: string) {
    if (this.checkLevel('error')) {
      return;
    }
    const localContext = ['Error'].concat(this.context);

    console.log(`${localContext.join(': ')}: ${message}`);
  }

  public warn(message: string) {
    if (this.checkLevel('warn')) {
      return;
    }
    const localContext = ['Warn'].concat(this.context);

    console.log(`${localContext.join(': ')}: ${message}`);
  }

  public info(message: string) {
    if (this.checkLevel('info')) {
      return;
    }

    const localContext = ['Info'].concat(this.context);

    console.log(`${localContext.join(': ')}: ${message}`);
  }

  public debug(message: string) {
    if (this.checkLevel('debug')) {
      return;
    }

    const localContext = ['Debug'].concat(this.context);

    console.log(`${localContext.join(': ')}: ${message}`);
  }
}

export default Logger;
