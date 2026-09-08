export default class Track {
  public readonly url: string;
  public readonly title: string;
  public readonly userName: string;
  public readonly rewardId: string;
  public readonly redemptionId: string;

  constructor(url: string, title: string, userName: string, rewardId: string, redemptionId: string) {
    this.url = url;
    this.title = title;
    this.userName = userName;
    this.rewardId = rewardId;
    this.redemptionId = redemptionId;
  }
}

export type TrackProps = Pick<Track, 'redemptionId' | 'rewardId' | 'userName' | 'url'>;
