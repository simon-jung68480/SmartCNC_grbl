import React, { useEffect, useMemo, useRef, useState } from "react";
import { Focus, ZoomIn, ZoomOut, Scan } from "lucide-react";
import type { Coordinates, GCodeSegment, GrblStatus, JobStatus } from "../types/cnc";
import { executedLaserStrokes } from "../utils/laserPlayback";
import type { AppPreferences } from "../utils/appPreferences";
import {
  analyseLaserGCode,
  previewPath,
  type Bounds2,
} from "../utils/laserCam";
import { Viewport3D } from "./Viewport3D";

interface Props {
  analysis: ReturnType<typeof analyseLaserGCode> | null;
  status: GrblStatus;
  machineEnvelope: Coordinates;
  preferences: AppPreferences;
  spotDiameter: number;
  currentLineIndex: number;
  active: boolean;
  playback: JobStatus | null;
}
const button =
  "inline-flex items-center justify-center gap-1.5 min-h-8 px-2.5 py-1.5 rounded-lg border border-slate-700/80 bg-[#1b2436] hover:bg-[#243047] text-slate-100 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40";
const n = (v: number) => Number(v.toFixed(2)).toLocaleString("fr-FR");

export function LaserPreview({
  analysis,
  status,
  machineEnvelope,
  preferences,
  spotDiameter,
  currentLineIndex,
  active,
  playback,
}: Props) {
  const isLight = preferences.theme === "light";
  const [fullPreview, setFullPreview] = useState(false);
  useEffect(() => { setFullPreview(false); }, [playback?.startTime, analysis]);
  // Stop retains the last trace: the controller may reset its coordinates afterwards.
  const lastTrace = useRef<GCodeSegment[]>([]);
  useEffect(() => { lastTrace.current = []; }, [analysis, playback?.startTime]);
  const trace = useMemo(() => {
    if (!playback || fullPreview) return undefined;
    if (playback.state === 'aborted' || playback.state === 'error') return lastTrace.current;
    return executedLaserStrokes(analysis?.engraving || [], playback.currentLineIndex, status.wpos, playback.state === 'completed');
  }, [analysis, playback, status.wpos, fullPreview]);
  useEffect(() => { if (trace) lastTrace.current = trace; }, [trace]);
  const [mode, setMode] = useState<"3d" | "xy">("3d"),
    [fit, setFit] = useState<"machine" | "engraving">("machine");
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [rapids, setRapids] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const custom = useMemo(
    () =>
      preferences.useCustomBedDimensions
        ? { x: preferences.customBedWidth, y: preferences.customBedLength }
        : null,
    [
      preferences.useCustomBedDimensions,
      preferences.customBedWidth,
      preferences.customBedLength,
    ],
  );
  const validDimension = (value: number | undefined, fallback: number) =>
    value !== undefined && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  const bedWidth = validDimension(
      custom?.x,
      validDimension(machineEnvelope.x, 300),
    ),
    bedHeight = validDimension(
      custom?.y,
      validDimension(machineEnvelope.y, 300),
    );
  const bed: Bounds2 = {
    minX: -status.wco.x,
    minY: -status.wco.y,
    maxX: bedWidth - status.wco.x,
    maxY: bedHeight - status.wco.y,
    width: bedWidth,
    height: bedHeight,
  };
  const b = analysis?.bounds,
    frame = fit === "engraving" && b ? b : bed;
  const pad = Math.max(frame.width, frame.height, 1) * 0.1 + 2,
    vw = (Math.max(frame.width, 1) + pad * 2) / zoom,
    vh = (Math.max(frame.height, 1) + pad * 2) / zoom;
  const cx = (frame.minX + frame.maxX) / 2 + pan.x,
    cy = -(frame.minY + frame.maxY) / 2 + pan.y;
  const lw = Math.max(vw, vh) / 650,
    font = Math.max(vw, vh) / 65;
  const major =
    Number.isFinite(preferences.gridMajorStep) && preferences.gridMajorStep > 0
      ? preferences.gridMajorStep
      : 50;
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [analysis, fit]);
  const segments = useMemo(() => {
    const burn = new Set(analysis?.engraving || []);
    return (
      analysis?.segments.map((s) =>
        burn.has(s) ? s : { ...s, type: "G0" as const },
      ) || []
    );
  }, [analysis]);
  const burnPaths = useMemo(() => {
    const cuts = trace ?? analysis?.engraving ?? [],
      max = cuts.reduce((max, s) => Math.max(max, s.spindleSpeed), 1);
    const buckets: GCodeSegment[][] = Array.from({ length: 16 }, () => []),
      step = Math.max(1, Math.ceil(cuts.length / 16000));
    for (let i = 0; i < cuts.length; i += step)
      buckets[Math.min(15, Math.round((cuts[i].spindleSpeed / max) * 15))].push(
        cuts[i],
      );
    return buckets.map((segments, i) => ({
      path: previewPath(segments),
      opacity: 0.12 + (i / 15) * 0.88,
    }));
  }, [analysis, trace]);
  const rapidPath = useMemo(
    () =>
      previewPath(
        segments.filter((s) => s.type === "G0"),
        4000,
      ),
    [segments],
  );
  const gridLines = (axis: "x" | "y", step: number) =>
    Array.from(
      {
        length: Math.min(
          1001,
          Math.floor((axis === "x" ? bedWidth : bedHeight) / step) + 1,
        ),
      },
      (_, i) => i * step,
    );
  const outside =
    !!b &&
    (b.minX < bed.minX ||
      b.maxX > bed.maxX ||
      b.minY < bed.minY ||
      b.maxY > bed.maxY);
  return (
    <section className="rounded-xl border border-slate-800 bg-[#141b27] text-slate-100 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap justify-between gap-2 items-center mb-3">
        <h2 className="text-sm font-bold text-slate-50 flex gap-2 items-center">
          <Scan size={17} className="text-sky-400" />
          Aperçu sur la grille machine
        </h2>
        <div className="flex gap-1.5">
          {(["3d", "xy"] as const).map((value) => (
            <button
              key={value}
              className={`${button} ${mode === value ? "!bg-sky-400/20 !border-sky-400 !text-sky-200" : ""}`}
              onClick={() => setMode(value)}
            >
              {value === "3d" ? "Grille machine 3D" : "Plan XY / largeur"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-300 mb-2.5">
        Plateau {n(bedWidth)} × {n(bedHeight)} mm · grille 10 / {n(major)} mm ·
        mêmes paramètres que l’atelier CNC
      </p>
      {playback && (
        <label className="flex items-center gap-2 text-xs text-slate-200 mb-2.5 cursor-pointer">
          <input type="checkbox" className="accent-sky-400" checked={fullPreview} onChange={e => setFullPreview(e.target.checked)} />
          Afficher le dessin complet
          <span aria-live="polite" className="text-slate-300">· {playback.state === 'paused' ? 'En pause' : playback.state === 'completed' ? 'Gravure terminée' : playback.state === 'aborted' ? 'Lecture arrêtée' : 'Tracé progressif'} · ligne {playback.currentLineIndex + 1}</span>
        </label>
      )}
      {mode === "3d" ? (
        <div
          className="h-[430px] min-h-[300px] rounded-xl overflow-hidden border border-slate-800 bg-[#0d121b] relative"
          aria-label="Vue 3D laser avec grille machine CNC"
        >
          {active && (
            <Viewport3D
              status={status}
              segments={segments}
              stats={analysis?.stats || null}
              currentLineIndex={currentLineIndex}
              machineEnvelope={machineEnvelope}
              gridZOffset={preferences.gridZOffset}
              gridMajorStep={preferences.gridMajorStep}
              customBedDimensions={custom}
              laserBeamWidth={spotDiameter}
              laserTrace={trace}
            />
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            <button
              className={button}
              onClick={() => {
                setFit("machine");
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <Focus size={14} className="text-sky-400" />
              Toute la machine
            </button>
            <button
              className={button}
              disabled={!b}
              onClick={() => {
                setFit("engraving");
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Cadrer la gravure
            </button>
            <button
              className={button}
              title="Zoom arrière"
              onClick={() => setZoom((z) => Math.max(0.25, z / 1.4))}
            >
              <ZoomOut size={15} />
            </button>
            <button
              className={button}
              title="Zoom avant"
              onClick={() => setZoom((z) => Math.min(100, z * 1.4))}
            >
              <ZoomIn size={15} />
            </button>
          </div>
          <div className="h-[430px] relative rounded-xl overflow-hidden border border-slate-800 bg-[#0d121b]">
            <svg
              viewBox={`${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`}
              className="absolute inset-0 w-full h-full touch-none cursor-grab"
              role="img"
              aria-label={`Grille machine ${n(bedWidth)} par ${n(bedHeight)} mm ; largeur du spot ${n(spotDiameter)} mm`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  panX: pan.x,
                  panY: pan.y,
                };
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const rect = e.currentTarget.getBoundingClientRect(),
                  scale = Math.max(vw / rect.width, vh / rect.height);
                setPan({
                  x: drag.current.panX - (e.clientX - drag.current.x) * scale,
                  y: drag.current.panY - (e.clientY - drag.current.y) * scale,
                });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <rect
                x={bed.minX}
                y={-bed.maxY}
                width={bedWidth}
                height={bedHeight}
                fill="white"
                stroke="#64748b"
                strokeWidth={lw * 1.5}
              />
              {gridLines("x", 10).map((x) => (
                <line
                  key={`x${x}`}
                  x1={x - status.wco.x}
                  x2={x - status.wco.x}
                  y1={-bed.minY}
                  y2={-bed.maxY}
                  stroke={x % major === 0 ? "#94a3b8" : "#dbe2ea"}
                  strokeWidth={lw}
                />
              ))}
              {gridLines("y", 10).map((y) => (
                <line
                  key={`y${y}`}
                  y1={-(y - status.wco.y)}
                  y2={-(y - status.wco.y)}
                  x1={bed.minX}
                  x2={bed.maxX}
                  stroke={y % major === 0 ? "#94a3b8" : "#dbe2ea"}
                  strokeWidth={lw}
                />
              ))}
              {gridLines("x", major).map((x) => (
                <text
                  key={`tx${x}`}
                  x={x - status.wco.x}
                  y={-bed.minY + font * 1.6}
                  textAnchor="middle"
                  fill={isLight ? "#334155" : "#cbd5e1"}
                  fontSize={font}
                >
                  {n(x)}
                </text>
              ))}
              {gridLines("y", major).map((y) => (
                <text
                  key={`ty${y}`}
                  x={bed.minX - font}
                  y={-(y - status.wco.y) + font / 3}
                  textAnchor="end"
                  fill={isLight ? "#334155" : "#cbd5e1"}
                  fontSize={font}
                >
                  {n(y)}
                </text>
              ))}
              {rapids && (
                <path
                  d={rapidPath}
                  fill="none"
                  stroke="#ea580c"
                  strokeWidth={lw}
                  strokeDasharray={`${lw * 4} ${lw * 3}`}
                />
              )}
              {burnPaths.map(
                (group, i) =>
                  group.path && (
                    <path
                      key={i}
                      d={group.path}
                      fill="none"
                      stroke="#d97706"
                      strokeOpacity={group.opacity}
                      strokeWidth={spotDiameter}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ),
              )}
              {b && (
                <rect
                  x={b.minX}
                  y={-b.maxY}
                  width={b.width || lw}
                  height={b.height || lw}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth={lw}
                  strokeDasharray={`${lw * 5} ${lw * 3}`}
                />
              )}
              <path
                d={`M0 ${-font * 2}V${font * 2}M${-font * 2} 0H${font * 2}`}
                stroke="#0284c7"
                strokeWidth={lw * 2}
              />
              <text x={font} y={-font} fill="#0284c7" fontSize={font}>
                0 pièce
              </text>
              {status.connected && (
                <circle
                  cx={status.wpos.x}
                  cy={-status.wpos.y}
                  r={Math.max(spotDiameter / 2, lw * 3)}
                  fill="#10b981"
                  stroke="#064e3b"
                  strokeWidth={lw}
                />
              )}
            </svg>
          </div>
          <label className="text-xs text-slate-300 flex gap-2 items-center mt-2.5 cursor-pointer">
            <input
              type="checkbox"
              className="accent-sky-400"
              checked={rapids}
              onChange={(e) => setRapids(e.target.checked)}
            />
            Déplacements laser éteint
          </label>
        </>
      )}
      <p className="text-[11px] text-slate-300 mt-2.5 leading-relaxed">
        Graduations en coordonnées machine ; parcours en coordonnées pièce (
        {status.activeWCS}). Largeur maximale du spot : {n(spotDiameter)} mm.
        L’empreinte affichée reste une estimation.
      </p>
      {outside && (
        <p className="text-xs font-medium text-amber-300 mt-2">
          La zone gravée dépasse le plateau affiché. Vérifiez le placement et
          l’origine pièce.
        </p>
      )}
      {b && (
        <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
          <div className="rounded-xl border border-sky-500/40 bg-sky-500/15 p-2.5 text-sky-100">
            <b className="font-mono text-sky-200">
              {n(b.width)} × {n(b.height)} mm
            </b>
            <br />
            <span className="text-slate-300">Empreinte estimée</span>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#0f1520] p-2.5 text-slate-100">
            <b className="font-mono">
              X {n(b.minX)} → {n(b.maxX)}
            </b>
            <br />
            <span className="text-slate-300">Limites X</span>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#0f1520] p-2.5 text-slate-100">
            <b className="font-mono">
              Y {n(b.minY)} → {n(b.maxY)}
            </b>
            <br />
            <span className="text-slate-300">Limites Y</span>
          </div>
        </div>
      )}
    </section>
  );
}
