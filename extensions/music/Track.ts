export default class Track {
  public readonly url: string;
  public readonly title: string;
  public readonly userName: string;
  public readonly rewardId: string;
  public readonly redemptionId: string;
  public readonly source: 'youtube' | 'yandex';
  public readonly rawUrl: string;

  constructor(
    url: string,
    title: string,
    userName: string,
    rewardId: string,
    redemptionId: string,
    source: 'yandex' | 'youtube',
    rawUrl: string,
  ) {
    this.url = url;
    this.title = title;
    this.userName = userName;
    this.rewardId = rewardId;
    this.redemptionId = redemptionId;
    this.source = source;
    this.rawUrl = rawUrl;
  }
}

export type TrackProps = Pick<Track, 'redemptionId' | 'rewardId' | 'userName' | 'url'>;
