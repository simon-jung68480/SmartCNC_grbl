import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LASER_MACHINE_PROFILE,
  isValidLaserMachineProfile,
  LASER_MACHINE_PROFILE_KEY,
  loadLaserMachineProfile,
  saveLaserMachineProfile,
} from "../src/utils/laserMachineProfile.ts";
import { MAX_LASER_SCAN_OFFSET } from "../src/utils/laserCam.ts";

function installMockStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  return {
    store,
    restore: () => {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    },
  };
}

test("isValidLaserMachineProfile validates offset and unique bounded scanOffsets", () => {
  assert.equal(
    isValidLaserMachineProfile({ offset: { x: 1.5, y: -2 }, scanOffsets: [{ feed: 1200, offset: 0.25 }] }),
    true,
  );
  assert.equal(isValidLaserMachineProfile({ offset: { x: NaN, y: 0 }, scanOffsets: [] }), false);
  assert.equal(
    isValidLaserMachineProfile({ offset: { x: 0, y: 0 }, scanOffsets: [{ feed: 0, offset: 0.2 }] }),
    false,
  );
  assert.equal(
    isValidLaserMachineProfile({
      offset: { x: 0, y: 0 },
      scanOffsets: [{ feed: 1000, offset: MAX_LASER_SCAN_OFFSET + 1 }],
    }),
    false,
  );
  assert.equal(
    isValidLaserMachineProfile({
      offset: { x: 0, y: 0 },
      scanOffsets: [
        { feed: 1000, offset: 0.1 },
        { feed: 1000, offset: 0.2 },
      ],
    }),
    false,
  );
});

test("saveLaserMachineProfile and loadLaserMachineProfile roundtrip valid profiles and fallback on corruption", () => {
  const mock = installMockStorage();
  try {
    assert.deepEqual(loadLaserMachineProfile(), DEFAULT_LASER_MACHINE_PROFILE);

    saveLaserMachineProfile({
      offset: { x: 12.5, y: -4.2 },
      scanOffsets: [
        { feed: 1500, offset: 0.18 },
        { feed: 3000, offset: -0.35 },
      ],
    });
    assert.deepEqual(loadLaserMachineProfile(), {
      offset: { x: 12.5, y: -4.2 },
      scanOffsets: [
        { feed: 1500, offset: 0.18 },
        { feed: 3000, offset: -0.35 },
      ],
    });

    mock.store.set(LASER_MACHINE_PROFILE_KEY, "{not-valid-json");
    assert.deepEqual(loadLaserMachineProfile(), DEFAULT_LASER_MACHINE_PROFILE);
  } finally {
    mock.restore();
  }
});
