
export default class User {
  public readonly id: string;
  public readonly name: string;
  public readonly isModerator: boolean;
  public readonly isSubscribed: boolean;
  public readonly isVip: boolean;

  constructor(
    id: string,
    name: string,
    isModerator: boolean,
    isSubscribed: boolean,
    isVip: boolean
  ) {
    this.id = id;
    this.name = name;
    this.isModerator = isModerator;
    this.isSubscribed = isSubscribed;
    this.isVip = isVip;
  }

  static fromProps(props: Props) {
    return new User(
      props.id,
      props.name,
      props.isModerator,
      props.isSubscribed,
      props.isVip
    );
  }
}

export type Props = {
  id: string;
  name: string;
  isModerator: boolean;
  isSubscribed: boolean;
  isVip: boolean;
};

