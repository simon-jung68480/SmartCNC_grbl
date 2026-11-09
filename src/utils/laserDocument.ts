import { generateVectorGCode, laserSpotDiameter, MAX_LASER_LINES, placePaths, type LaserCutSettings, type LaserPath, type Placement } from './laserCam';
import { prepareLaserFill, type LaserFillSettings } from './laserFill';

export interface LaserDocumentObject {
  id: string;
  name: string;
  paths: LaserPath[];
  warnings: string[];
  placement: Placement;
  cut: LaserCutSettings;
  fill: LaserFillSettings;
  enabled: boolean;
}

/** Each imported drawing keeps its own paint order and holes. Never union separate objects. */
export function generateLaserDocument(objects: LaserDocumentObject[], globalCut: LaserCutSettings) {
  const enabled = objects.filter(object => object.enabled);
  if (!enabled.length) throw new Error('Activez au moins un objet à graver.');
  const programs: string[] = [], notes: string[] = [];
  let lineCount = 0;
  for (const object of enabled) {
    const cut = { ...object.cut, mode: globalCut.mode, maxPower: globalCut.maxPower, focus: globalCut.focus };
    const prepared = prepareLaserFill(placePaths(object.paths, object.placement), object.fill, laserSpotDiameter(cut));
    notes.push(...prepared.notes.map(note => `${object.name} : ${note}`));
    const code = generateVectorGCode(prepared.paths, cut, object.name);
    lineCount += code.split('\n').length;
    if (lineCount > MAX_LASER_LINES) throw new Error('Projet trop volumineux : augmentez le pas des hachures ou réduisez les passes.');
    programs.push(code);
  }
  return { code: programs.join('\nM5\n'), notes };
}

export function duplicateLaserObject(object: LaserDocumentObject, id: string): LaserDocumentObject {
  return { ...object, id, name: `${object.name} (copie)`, placement: { ...object.placement, x: object.placement.x + 5, y: object.placement.y + 5 } };
}
