import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_LASER_SCAN_OFFSET,
  type LaserScanOffset,
  type Point2,
} from './laserCam';

export const LASER_MACHINE_PROFILE_KEY = 'smartcnc.laser.machine-profile';
export const LASER_MACHINE_PROFILE_EVENT = 'smartcnc:laser-machine-profile-changed';

export interface LaserMachineProfile {
  offset: Point2;
  scanOffsets: LaserScanOffset[];
}

export const DEFAULT_LASER_MACHINE_PROFILE: LaserMachineProfile = {
  offset: { x: 0, y: 0 },
  scanOffsets: [],
};

/**
 * Valide un profil machine laser (offset XY et table de compensation aller-retour)
 */
export function isValidLaserMachineProfile(raw: unknown): raw is LaserMachineProfile {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as { offset?: unknown; scanOffsets?: unknown };
  if (!candidate.offset || typeof candidate.offset !== 'object') return false;
  const offset = candidate.offset as { x?: unknown; y?: unknown };
  if (typeof offset.x !== 'number' || typeof offset.y !== 'number') return false;
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) return false;
  if (!Array.isArray(candidate.scanOffsets)) return false;

  const feeds = new Set<number>();
  for (const row of candidate.scanOffsets) {
    if (!row || typeof row !== 'object') return false;
    const item = row as { feed?: unknown; offset?: unknown };
    if (typeof item.feed !== 'number' || typeof item.offset !== 'number') return false;
    if (!Number.isFinite(item.feed) || item.feed <= 0) return false;
    if (!Number.isFinite(item.offset) || Math.abs(item.offset) > MAX_LASER_SCAN_OFFSET) return false;
    if (feeds.has(item.feed)) return false;
    feeds.add(item.feed);
  }
  return true;
}

/**
 * Charge le profil machine laser depuis localStorage avec fallback sûr
 */
export function loadLaserMachineProfile(): LaserMachineProfile {
  try {
    const raw = localStorage.getItem(LASER_MACHINE_PROFILE_KEY);
    if (!raw) return DEFAULT_LASER_MACHINE_PROFILE;
    const parsed = JSON.parse(raw);
    if (!isValidLaserMachineProfile(parsed)) return DEFAULT_LASER_MACHINE_PROFILE;
    return {
      offset: { x: parsed.offset.x, y: parsed.offset.y },
      scanOffsets: parsed.scanOffsets.map((row) => ({ feed: row.feed, offset: row.offset })),
    };
  } catch {
    return DEFAULT_LASER_MACHINE_PROFILE;
  }
}

/**
 * Sauvegarde et diffuse les changements du profil machine laser
 */
export function saveLaserMachineProfile(profile: LaserMachineProfile): void {
  const normalized: LaserMachineProfile = isValidLaserMachineProfile(profile)
    ? {
        offset: { x: profile.offset.x, y: profile.offset.y },
        scanOffsets: profile.scanOffsets.map((row) => ({ feed: row.feed, offset: row.offset })),
      }
    : DEFAULT_LASER_MACHINE_PROFILE;

  try {
    localStorage.setItem(LASER_MACHINE_PROFILE_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error('Erreur sauvegarde profil machine laser SmartCNC', err);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LASER_MACHINE_PROFILE_EVENT, { detail: normalized }));
  }
}

/**
 * Hook React synchronisé entre Atelier Laser et Réglages machine
 */
export function useLaserMachineProfile() {
  const [profile, setProfile] = useState<LaserMachineProfile>(() => loadLaserMachineProfile());
  const latest = useRef(profile);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const next = (event as CustomEvent<LaserMachineProfile>).detail ?? loadLaserMachineProfile();
      latest.current = next;
      setProfile(next);
    };

    window.addEventListener(LASER_MACHINE_PROFILE_EVENT, handleChange);
    return () => {
      window.removeEventListener(LASER_MACHINE_PROFILE_EVENT, handleChange);
    };
  }, []);

  const updateProfile = useCallback(
    (patch: Partial<LaserMachineProfile> | ((prev: LaserMachineProfile) => LaserMachineProfile)) => {
      const next =
        typeof patch === 'function' ? patch(latest.current) : { ...latest.current, ...patch };
      saveLaserMachineProfile(next);
    },
    []
  );

  const resetProfile = useCallback(() => {
    saveLaserMachineProfile(DEFAULT_LASER_MACHINE_PROFILE);
  }, []);

  return {
    profile,
    updateProfile,
    resetProfile,
  };
}
