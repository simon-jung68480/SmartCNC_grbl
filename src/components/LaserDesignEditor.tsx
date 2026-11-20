import React, { useId, useMemo, useRef, useState } from 'react';
import { Circle, Minus, MousePointer2, Square, Trash2 } from 'lucide-react';
import { boundsOfPaths, placePaths, type Bounds2, type LaserPath, type Placement, type Point2 } from '../utils/laserCam';
import { useAppPreferences } from '../utils/appPreferences';
import { laserRasterBounds, type LaserDocumentObject } from '../utils/laserDocument';
import { laserFillRegions, prepareLaserFill } from '../utils/laserFill';
import { laserShapeNames, laserShapePath, type LaserShape } from '../utils/laserShapes';

interface Props {
  objects: LaserDocumentObject[];
  selectedId: string;
  bed: Bounds2;
  disabled: boolean;
  lockedRatio: boolean;
  onSelect: (id: string) => void;
  onPlacement: (id: string, placement: Placement) => void;
  onDraw: (shape: LaserShape, path: LaserPath) => void;
  onRemove: (id: string) => void;
}
const button = 'inline-flex items-center justify-center min-h-8 rounded-lg border border-slate-700/80 bg-[#1b2436] px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:bg-[#243047] disabled:opacity-40 cursor-pointer transition-colors';
const tools = [{ tool: 'select', label: 'Sélectionner', Icon: MousePointer2 }, { tool: 'line', label: 'Ligne', Icon: Minus },
  { tool: 'rectangle', label: 'Rectangle', Icon: Square }, { tool: 'ellipse', label: 'Ellipse', Icon: Circle }] as const;
