import { readFile, writeFile } from 'node:fs/promises';

type Node = {
  users: Record<string, unknown>;
  variables: Record<string, unknown>;
};

export default class Storage {
  private temporary: Node = {
    users: {},
    variables: {},
  };
  private permanent: Node = {
    users: {},
    variables: {},
  };

  constructor() {}

  private get storagePath() {
    return new URL('./../storage.json', import.meta.url);
  }

  public setTemporary(values: Node) {
    this.temporary = values;
  }

  public setPermanent(values: Node) {
    this.permanent = values;
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
  }

  public setUserPermanent<Val extends {}>(userName: string, value: Val) {
    this.permanent.users[userName] = value;
  }

  public async open() {
    const file = await readFile(this.storagePath, { encoding: 'utf8', flag: 'w+' });

    if (file.length) {
      this.permanent = JSON.parse(file);
    }
  }

  public async close() {
    const content = JSON.stringify(this.permanent, undefined, 2);

    await writeFile(this.storagePath, content);
  }
}
