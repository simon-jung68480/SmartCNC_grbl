import { defaultLaserFocusSettings, type LaserCutSettings } from '../../utils/laserCam';
import type { LaserLayerSettings } from '../../utils/laserLayerSettings';
import { input, NumberField } from './LaserControls';
import { LaserFocusSettings } from './LaserFocusSettings';

type Operation = LaserLayerSettings['cut'];

function OperationFields({ cut, onChange, contour }: { cut: Operation; onChange: (cut: Operation) => void; contour?: boolean }) {
  return <div className="grid grid-cols-2 gap-2">
    <NumberField label="Avance (mm/min)" value={cut.feed} min={0.001} onChange={feed => onChange({ ...cut, feed })} />
    <NumberField label="Puissance (%)" value={cut.power} min={0.001} max={100} onChange={power => onChange({ ...cut, power })} />
    <NumberField label="Passes" value={cut.passes} min={1} max={50} step={1} onChange={passes => onChange({ ...cut, passes })} />
    {contour && <label className="space-y-1 text-xs"><span>Sens du contour</span><select className={input} value={cut.contourDirection ?? 'original'}
      onChange={event => onChange({ ...cut, contourDirection: event.target.value as LaserCutSettings['contourDirection'] })}>
      <option value="original">Sens du tracé</option><option value="reverse">Sens inverse</option><option value="alternate">Alterner par passe</option>
    </select></label>}
  </div>;
}

export function LaserPresetEditor({ settings, disabled, onChange }: {
  settings: LaserLayerSettings; disabled: boolean; onChange: (settings: LaserLayerSettings) => void;
}) {
  const focus = settings.cut.focus ?? defaultLaserFocusSettings;
  return <fieldset disabled={disabled} className="space-y-4 rounded-lg border border-slate-200 p-3">
    <legend className="px-1 text-sm font-semibold">Paramètres de gravure</legend>
    {settings.kind === 'vector' && <label className="block space-y-1 text-xs"><span>Type de gravure</span>
      <select className={input} value={settings.fill.mode} onChange={event => onChange({ ...settings, fill: { ...settings.fill, mode: event.target.value as typeof settings.fill.mode } })}>
        <option value="contours">Contour</option><option value="fill">Remplissage</option><option value="fill-and-contours">Remplissage et contour</option>
      </select>
    </label>}
    <OperationFields cut={settings.cut} contour={settings.kind === 'vector' && settings.fill.mode === 'contours'} onChange={cut => onChange({ ...settings, cut })} />
    {settings.kind === 'vector' && settings.fill.mode !== 'contours' && <div className="space-y-2 border-t border-slate-200 pt-2">
      <h3 className="text-xs font-semibold">Remplissage</h3>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Pas des hachures (mm)" value={settings.fill.spacing} min={0.025} max={10} onChange={spacing => onChange({ ...settings, fill: { ...settings.fill, spacing } })} />
        <NumberField label="Angle (°)" value={settings.fill.angle} onChange={angle => onChange({ ...settings, fill: { ...settings.fill, angle } })} />
        <NumberField label="Surbalayage (mm)" value={settings.fill.overscan ?? 0} min={0} max={50} onChange={overscan => onChange({ ...settings, fill: { ...settings.fill, overscan } })} />
      </div>
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={settings.fill.bidirectional !== false} onChange={event => onChange({ ...settings, fill: { ...settings.fill, bidirectional: event.target.checked } })} />Balayage bidirectionnel</label>
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={settings.fill.crossHatch} onChange={event => onChange({ ...settings, fill: { ...settings.fill, crossHatch: event.target.checked } })} />Hachures croisées</label>
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={settings.fill.respectSvgFill} onChange={event => onChange({ ...settings, fill: { ...settings.fill, respectSvgFill: event.target.checked } })} />Respecter les aplats SVG</label>
    </div>}
    {settings.kind === 'vector' && settings.fill.mode === 'fill-and-contours' && <div className="space-y-2 border-t border-slate-200 pt-2">
      <label className="flex gap-2 text-xs font-semibold"><input type="checkbox" checked={!!settings.contourCut} onChange={event => {
        const { feed, power, passes, contourDirection } = settings.cut;
        onChange({ ...settings, contourCut: event.target.checked ? { feed, power, passes, contourDirection } : undefined });
      }} />Réglages distincts pour le contour</label>
      {settings.contourCut && <OperationFields cut={settings.contourCut} contour onChange={value => {
        const { feed, power, passes, contourDirection } = value;
        onChange({ ...settings, contourCut: { feed, power, passes, contourDirection } });
      }} />}
    </div>}
    {settings.kind === 'raster' && <div className="space-y-2 border-t border-slate-200 pt-2">
      <h3 className="text-xs font-semibold">Balayage de l’image</h3>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Pas de balayage (mm)" value={settings.raster.interval} min={0.025} onChange={interval => onChange({ ...settings, raster: { ...settings.raster, interval } })} />
        <NumberField label="Surbalayage (mm)" value={settings.raster.overscan ?? 0} min={0} max={50} onChange={overscan => onChange({ ...settings, raster: { ...settings.raster, overscan } })} />
      </div>
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={settings.raster.bidirectional !== false} onChange={event => onChange({ ...settings, raster: { ...settings.raster, bidirectional: event.target.checked } })} />Balayage bidirectionnel</label>
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={settings.raster.grayscale} onChange={event => onChange({ ...settings, raster: { ...settings.raster, grayscale: event.target.checked } })} />Niveaux de gris</label>
      {!settings.raster.grayscale && <NumberField label="Seuil (0–255)" value={settings.raster.threshold} min={0} max={255} onChange={threshold => onChange({ ...settings, raster: { ...settings.raster, threshold } })} />}
      <label className="flex gap-2 text-xs"><input type="checkbox" checked={settings.raster.invert} onChange={event => onChange({ ...settings, raster: { ...settings.raster, invert: event.target.checked } })} />Inverser le noir et le blanc</label>
    </div>}
    <LaserFocusSettings focus={focus} disabled={disabled} external={false} changeFocus={patch => onChange({ ...settings, cut: { ...settings.cut, focus: { ...focus, ...patch } } })} />
  </fieldset>;
}