const pathData = (path: LaserPath) => path.points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${-point.y}`).join(' ') + (path.fillClosed ? 'Z' : '');

export function LaserDesignEditor({ objects, selectedId, bed, disabled, lockedRatio, onSelect, onPlacement, onDraw, onRemove }: Props) {
  const { preferences } = useAppPreferences();
  const isLight = preferences.theme === 'light';
  const svg = useRef<SVGSVGElement>(null);
  const gridId = useId();
  const [tool, setTool] = useState<'select' | LaserShape>('select');
  const drawing = useRef<{ shape: LaserShape; start: Point2 } | null>(null);
  const [draft, setDraft] = useState<LaserPath | null>(null);
  const [fit, setFit] = useState<'bed' | 'drawing'>('bed');
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; placement: Placement; bounds: Bounds2 } | null>(null);
  const [dragFrame, setDragFrame] = useState<Bounds2 | null>(null);
  const geometries = useMemo(() => objects.filter(object => !object.hidden).map(object => {
    try {
      if (object.raster) return { object, bounds: laserRasterBounds(object.placement), groups: [] };
      const paths = placePaths(object.paths, object.placement);
      const b = boundsOfPaths(paths.filter(path => path.fillOperation !== 'subtract'));
      const groups: { d: string; fill: string; rule: 'nonzero' | 'evenodd'; stroke: boolean }[] = [];
      if (object.fill.mode !== 'contours') {
        const regions = laserFillRegions(paths, object.fill.respectSvgFill);
        groups.push({ d: regions.map(pathData).join(' '), fill: object.color ?? '#334155', rule: 'evenodd', stroke: object.fill.mode === 'fill-and-contours' });
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
    if (disabled || tool !== 'select' || event.button !== 0) return;
    const start = point(event), geometry = geometries.find(value => value.object.id === id);
    if (!start || !geometry?.bounds) return;
    event.stopPropagation();
    svg.current?.parentElement?.focus();
    onSelect(id);
    drag.current = { id, mode, start, placement: { ...geometry.object.placement }, bounds: geometry.bounds };
    setDragFrame(frame);
    svg.current?.setPointerCapture(event.pointerId);
  };
  const selected = objects.find(object => object.id === selectedId && !object.hidden);
  const drawAt = (event: React.PointerEvent) => {
    const state = drawing.current, end = point(event);
    if (!state || !end || disabled) return null;
    const { shape, start } = state;
    if (event.shiftKey && shape !== 'line') {
      const length = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
      end.x = start.x + (end.x < start.x ? -length : length);
      end.y = start.y + (end.y < start.y ? -length : length);
    }
    return laserShapePath(shape, start, end);
  };
  const finish = (event: React.PointerEvent<SVGSVGElement>, commit: boolean) => {
    const state = drawing.current;
    const path = state && commit ? drawAt(event) : null;
    drawing.current = null;
    drag.current = null;
    setDraft(null);
    setDragFrame(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (state && path) onDraw(state.shape, path);
  };
  const move = (event: React.PointerEvent) => {
    if (drawing.current) { setDraft(drawAt(event)); return; }
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
        const b = object.raster ? laserRasterBounds(next) : boundsOfPaths(placePaths(object.paths, next).filter(path => path.fillOperation !== 'subtract'));
        next.x += state.bounds.minX - b.minX; next.y += state.bounds.minY - b.minY;
        onPlacement(state.id, next);
      } catch { /* Keep the last valid dimensions while dragging. */ }
    }
  };
  const gridStep = Math.pow(10, Math.floor(Math.log10(Math.max(width, height) / 8)));
  const rulerStep = gridStep * 5;
  const rulerTicks = (min: number, max: number) => Array.from({ length: Math.max(0, Math.floor(max / rulerStep) - Math.ceil(min / rulerStep) + 1) }, (_, index) => (Math.ceil(min / rulerStep) + index) * rulerStep);
  return <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#141b27] text-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.28)]">
    <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-800 bg-[#0f1520]">
      <div><h2 className="text-sm font-bold text-slate-50">Plateau de dessin</h2><p className="text-[11px] text-slate-300">{tool === 'select' ? 'Glisser pour déplacer · poignée pour redimensionner' : `${laserShapeNames[tool]} · glisser sur le plateau`}</p></div>
      <div className="flex gap-1.5"><button className={button} onClick={() => { setFit('bed'); setZoom(1); }}>Plateau</button><button className={button} onClick={() => { setFit('drawing'); setZoom(1); }}>Dessin</button><button className={button} aria-label="Zoom arrière du dessin" onClick={() => setZoom(value => Math.max(.25, value / 1.3))}>−</button><button className={button} aria-label="Zoom avant du dessin" onClick={() => setZoom(value => Math.min(20, value * 1.3))}>+</button></div>
    </div>
    <div className="flex border-t border-slate-800">
    <div role="group" aria-label="Outils de dessin" className="flex shrink-0 flex-col gap-1.5 border-r border-slate-800 bg-[#0f1520] p-2">
      {tools.map(({ tool: value, label, Icon }) => <button key={value} type="button" title={label} aria-label={label} aria-pressed={tool === value} disabled={disabled}
        className={`grid size-9 place-items-center rounded-lg cursor-pointer transition-colors disabled:opacity-40 ${tool === value ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400' : 'text-slate-300 hover:bg-[#1b2436] hover:text-white'}`} onClick={() => setTool(value)}><Icon size={17} /></button>)}
      <button type="button" title="Supprimer le tracé sélectionné (Suppr)" aria-label="Supprimer la sélection du dessin" disabled={disabled || !selected}
        className="grid size-9 place-items-center rounded-lg text-rose-300 hover:bg-rose-950/60 cursor-pointer disabled:opacity-40" onClick={() => selected && onRemove(selected.id)}><Trash2 size={17} /></button>
    </div>
    <div tabIndex={0} aria-label="Éditeur de composition laser" className="min-w-0 flex-1 focus:outline-sky-400" onKeyDown={event => {
      if (event.key === 'Escape') { setTool('select'); drawing.current = null; setDraft(null); return; }
      if (disabled || !selected || drawing.current || drag.current) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (!event.repeat) onRemove(selected.id);
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 1 : .1;
      onPlacement(selected.id, { ...selected.placement, x: selected.placement.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: selected.placement.y + (event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0) });
    }}>
      <svg ref={svg} role="img" aria-label="Placement des objets dans le repère pièce en millimètres" viewBox={`${x} ${y} ${width} ${height}`} className={`h-[clamp(370px,64vh,850px)] w-full touch-none bg-[#0d121b] ${tool === 'select' ? '' : 'cursor-crosshair'}`}
        onPointerDown={event => {
          if (disabled || tool === 'select' || event.button !== 0) return;
          const start = point(event);
          if (!start) return;
          event.currentTarget.parentElement?.focus();
          drawing.current = { shape: tool, start };
          setDragFrame(frame);
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={move} onPointerUp={event => finish(event, true)} onPointerCancel={event => finish(event, false)}>
        <defs><pattern id={gridId} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M0 0H${gridStep} M0 0V${gridStep}`} stroke="#d6e1ea" strokeWidth={unit * 0.85} /></pattern></defs>
        <rect x={bed.minX} y={-bed.maxY} width={bed.width} height={bed.height} fill="white" />
        <rect x={bed.minX} y={-bed.maxY} width={bed.width} height={bed.height} fill={`url(#${gridId})`} stroke="#94a3b8" strokeWidth={unit} />
        <path d={`M${bed.minX} 0H${bed.maxX} M0 ${-bed.minY}V${-bed.maxY}`} stroke="#cbd5e1" strokeWidth={unit} />
        <g fontSize={unit * 10} fill={isLight ? '#334155' : '#cbd5e1'} pointerEvents="none" aria-hidden="true">
          {rulerTicks(Math.max(bed.minX, x), Math.min(bed.maxX, x + width)).map(tick => <text key={tick} x={tick} y={-bed.maxY - unit * 4} textAnchor="middle">{Number(tick.toFixed(3))}</text>)}
          {rulerTicks(Math.max(bed.minY, -y - height), Math.min(bed.maxY, -y)).map(tick => <text key={tick} x={bed.minX - unit * 5} y={-tick + unit * 3} textAnchor="end">{Number(tick.toFixed(3))}</text>)}
        </g>
        {geometries.map(({ object, bounds: b, groups }) => b && <g key={object.id} opacity={object.enabled ? 1 : .35} style={{ cursor: !disabled && tool === 'select' ? 'move' : undefined }} onPointerDown={event => begin(event, object.id, 'move')}>
          <title>{`${object.name} — ${object.enabled ? 'gravure active' : 'exclu de la gravure'}`}</title>
          {object.raster && <image href={object.raster.previewUrl} x={b.minX} y={-b.maxY} width={b.width} height={b.height} preserveAspectRatio="none" />}
          {groups.map((group, index) => <path key={index} d={group.d} fill={group.fill} fillRule={group.rule} stroke={group.stroke ? object.color ?? '#475569' : 'none'} strokeWidth={unit * 1.5} />)}
          <rect x={b.minX} y={-b.maxY} width={Math.max(b.width, unit * 5)} height={Math.max(b.height, unit * 5)} fill="transparent" stroke={object.id === selectedId ? '#0284c7' : 'transparent'} strokeWidth={unit} strokeDasharray={`${unit * 5} ${unit * 3}`} />
          {object.id === selectedId && !disabled && tool === 'select' && <rect x={b.maxX - unit * 4} y={-b.maxY - unit * 4} width={unit * 8} height={unit * 8} fill="white" stroke="#0284c7" strokeWidth={unit * 1.5} style={{ cursor: 'nesw-resize' }} onPointerDown={event => begin(event, object.id, 'resize')} />}
        </g>)}
        {draft && <path d={pathData(draft)} fill="none" stroke="#0369a1" strokeWidth={unit * 2} pointerEvents="none" />}
        <circle cx={0} cy={0} r={unit * 3} fill="#e11d48" pointerEvents="none" />
      </svg>
    </div>
    </div>
  </section>;
}
