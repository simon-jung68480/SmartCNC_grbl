import type { LaserCutSettings } from './laserCam';
import type { LaserDocumentObject } from './laserDocument';

type Operation = Pick<LaserCutSettings, 'feed' | 'power' | 'passes' | 'contourDirection' | 'focus'>;
export type LaserLayerSettings = { cut: Operation } & (
  | { kind: 'vector'; fill: LaserDocumentObject['fill']; contourCut?: LaserDocumentObject['contourCut'] }
  | { kind: 'raster'; raster: NonNullable<LaserDocumentObject['raster']>['settings'] }
);

export const laserLayerKind = (object: LaserDocumentObject) => object.raster ? 'raster' : 'vector';

export function readLaserLayerSettings(object: LaserDocumentObject): LaserLayerSettings {
  const { feed, power, passes, contourDirection, focus } = object.cut;
  const cut = { feed, power, passes, focus };
  return object.raster
    ? { kind: 'raster', cut, raster: object.raster.settings }
    : { kind: 'vector', cut: { ...cut, contourDirection }, fill: object.fill, contourCut: object.contourCut };
}

export function applyLaserLayerSettings(object: LaserDocumentObject, settings: LaserLayerSettings): LaserDocumentObject {
  if (settings.kind !== laserLayerKind(object)) return object;
  const { feed, power, passes, contourDirection, focus } = settings.cut;
  const cut = { ...object.cut, feed, power, passes, contourDirection, focus };
  return settings.kind === 'raster' && object.raster
    ? { ...object, cut, raster: { ...object.raster, settings: settings.raster } }
    : settings.kind === 'vector' ? { ...object, cut, fill: settings.fill, contourCut: settings.contourCut } : object;
}

export function laserLayerKey(object: LaserDocumentObject) {
  return object.color && !object.isolatedColor ? `${laserLayerKind(object)}:${object.color.toLowerCase()}` : `object:${object.id}`;
}

export function laserLayerGroups(objects: LaserDocumentObject[]) {
  const groups = new Map<string, LaserDocumentObject[]>();
  for (const object of objects) {
    const key = laserLayerKey(object);
    const group = groups.get(key);
    if (group) group.push(object);
    else groups.set(key, [object]);
  }
  return [...groups.values()];
}

export function shareLaserLayerSettings(objects: LaserDocumentObject[], edited: LaserDocumentObject) {
  const key = laserLayerKey(edited), settings = readLaserLayerSettings(edited);
  return objects.map(object => object.id !== edited.id && laserLayerKey(object) === key
    ? applyLaserLayerSettings(object, settings) : object);
}

export function assignLaserLayerColor(object: LaserDocumentObject, color: string, otherObjects: LaserDocumentObject[]) {
  const recolored = { ...object, color, isolatedColor: undefined };
  const existing = otherObjects.find(other => other.id !== object.id && laserLayerKey(other) === laserLayerKey(recolored));
  return existing ? applyLaserLayerSettings(recolored, readLaserLayerSettings(existing)) : recolored;
}

export function preserveLegacyLaserColors(objects: LaserDocumentObject[]) {
  const recipes = new Map<string, string>();
  const stableJson = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const properties = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(properties).sort().map(key => [key, properties[key]]));
  });
  return objects.map(object => {
    if (!object.color) return object;
    const key = laserLayerKey(object);
    const settings = stableJson(readLaserLayerSettings(object));
    if (!recipes.has(key)) recipes.set(key, settings);
    return recipes.get(key) === settings ? object : { ...object, isolatedColor: true };
  });
}
