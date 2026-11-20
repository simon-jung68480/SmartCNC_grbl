import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFeedOverrideBytes,
  clampFeedOverride,
  computeFeedOverrideBytes,
  GRBL_FEED_MINUS_1,
  GRBL_FEED_MINUS_10,
  GRBL_FEED_PLUS_1,
  GRBL_FEED_PLUS_10,
  GRBL_FEED_RESET_100,
} from "../src/utils/grblOverrides.ts";

test("clampFeedOverride bounds values between 10 and 200", () => {
  assert.equal(clampFeedOverride(0), 10);
  assert.equal(clampFeedOverride(-50), 10);
  assert.equal(clampFeedOverride(250), 200);
  assert.equal(clampFeedOverride(127.6), 128);
  assert.equal(clampFeedOverride(Number.NaN), 100);
});

test("computeFeedOverrideBytes returns empty when already on target and 0x90 for 100%", () => {
  assert.deepEqual(computeFeedOverrideBytes(100, 100), []);
  assert.deepEqual(computeFeedOverrideBytes(135, 135), []);
  assert.deepEqual(computeFeedOverrideBytes(145, 100), [GRBL_FEED_RESET_100]);
  assert.deepEqual(computeFeedOverrideBytes(42, 100), [GRBL_FEED_RESET_100]);
});

test("computeFeedOverrideBytes emits exact coarse + fine bytes up and down", () => {
  assert.deepEqual(computeFeedOverrideBytes(100, 123), [
    GRBL_FEED_PLUS_10,
    GRBL_FEED_PLUS_10,
    GRBL_FEED_PLUS_1,
    GRBL_FEED_PLUS_1,
    GRBL_FEED_PLUS_1,
  ]);
  assert.deepEqual(computeFeedOverrideBytes(130, 86), [
    GRBL_FEED_MINUS_10,
    GRBL_FEED_MINUS_10,
    GRBL_FEED_MINUS_10,
    GRBL_FEED_MINUS_10,
    GRBL_FEED_MINUS_1,
    GRBL_FEED_MINUS_1,
    GRBL_FEED_MINUS_1,
    GRBL_FEED_MINUS_1,
  ]);
});

test("computeFeedOverrideBytes + applyFeedOverrideBytes converges across boundary and sample steps", () => {
  const samples = [10, 11, 27, 50, 99, 100, 101, 145, 199, 200];
  for (const from of samples) {
    for (const to of samples) {
      const seq = computeFeedOverrideBytes(from, to);
      assert.equal(applyFeedOverrideBytes(from, seq), to, `failed ${from} -> ${to}`);
    }
  }
});
