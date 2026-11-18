import { generateRasterGCode, generateVectorGCode, laserSpotDiameter, MAX_LASER_LINES, placePaths, type LaserCutSettings, type LaserPath, type Placement, type RasterData, type RasterSettings } from './laserCam';
import { prepareLaserFill, type LaserFillSettings } from './laserFill';
import { applyLaserLayerSettings, laserLayerGroups, laserLayerKey, readLaserLayerSettings } from './laserLayerSettings';

export interface LaserDocumentObject {
  id: string;
  name: string;
  paths: LaserPath[];
  raster?: { image: RasterData; previewUrl: string; settings: Omit<RasterSettings, 'width' | 'height' | 'x' | 'y'> };
  warnings: string[];
  placement: Placement;
  cut: LaserCutSettings;
  contourCut?: Pick<LaserCutSettings, 'feed' | 'power' | 'passes' | 'contourDirection'>;
  fill: LaserFillSettings;
  enabled: boolean;
  color?: string;
  isolatedColor?: boolean;
  hidden?: boolean;
}

export function laserRasterBounds({ x, y, width, height, anchor }: Placement) {
  const minX = x - (anchor === 'center' ? width / 2 : 0);
  const minY = y - (anchor === 'center' ? height / 2 : 0);
  return { minX, minY, maxX: minX + width, maxY: minY + height, width, height };
}

/** Each imported drawing keeps its own paint order and holes. Never union separate objects. */
export function generateLaserDocument(objects: LaserDocumentObject[], globalCut: LaserCutSettings) {
  const enabled = laserLayerGroups(objects).flatMap(([first, ...others]) => {
    const settings = readLaserLayerSettings(first);
    return [first, ...others.map(object => applyLaserLayerSettings(object, settings))].filter(object => object.enabled);
  });
  if (!enabled.length) throw new Error('Activez au moins un objet à graver.');
  const manualFocus = enabled.find(object => object.cut.focus?.enabled && !object.cut.focus.controlZ && object.cut.focus.offset !== 0)?.cut.focus;
  if (manualFocus && enabled.some(({ cut: { focus } }) => !focus?.enabled || focus.controlZ || focus.offset !== manualFocus.offset))
    throw new Error('Les calques exigent des hauteurs de focus différentes. Activez le pilotage Z ou lancez séparément les calques hors focus manuel.');
  const programs: string[] = [], notes: string[] = [];
  let lineCount = 0, rasterOverscan = 0, spotDiameter = 0;
  const append = (code: string) => {
    lineCount += code.split('\n').length + (programs.length ? 1 : 0);
    if (lineCount > MAX_LASER_LINES) throw new Error('Projet trop volumineux : augmentez le pas de balayage ou réduisez les passes.');
    programs.push(code);
  };
  for (const [index, object] of enabled.entries()) {
    const focus = object.cut.focus;
    const cut = { ...object.cut, mode: globalCut.mode, maxPower: globalCut.maxPower, scanOffsets: globalCut.scanOffsets,
      focus: focus?.enabled && focus.controlZ && index < enabled.length - 1 ? { ...focus, restoreZ: true } : focus };
    spotDiameter = Math.max(spotDiameter, laserSpotDiameter(cut));
    if (object.raster) {
      const { image, settings } = object.raster;
      const { minX, minY, width, height } = laserRasterBounds(object.placement);
      append(generateRasterGCode(image, { ...settings, width, height, x: minX, y: minY }, cut, object.name));
      rasterOverscan = Math.max(rasterOverscan, settings.overscan ?? 0);
      continue;
    }
    const prepared = prepareLaserFill(placePaths(object.paths, object.placement), object.fill, laserSpotDiameter(cut));
    if (prepared.paths.some(path => path.scanline)) rasterOverscan = Math.max(rasterOverscan, object.fill.overscan ?? 0);
    notes.push(...prepared.notes.map(note => `${object.name} : ${note}`));
    const operations = object.fill.mode === 'fill-and-contours' && object.contourCut ? [
      { paths: prepared.paths.filter(path => path.scanline), cut, name: `${object.name} · Remplissage` },
      { paths: prepared.paths.filter(path => !path.scanline), cut: {
        ...cut, feed: object.contourCut.feed, power: object.contourCut.power, passes: object.contourCut.passes,
        contourDirection: object.contourCut.contourDirection ?? cut.contourDirection,
      }, name: `${object.name} · Contours` },
    ] : [{ paths: prepared.paths, cut, name: object.name }];
    const nonEmptyOperations = operations.length > 1 ? operations.filter(operation => operation.paths.length) : operations;
    for (const [index, operation] of nonEmptyOperations.entries()) {
      const focus = operation.cut.focus;
      const operationCut = focus?.enabled && focus.controlZ && index < nonEmptyOperations.length - 1
        ? { ...operation.cut, focus: { ...focus, restoreZ: false } } : operation.cut;
      append(generateVectorGCode(operation.paths, operationCut, operation.name));
    }
  }
  return { code: programs.join('\nM5\n'), notes, rasterOverscan, spotDiameter };
}

export function duplicateLaserObject(object: LaserDocumentObject, id: string): LaserDocumentObject {
  return { ...object, id, name: `${object.name.slice(0, 992)} (copie)`, placement: { ...object.placement, x: object.placement.x + 5, y: object.placement.y + 5 } };
}

export function moveLaserObject(objects: LaserDocumentObject[], id: string, direction: -1 | 1): LaserDocumentObject[] {
  const groups = laserLayerGroups(objects);
  const groupIndex = groups.findIndex(group => group.some(object => object.id === id));
  if (groupIndex < 0) return objects;
  const group = groups[groupIndex];
  const index = group.findIndex(object => object.id === id);
  const neighbor = index + direction;
  if (neighbor >= 0 && neighbor < group.length) {
    [group[index], group[neighbor]] = [group[neighbor], group[index]];
  } else {
    const next = groupIndex + direction;
    if (!groups[next]) return objects;
    [groups[groupIndex], groups[next]] = [groups[next], groups[groupIndex]];
  }
  return groups.flat();
}
