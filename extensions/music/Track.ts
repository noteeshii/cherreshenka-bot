export default class Track {
  public readonly url: string;
  public readonly title: string;

  constructor(url: string, title: string) {
    this.url = url;
    this.title = title;
  }
}
