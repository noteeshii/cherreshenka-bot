import type { StreamerChatMessage } from '#extensions';

import type { Context, Action, TemporaryUserStorage } from './types.ts';

export default class SendStickerToOverlay implements Action {
  private get name() {
    return this.constructor.name;
  }

  public check(input: string) {
    return input === this.name;
  }

  public async run(message: StreamerChatMessage, { storage, overlay }: Context) {
    const userStorage = storage.getUserTemporary<TemporaryUserStorage>(message.user.login);
    let isPinned = false;
    let isReward = false;

    if (userStorage.countPinnedStickerRedeemed) {
      userStorage.countPinnedStickerRedeemed = userStorage.countPinnedStickerRedeemed - 1;
      isReward = true;
      isPinned = true;
    } else if (userStorage.countBasicStickerRedeemed) {
      userStorage.countBasicStickerRedeemed = userStorage.countBasicStickerRedeemed - 1;
      isReward = true;
    }

    overlay.onMessage(message, { isPinned, isReward });

    storage.setUserTemporary(message.user.login, userStorage);
  }
}
