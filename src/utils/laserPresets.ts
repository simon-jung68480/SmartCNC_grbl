import type { LaserLayerSettings } from './laserLayerSettings';
import { validateLaserLayerSettings } from './laserProject';

export interface LaserPreset {
  id: string;
  name: string;
  category: string;
  settings: LaserLayerSettings;
}

export const laserPresetStorageKey = 'smartcnc.laser.presets.v1';

export function parseLaserPresets(text: string): LaserPreset[] {
  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length > 500) throw new Error('Bibliothèque de réglages invalide.');
  const ids = new Set<string>();
  return rows.map(row => {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
        typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80 ||
        typeof row.category !== 'string' || row.category.length > 80) throw new Error('Préréglage invalide.');
    ids.add(row.id);
    return { id: row.id, name: row.name, category: row.category, settings: validateLaserLayerSettings(row.settings) };
  });
}
