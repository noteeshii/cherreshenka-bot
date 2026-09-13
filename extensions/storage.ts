import { readFile, writeFile } from 'node:fs/promises';

type Node = {
  users: Record<string, any>;
  variables: Record<string, any>;
};

export default class Storage {
  private isSaved = true;
  private timer: NodeJS.Timeout | null = null;

  private temporary: Node = {
    users: {},
    variables: {},
  };
  private permanent: Node = {
    users: {},
    variables: {},
  };

  private get storagePath() {
    return new URL('./../storage.json', import.meta.url);
  }

  public setTemporary(values: Node) {
    this.temporary = values;
    this.isSaved = false;
  }

  public setPermanent(values: Node) {
    this.permanent = values;
    this.isSaved = false;
  }

  public getTemporary() {
    return this.temporary;
  }

  public getPermanent() {
    return this.permanent;
  }

  public getUserTemporary<Res extends {}>(userName: string) {
    return (this.temporary.users?.[userName] ?? {}) as Res;
  }

  public getUserPermanent<Res extends {}>(userName: string) {
    return (this.permanent.users?.[userName] ?? {}) as Res;
  }

  public setUserTemporary<Val extends {}>(userName: string, value: Val) {
    this.temporary.users[userName] = value;
    this.isSaved = false;
  }

  public setUserPermanent<Val extends {}>(userName: string, value: Val) {
    this.permanent.users[userName] = value;
    this.isSaved = false;
  }

  public async open() {
    const file = await readFile(this.storagePath, { encoding: 'utf8', flag: 'r' }).catch((err) => {
      console.error(err);
      return '';
    });

    if (file.length) {
      this.permanent = JSON.parse(file);
    }

    this.autoSave();
  }

  public async close() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    await this.save();
  }

  private async save() {
    const content = JSON.stringify(this.permanent, undefined, 2);

    await writeFile(this.storagePath, content);
  }

  private async autoSave() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (!this.isSaved) {
      await this.save();

      this.isSaved = true;
    }

    this.timer = setTimeout(() => {
      this.autoSave();
    }, 5000);
  }
}
