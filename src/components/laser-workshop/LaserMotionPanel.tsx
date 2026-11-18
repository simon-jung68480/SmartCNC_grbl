import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Move } from "lucide-react";
import type { GrblStatus } from "../../types/cnc";
import { button, card, NumberField } from "./LaserControls";

type Props = {
  status: GrblStatus;
  step: number;
  zStep: number;
  feed: number;
  canMove: boolean;
  canTurnOff: boolean;
  showZ: boolean;
  onStep: (value: number) => void;
  onZStep: (value: number) => void;
  onFeed: (value: number) => void;
  onJog: (axes: { x?: number; y?: number; z?: number }, feed: number) => void;
  onZero: () => void;
  onLaserOff: () => void;
};

const arrows = [
  { label: "Déplacer Y positif", axis: "y", direction: 1, position: "col-start-2 row-start-1", Icon: ArrowUp },
  { label: "Déplacer X négatif", axis: "x", direction: -1, position: "col-start-1 row-start-2", Icon: ArrowLeft },
  { label: "Déplacer X positif", axis: "x", direction: 1, position: "col-start-3 row-start-2", Icon: ArrowRight },
  { label: "Déplacer Y négatif", axis: "y", direction: -1, position: "col-start-2 row-start-3", Icon: ArrowDown },
] as const;

export function LaserMotionPanel({ status, step, zStep, feed, canMove, canTurnOff, showZ, onStep, onZStep, onFeed, onJog, onZero, onLaserOff }: Props) {
  const canJog = canMove && Number.isFinite(feed) && feed > 0;
  const canJogXY = canJog && step >= 0.01 && step <= 100;
  const canJogZ = canJog && zStep >= 0.01 && zStep <= 10;

  return <section className={card}>
    <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Move size={16} /> Déplacement manuel</h2>
    <div className="grid grid-cols-3 gap-1 text-center font-mono text-xs">
      {(["x", "y", "z"] as const).map(axis => <div key={axis} className="rounded bg-slate-100 py-2">
        <span className="text-slate-500">{axis.toUpperCase()}</span><br />
        <b>{status.connected ? status.wpos[axis].toFixed(2) : "—"}</b>
      </div>)}
    </div>
    <p className="my-3 text-xs">{status.connected ? status.state : "Déconnectée"} · {status.activeWCS} · mm</p>
    <div className="grid grid-cols-2 gap-2">
      <NumberField label="Pas XY (mm)" value={step} min={0.01} max={100} onChange={onStep} />
      <NumberField label="Avance (mm/min)" value={feed} min={1} onChange={onFeed} />
    </div>
    <div className="mx-auto my-3 grid w-44 grid-cols-3 gap-1" aria-label="Déplacements XY" role="group">
      {arrows.map(({ label, axis, direction, position, Icon }) => <button key={label} type="button" aria-label={label}
        className={`${button} ${position}`} disabled={!canJogXY} onClick={() => onJog({ [axis]: step * direction }, feed)}>
        <Icon size={15} aria-hidden="true" />
      </button>)}
      <button type="button" className={`${button} col-start-2 row-start-2`} disabled={!canMove} onClick={onZero}
        title="Mettre à zéro la position pièce sur X et Y">XY 0</button>
    </div>
    {showZ && <div className="mb-3 grid grid-cols-2 items-end gap-2">
      <NumberField label="Pas Z (mm)" value={zStep} min={0.01} max={10} onChange={onZStep} />
      <div className="flex gap-1">
        <button type="button" className={`${button} flex-1`} aria-label="Déplacer Z positif" disabled={!canJogZ} onClick={() => onJog({ z: zStep }, feed)}>Z+</button>
        <button type="button" className={`${button} flex-1`} aria-label="Déplacer Z négatif" disabled={!canJogZ} onClick={() => onJog({ z: -zStep }, feed)}>Z−</button>
      </div>
    </div>}
    <button type="button" className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-800 disabled:opacity-40"
      disabled={!canTurnOff} onClick={onLaserOff}>Éteindre le laser (M5)</button>
  </section>;
}
