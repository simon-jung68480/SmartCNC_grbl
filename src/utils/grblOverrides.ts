export const FEED_OVERRIDE_MIN = 10;
export const FEED_OVERRIDE_MAX = 200;

export const GRBL_FEED_RESET_100 = 0x90;
export const GRBL_FEED_PLUS_10 = 0x91;
export const GRBL_FEED_MINUS_10 = 0x92;
export const GRBL_FEED_PLUS_1 = 0x93;
export const GRBL_FEED_MINUS_1 = 0x94;

/**
 * Borne et arrondit un pourcentage d'override d'avance GRBL entre 10 % et 200 %
 */
export function clampFeedOverride(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(FEED_OVERRIDE_MIN, Math.min(FEED_OVERRIDE_MAX, Math.round(value)));
}

/**
 * Calcule la séquence de commandes temps réel GRBL (0x90..0x94)
 * pour passer de `currentPct` à `targetPct` de façon monotone sans dépasser les bornes.
 */
export function computeFeedOverrideBytes(currentPct: number, targetPct: number): number[] {
  const current = clampFeedOverride(currentPct);
  const target = clampFeedOverride(targetPct);

  if (current === target) return [];
  if (target === 100) return [GRBL_FEED_RESET_100];

  const diff = target - current;
  const absDiff = Math.abs(diff);
  const coarseCount = Math.floor(absDiff / 10);
  const fineCount = absDiff % 10;

  const coarseByte = diff > 0 ? GRBL_FEED_PLUS_10 : GRBL_FEED_MINUS_10;
  const fineByte = diff > 0 ? GRBL_FEED_PLUS_1 : GRBL_FEED_MINUS_1;

  const bytes: number[] = [];
  for (let i = 0; i < coarseCount; i++) bytes.push(coarseByte);
  for (let i = 0; i < fineCount; i++) bytes.push(fineByte);
  return bytes;
}

/**
 * Simule l'application d'une séquence d'octets d'override GRBL sur une valeur initiale
 */
export function applyFeedOverrideBytes(initialPct: number, bytes: readonly number[]): number {
  let value = clampFeedOverride(initialPct);
  for (const byte of bytes) {
    switch (byte) {
      case GRBL_FEED_RESET_100:
        value = 100;
        break;
      case GRBL_FEED_PLUS_10:
        value = Math.min(FEED_OVERRIDE_MAX, value + 10);
        break;
      case GRBL_FEED_MINUS_10:
        value = Math.max(FEED_OVERRIDE_MIN, value - 10);
        break;
      case GRBL_FEED_PLUS_1:
        value = Math.min(FEED_OVERRIDE_MAX, value + 1);
        break;
      case GRBL_FEED_MINUS_1:
        value = Math.max(FEED_OVERRIDE_MIN, value - 1);
        break;
      default:
        break;
    }
  }
  return value;
}
