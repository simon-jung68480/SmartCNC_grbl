import React, { useMemo, useRef, useState } from 'react';
import { boundsOfPaths, placePaths, type Bounds2, type Placement } from '../utils/laserCam';
import type { LaserDocumentObject } from '../utils/laserDocument';
import { laserFillRegions, prepareLaserFill } from '../utils/laserFill';

interface Props {
  objects: LaserDocumentObject[];
  selectedId: string;
  bed: Bounds2;
  disabled: boolean;
  lockedRatio: boolean;
  onSelect: (id: string) => void;
  onPlacement: (id: string, placement: Placement) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: (id: string) => void;
}
const button = 'rounded border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-40';

export function LaserDesignEditor({ objects, selectedId, bed, disabled, lockedRatio, onSelect, onPlacement, onDuplicate, onDelete, onToggle }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [fit, setFit] = useState<'bed' | 'drawing'>('bed');
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; placement: Placement; bounds: Bounds2 } | null>(null);
  const [dragFrame, setDragFrame] = useState<Bounds2 | null>(null);
  const geometries = useMemo(() => objects.map(object => {
    try {
      const paths = placePaths(object.paths, object.placement);
      const b = boundsOfPaths(paths.filter(path => path.fillOperation !== 'subtract'));
      const groups: { d: string; fill: string; rule: 'nonzero' | 'evenodd'; stroke: boolean }[] = [];
      const pathData = (path: typeof paths[number]) => path.points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${-point.y}`).join(' ') + (path.fillClosed ? 'Z' : '');
      if (object.fill.mode !== 'contours') {
        const regions = laserFillRegions(paths, object.fill.respectSvgFill);
        groups.push({ d: regions.map(pathData).join(' '), fill: '#334155', rule: 'evenodd', stroke: object.fill.mode === 'fill-and-contours' });
      }
      const strokes = object.fill.mode === 'contours' ? prepareLaserFill(paths, { ...object.fill, mode: 'contours' }, .15).paths : object.fill.mode === 'fill' ? [] : paths.filter(path => {
        const first = path.points[0], last = path.points[path.points.length - 1];
        const closed = path.fillClosed || (first && last && Math.hypot(first.x - last.x, first.y - last.y) < .001);
        return path.contourEnabled !== false && path.fillOperation !== 'subtract' && (!closed || (object.fill.respectSvgFill && path.fillEnabled === false));
      });
      for (const path of strokes) groups.push({ d: pathData(path), fill: 'none', rule: 'evenodd', stroke: true });
      return { object, bounds: b, groups };
    } catch { return { object, bounds: null, groups: [] }; }
  }), [objects]);
  const allBounds = geometries.flatMap(geometry => geometry.bounds ? [{ points: [{ x: geometry.bounds.minX, y: geometry.bounds.minY }, { x: geometry.bounds.maxX, y: geometry.bounds.maxY }] }] : []);
  let frame = bed;
  if (fit === 'drawing' && allBounds.length) frame = boundsOfPaths(allBounds);
  frame = dragFrame ?? frame;
  const pad = Math.max(frame.width, frame.height, 10) * .08 + 1;
  const width = (Math.max(frame.width, 1) + 2 * pad) / zoom, height = (Math.max(frame.height, 1) + 2 * pad) / zoom;
  const x = (frame.minX + frame.maxX - width) / 2, y = -(frame.minY + frame.maxY + height) / 2;
  const unit = Math.max(width, height) / 600;
  const point = (event: React.PointerEvent) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: -p.y };
  };
  const begin = (event: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
    if (disabled || event.button !== 0) return;
    const start = point(event), geometry = geometries.find(value => value.object.id === id);
    if (!start || !geometry?.bounds) return;
    event.stopPropagation();
    onSelect(id);
    drag.current = { id, mode, start, placement: { ...geometry.object.placement }, bounds: geometry.bounds };
    setDragFrame(frame);
    svg.current?.setPointerCapture(event.pointerId);
  };
  const selected = objects.find(object => object.id === selectedId);
  const move = (event: React.PointerEvent) => {
    const state = drag.current, p = point(event);
    if (!state || !p || disabled) return;
    if (state.mode === 'move') {
      const next = { ...state.placement, x: state.placement.x + p.x - state.start.x, y: state.placement.y + p.y - state.start.y };
      if (event.shiftKey) { next.x = Math.round(next.x); next.y = Math.round(next.y); }
      onPlacement(state.id, next);
    } else {
      const sx = Math.max(.01, 1 + (p.x - state.start.x) / Math.max(state.bounds.width, .01));
      const sy = Math.max(.01, 1 + (p.y - state.start.y) / Math.max(state.bounds.height, .01));
      const scale = Math.max(sx, sy);
      const next = { ...state.placement, width: state.placement.width * (lockedRatio ? scale : sx), height: state.placement.height * (lockedRatio ? scale : sy) };
      const object = objects.find(object => object.id === state.id)!;
      try {
        const b = boundsOfPaths(placePaths(object.paths, next).filter(path => path.fillOperation !== 'subtract'));
        next.x += state.bounds.minX - b.minX; next.y += state.bounds.minY - b.minY;
        onPlacement(state.id, next);
      } catch { /* Keep the last valid dimensions while dragging. */ }
    }
  };
  return <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-200">
      <div><h2 className="text-sm font-bold">Composition SVG / DXF</h2><p className="text-[11px] text-slate-500">Glisser pour déplacer · poignée pour redimensionner · Maj : pas de 1 mm · flèches : 0,1 mm</p></div>
      <div className="flex gap-1"><button className={button} onClick={() => { setFit('bed'); setZoom(1); }}>Plateau</button><button className={button} onClick={() => { setFit('drawing'); setZoom(1); }}>Dessin</button><button className={button} aria-label="Zoom arrière du dessin" onClick={() => setZoom(value => Math.max(.25, value / 1.3))}>−</button><button className={button} aria-label="Zoom avant du dessin" onClick={() => setZoom(value => Math.min(20, value * 1.3))}>+</button></div>
    </div>
    <div tabIndex={0} aria-label="Éditeur de composition laser" className="focus:outline-sky-500" onKeyDown={event => {
      if (disabled || !selected || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 1 : .1;
      onPlacement(selected.id, { ...selected.placement, x: selected.placement.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: selected.placement.y + (event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0) });
    }}>
      <svg ref={svg} role="img" aria-label="Placement des objets dans le repère pièce en millimètres" viewBox={`${x} ${y} ${width} ${height}`} className="w-full h-[420px] bg-slate-50 touch-none" onPointerMove={move} onPointerUp={event => { drag.current = null; setDragFrame(null); if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; setDragFrame(null); }}>
        <rect x={bed.minX} y={-bed.maxY} width={bed.width} height={bed.height} fill="white" stroke="#94a3b8" strokeWidth={unit} />
        <path d={`M${bed.minX} 0H${bed.maxX} M0 ${-bed.minY}V${-bed.maxY}`} stroke="#cbd5e1" strokeWidth={unit} />
        {geometries.map(({ object, bounds: b, groups }, i) => b && <g key={object.id} opacity={object.enabled ? 1 : .25} style={{ cursor: disabled ? 'default' : 'move' }} onPointerDown={event => begin(event, object.id, 'move')}>
          <title>{object.name} — {object.enabled ? 'gravure active' : 'exclu de la gravure'}</title>
          {groups.map((group, index) => <path key={index} d={group.d} fill={group.fill} fillRule={group.rule} stroke={group.stroke ? (object.id === selectedId ? '#0284c7' : '#475569') : 'none'} strokeWidth={unit * 1.2} />)}
          <rect x={b.minX} y={-b.maxY} width={Math.max(b.width, unit * 5)} height={Math.max(b.height, unit * 5)} fill="transparent" stroke={object.id === selectedId ? '#0284c7' : 'transparent'} strokeWidth={unit} strokeDasharray={`${unit * 5} ${unit * 3}`} />
          <text x={b.minX} y={-b.maxY - unit * 5} fontSize={unit * 10} fill="#0369a1">{i + 1}</text>
          {object.id === selectedId && !disabled && <rect x={b.maxX - unit * 4} y={-b.maxY - unit * 4} width={unit * 8} height={unit * 8} fill="white" stroke="#0284c7" strokeWidth={unit * 1.5} style={{ cursor: 'nesw-resize' }} onPointerDown={event => begin(event, object.id, 'resize')} />}
        </g>)}
        <circle cx={0} cy={0} r={unit * 3} fill="#e11d48" pointerEvents="none" />
      </svg>
    </div>
    <div className="p-3 border-t border-slate-200 space-y-2">
      <div className="flex flex-wrap gap-2 items-center"><strong className="text-xs">Objets · ordre de gravure</strong><button className={button} disabled={disabled || !selected} onClick={onDuplicate}>Dupliquer</button><button className={button} disabled={disabled || objects.length < 2} onClick={onDelete}>Supprimer</button><span className="text-[10px] text-slate-500">Les réglages s’appliquent à l’objet sélectionné. Importer un SVG/DXF ajoute un objet.</span></div>
      {objects.map((object, i) => <div key={object.id} className={`flex items-center gap-2 p-2 rounded border ${object.id === selectedId ? 'border-sky-400 bg-sky-50' : 'border-slate-200'}`}><input type="checkbox" checked={object.enabled} disabled={disabled} aria-label={`Graver ${object.name}`} onChange={() => onToggle(object.id)} /><button className="text-left text-xs flex-1 truncate disabled:opacity-50" disabled={disabled} onClick={() => onSelect(object.id)}>{i + 1}. {object.name}</button><span className="text-[10px] text-slate-500">{object.cut.feed} mm/min · {object.cut.power}% · {object.cut.passes} passe(s)</span></div>)}
      <p className="text-[10px] text-slate-500">Aperçu de composition : le parcours réel des hachures et la largeur du spot sont affichés après génération ci-dessous.</p>
    </div>
  </section>;
}
