import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StickerBoard, rollHalloweenEffect } from '../extensions/overlay/StickerBoard.ts';
import type { OverlaySettings } from '../extensions/overlay/types.ts';

const SETTINGS: OverlaySettings = {
  channel: 'fixture',
  lifetime: 30,
  rewardMode: false,
  safeTop: 8,
  safeRight: 8,
  safeBottom: 8,
  safeLeft: 8,
  safeAreaExcluded: false,
  theme: 'halloween',
};

test('Halloween-эффекты занимают четыре равных диапазона случайного броска', () => {
  const cases = [
    [0, 'none'],
    [0.249_999, 'none'],
    [0.25, 'spider'],
    [0.499_999, 'spider'],
    [0.5, 'ghosts'],
    [0.749_999, 'ghosts'],
    [0.75, 'pumpkin'],
    [0.999_999, 'pumpkin'],
  ] as const;

  for (const [roll, expected] of cases) {
    assert.equal(
      rollHalloweenEffect(() => roll),
      expected,
    );
  }
});

test('Halloween-декор назначается независимо от существующего эффекта стикера', (t) => {
  const randomValues = [0.02, 0.6];
  t.mock.method(Math, 'random', () => randomValues.shift() ?? 0.5);

  const board = new StickerBoard({
    profileId: 'halloween',
    settings: () => SETTINGS,
    onChange: () => {},
  });
  t.after(() => board.dispose());

  board.add({ messageId: 'message', author: 'viewer', text: 'Boo!' });

  assert.equal(board.items.length, 1);
  assert.equal(board.items[0]?.effect, 'holographic');
  assert.equal(board.items[0]?.halloweenEffect, 'ghosts');
});
