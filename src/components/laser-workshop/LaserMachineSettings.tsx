import { Plus, Settings2, Trash2 } from "lucide-react";
import type { LaserScanOffset, Point2 } from "../../utils/laserCam";
import type { LaserJobAnchor, LaserJobPlacement } from "../../utils/laserJobPlacement";

const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const button = "rounded-md border border-slate-300 bg-white px-2 py-1.5 font-semibold hover:bg-slate-100 disabled:opacity-40";
const anchors: { value: LaserJobAnchor; label: string }[] = [
  { value: "top-left", label: "Haut gauche" },
  { value: "top-center", label: "Haut centre" },
  { value: "top-right", label: "Haut droite" },
  { value: "middle-left", label: "Milieu gauche" },
  { value: "center", label: "Centre" },
  { value: "middle-right", label: "Milieu droite" },
  { value: "bottom-left", label: "Bas gauche" },
  { value: "bottom-center", label: "Bas centre" },
  { value: "bottom-right", label: "Bas droite" },
];

type Props = {
  placement: LaserJobPlacement;
  onPlacement: (placement: LaserJobPlacement) => void;
  scanOffsets: readonly LaserScanOffset[];
  onScanOffsets: (offsets: LaserScanOffset[]) => void;
  disabled: boolean;
};

function NumericInput({ value, onChange, label, min }: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
}) {
  return <input className={field} type="number" step="any" min={min} aria-label={label}
    value={Number.isFinite(value) ? value : ""} onChange={event => onChange(event.target.valueAsNumber)} />;
}

export function LaserMachineSettings({ placement, onPlacement, scanOffsets, onScanOffsets, disabled }: Props) {
  return (
    <fieldset disabled={disabled} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm disabled:opacity-60">
      <h2 className="flex items-center gap-2 text-sm font-bold"><Settings2 size={16} /> Compensations machine</h2>
      <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
        {(["x", "y"] as const).map(axis => <label key={axis} className="space-y-1 text-xs">
          <span>Offset {axis.toUpperCase()} (mm)</span>
          <NumericInput label={`Offset ${axis.toUpperCase()} (mm)`} value={placement.offset[axis]}
            onChange={value => onPlacement({ ...placement, offset: { ...placement.offset, [axis]: value } })} />
        </label>)}
      </div>
      <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Offset aller-retour</h3>
          <button type="button" className={`${button} flex items-center gap-1`} onClick={() => {
            let feed = 1200;
            while (scanOffsets.some(point => point.feed === feed)) feed += 1000;
            onScanOffsets([...scanOffsets, { feed, offset: 0 }]);
          }}><Plus size={13} /> Ajouter</button>
        </div>
        {scanOffsets.length > 0 && <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-slate-600"><span>Avance (mm/min)</span><span>Offset (mm)</span><span className="w-8" /></div>}
        {scanOffsets.map((point, index) => <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2" key={index}>
          <NumericInput label={`Avance du point ${index + 1}`} value={point.feed} min={1}
            onChange={feed => onScanOffsets(scanOffsets.map((row, rowIndex) => rowIndex === index ? { ...row, feed } : row))} />
          <NumericInput label={`Offset du point ${index + 1}`} value={point.offset}
            onChange={offset => onScanOffsets(scanOffsets.map((row, rowIndex) => rowIndex === index ? { ...row, offset } : row))} />
          <button type="button" className={button} aria-label={`Supprimer le point ${index + 1}`}
            onClick={() => onScanOffsets(scanOffsets.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={15} /></button>
        </div>)}
        <p className="text-slate-600">Saisissez la moitié du décalage mesuré entre les deux sens. Une valeur positive corrige dans le sens opposé au déplacement. Entre deux vitesses, la correction est interpolée.</p>
      </div>
    </fieldset>
  );
}

export function LaserJobOrigin({ placement, onPlacement, position, canCapture, disabled }: {
  placement: LaserJobPlacement;
  onPlacement: Props["onPlacement"];
  position: Point2;
  canCapture: boolean;
  disabled: boolean;
}) {
  return <fieldset className="space-y-2" disabled={disabled}>
      <label className="block space-y-1 text-xs font-semibold">
        <span>Départ depuis</span>
        <select className={field} value={placement.startFrom} onChange={event => onPlacement({ ...placement, startFrom: event.target.value as LaserJobPlacement["startFrom"] })}>
          <option value="absolute">Coordonnées du dessin (repère pièce)</option>
          <option value="current-position">Position actuelle de la tête</option>
          <option value="work-origin">Origine pièce (X0 Y0)</option>
          <option value="user-origin">Origine utilisateur</option>
        </select>
      </label>
      {placement.startFrom !== "absolute" && <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span>Point d’ancrage du rectangle</span>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Point d’ancrage du rectangle">
            {anchors.map(({ value, label }) => <button key={value} type="button" aria-label={label} title={label}
              aria-pressed={value === placement.anchor}
              className={`h-7 w-7 rounded-md border ${value === placement.anchor ? "border-sky-700 bg-sky-700 text-white" : "border-slate-300 bg-slate-50 text-slate-500 hover:bg-sky-100"}`}
              onClick={() => onPlacement({ ...placement, anchor: value })}>●</button>)}
          </div>
        </div>
        {placement.startFrom === "current-position" && <p className="text-xs text-slate-600">La position est relevée à la génération. Après un déplacement, générez à nouveau.</p>}
        {placement.startFrom === "user-origin" && <div className="space-y-1 text-xs">
          <button type="button" className={button} disabled={!canCapture} onClick={() => onPlacement({ ...placement, userOrigin: { x: position.x, y: position.y } })}>Mémoriser la position XY</button>
          <p className="text-slate-600">{placement.userOrigin ? `X ${placement.userOrigin.x.toFixed(3)} mm · Y ${placement.userOrigin.y.toFixed(3)} mm` : "Origine à mémoriser dans le repère pièce actif."}</p>
        </div>}
      </div>}
  </fieldset>;
}
