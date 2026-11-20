import React, { useState, useEffect, useRef } from 'react';
import {
  Sliders,
  Crosshair,
  Grid,
  Cpu,
  Activity,
  Play,
  RotateCcw,
  Sparkles,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  GrblStatus,
  ProbeConfig,
  HeightmapGrid,
  ParsedGCodeStats,
} from '../types/cnc';
import {
  clampFeedOverride,
  computeFeedOverrideBytes,
  FEED_OVERRIDE_MAX,
  FEED_OVERRIDE_MIN,
} from '../utils/grblOverrides';

export interface OverridesAndToolsTabsProps {
  status: GrblStatus;
  onSendCommand: (command: string) => void;
  onSendRealtime?: (byte: number | string) => void;
  gcodeStats?: ParsedGCodeStats | null;
  heightmap?: HeightmapGrid;
  onHeightmapChange?: (grid: HeightmapGrid) => void;
  onStartHeightmapScan?: (grid: HeightmapGrid) => void;
  onGenerateDemoHeightmap?: () => void;
  probeConfig?: ProbeConfig;
  onProbeConfigChange?: (config: ProbeConfig) => void;
  onStartProbe?: (config: ProbeConfig) => void;
}

const DEFAULT_PROBE_CONFIG: ProbeConfig = {
  mode: 'Z',
  directionX: 1,
  directionY: 1,
  plateThicknessZ: 19.0,
  plateThicknessXY: 10.0,
  toolDiameter: 3.175,
  maxSearchDistance: 25,
  fastFeedRate: 120,
  slowFeedRate: 30,
  retractDistance: 2.0,
  finalSafeZ: 10.0,
};

function createGridPoints(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  cols: number,
  rows: number
) {
  const pts: HeightmapGrid['points'] = [];
  const safeCols = Math.max(2, cols);
  const safeRows = Math.max(2, rows);
  for (let r = 0; r < safeRows; r++) {
    const y = minY + (r / (safeRows - 1)) * (maxY - minY);
    for (let c = 0; c < safeCols; c++) {
      const x = minX + (c / (safeCols - 1)) * (maxX - minX);
      pts.push({
        row: r,
        col: c,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        z: null,
        probed: false,
      });
    }
  }
  return pts;
}

const DEFAULT_HEIGHTMAP: HeightmapGrid = {
  minX: 0,
  maxX: 100,
  minY: 0,
  maxY: 80,
  cols: 5,
  rows: 4,
  clearanceZ: 5,
  probeDepthZ: -5,
  feedRate: 80,
  points: createGridPoints(0, 100, 0, 80, 5, 4),
  isScanning: false,
  enabled: false,
};

export const OverridesAndToolsTabs: React.FC<OverridesAndToolsTabsProps> = ({
  status,
  onSendCommand,
  onSendRealtime,
  gcodeStats,
  heightmap: externalHeightmap,
  onHeightmapChange,
  onStartHeightmapScan,
  onGenerateDemoHeightmap,
  probeConfig: externalProbeConfig,
  onProbeConfigChange,
  onStartProbe,
}) => {
  const [activeTab, setActiveTab] = useState<'overrides' | 'probe' | 'heightmap'>('overrides');
  const [internalProbe, setInternalProbe] = useState<ProbeConfig>(DEFAULT_PROBE_CONFIG);
  const [internalHeightmap, setInternalHeightmap] = useState<HeightmapGrid>(DEFAULT_HEIGHTMAP);

  const probe: ProbeConfig = {
    ...DEFAULT_PROBE_CONFIG,
    ...(externalProbeConfig ?? internalProbe),
  };

  const updateProbe = (patch: Partial<ProbeConfig>) => {
    const next: ProbeConfig = { ...probe, ...patch };
    setInternalProbe(next);
    onProbeConfigChange?.(next);
  };

  const grid = externalHeightmap ?? internalHeightmap;
  const updateGrid = (patch: Partial<HeightmapGrid>) => {
    const next = { ...grid, ...patch };
    if (
      patch.minX !== undefined ||
      patch.maxX !== undefined ||
      patch.minY !== undefined ||
      patch.maxY !== undefined ||
      patch.cols !== undefined ||
      patch.rows !== undefined
    ) {
      next.points = createGridPoints(
        next.minX,
        next.maxX,
        next.minY,
        next.maxY,
        next.cols,
        next.rows
      );
    }
    setInternalHeightmap(next);
    onHeightmapChange?.(next);
  };

  const sendRealtimeByte = (byteCode: number) => {
    if (onSendRealtime) {
      onSendRealtime(byteCode);
    } else {
      onSendCommand(String.fromCharCode(byteCode));
    }
  };

  // État et synchronisation du curseur d'override d'avance (10 % – 200 %)
  const liveFeedOverride = clampFeedOverride(status.overrides.feed);
  const [dragFeedOverride, setDragFeedOverride] = useState<number | null>(null);
  const [pendingFeedTarget, setPendingFeedTarget] = useState<number | null>(null);
  const feedPointerDraggingRef = useRef<boolean>(false);
  const pendingFeedTargetRef = useRef<number | null>(null);
  const pendingFeedTimerRef = useRef<number | null>(null);

  const displayedFeedOverride = dragFeedOverride ?? pendingFeedTarget ?? liveFeedOverride;

  useEffect(() => {
    if (!status.connected) {
      setDragFeedOverride(null);
      pendingFeedTargetRef.current = null;
      setPendingFeedTarget(null);
      if (pendingFeedTimerRef.current !== null) {
        window.clearTimeout(pendingFeedTimerRef.current);
        pendingFeedTimerRef.current = null;
      }
      return;
    }

    if (pendingFeedTarget !== null && liveFeedOverride === pendingFeedTarget) {
      pendingFeedTargetRef.current = null;
      setPendingFeedTarget(null);
      if (pendingFeedTimerRef.current !== null) {
        window.clearTimeout(pendingFeedTimerRef.current);
        pendingFeedTimerRef.current = null;
      }
    }
  }, [status.connected, liveFeedOverride, pendingFeedTarget]);

  useEffect(() => {
    return () => {
      if (pendingFeedTimerRef.current !== null) {
        window.clearTimeout(pendingFeedTimerRef.current);
      }
    };
  }, []);

  const commitFeedOverride = (rawTarget: number) => {
    feedPointerDraggingRef.current = false;
    setDragFeedOverride(null);
    if (pendingFeedTimerRef.current !== null) {
      window.clearTimeout(pendingFeedTimerRef.current);
      pendingFeedTimerRef.current = null;
    }

    const target = clampFeedOverride(rawTarget);
    if (!status.connected) return;

    const baseFeed = pendingFeedTargetRef.current ?? liveFeedOverride;
    const bytes = computeFeedOverrideBytes(baseFeed, target);
    if (bytes.length === 0) {
      if (target === liveFeedOverride) {
        pendingFeedTargetRef.current = null;
        setPendingFeedTarget(null);
      }
      return;
    }

    pendingFeedTargetRef.current = target;
    setPendingFeedTarget(target);
    bytes.forEach((byteCode) => sendRealtimeByte(byteCode));
    pendingFeedTimerRef.current = window.setTimeout(() => {
      pendingFeedTargetRef.current = null;
      setPendingFeedTarget(null);
      pendingFeedTimerRef.current = null;
    }, 450);
  };

  // Exécution d'un cycle de palpage G38.2 (Z, X, Y, XY ou XYZ)
  const triggerProbeWithMode = (targetMode: ProbeConfig['mode']) => {
    const dirX: 1 | -1 = probe.directionX === -1 ? -1 : 1;
    const dirY: 1 | -1 = probe.directionY === -1 ? -1 : 1;
    const cfg: ProbeConfig = {
      ...probe,
      mode: targetMode,
      directionX: dirX,
      directionY: dirY,
    };
    updateProbe({ mode: targetMode, directionX: dirX, directionY: dirY });

    if (onStartProbe) {
      onStartProbe(cfg);
      return;
    }

    const radius = cfg.toolDiameter / 2;
    const signX = dirX > 0 ? '' : '-';
    const invSignX = dirX > 0 ? '-' : '';
    const signY = dirY > 0 ? '' : '-';
    const invSignY = dirY > 0 ? '-' : '';

    // Décalage d'origine X/Y après contact (épaisseur cale XY + rayon fraise)
    const offsetX = -dirX * (cfg.plateThicknessXY + radius);
    const offsetY = -dirY * (cfg.plateThicknessXY + radius);

    const buildZCmds = () => [
      `G38.2 Z-${cfg.maxSearchDistance.toFixed(2)} F${cfg.fastFeedRate}`,
      `G0 Z${cfg.retractDistance.toFixed(2)}`,
      `G38.2 Z-${(cfg.retractDistance + 2).toFixed(2)} F${cfg.slowFeedRate}`,
      `G10 L20 P1 Z${cfg.plateThicknessZ.toFixed(3)}`,
      `G0 Z${cfg.finalSafeZ.toFixed(2)}`,
    ];

    const buildXCmds = () => [
      `G38.2 X${signX}${cfg.maxSearchDistance.toFixed(2)} F${cfg.fastFeedRate}`,
      `G0 X${invSignX}${cfg.retractDistance.toFixed(2)}`,
      `G38.2 X${signX}${(cfg.retractDistance + 2).toFixed(2)} F${cfg.slowFeedRate}`,
      `G10 L20 P1 X${offsetX.toFixed(3)}`,
      `G0 X${invSignX}${cfg.retractDistance.toFixed(2)}`,
    ];

    const buildYCmds = () => [
      `G38.2 Y${signY}${cfg.maxSearchDistance.toFixed(2)} F${cfg.fastFeedRate}`,
      `G0 Y${invSignY}${cfg.retractDistance.toFixed(2)}`,
      `G38.2 Y${signY}${(cfg.retractDistance + 2).toFixed(2)} F${cfg.slowFeedRate}`,
      `G10 L20 P1 Y${offsetY.toFixed(3)}`,
      `G0 Y${invSignY}${cfg.retractDistance.toFixed(2)}`,
    ];

    const cmds: string[] = ['G21 G91'];

    if (targetMode === 'Z') {
      cmds.push(...buildZCmds());
    } else if (targetMode === 'X') {
      cmds.push(...buildXCmds());
    } else if (targetMode === 'Y') {
      cmds.push(...buildYCmds());
    } else if (targetMode === 'XY') {
      cmds.push(...buildXCmds(), ...buildYCmds());
    } else if (targetMode === 'XYZ') {
      cmds.push(...buildZCmds(), ...buildXCmds(), ...buildYCmds());
    }

    cmds.push('G90');
    cmds.forEach((c) => onSendCommand(c));
  };

  // Utiliser les dimensions du G-Code chargé
  const applyGCodeBounds = () => {
    if (!gcodeStats) return;
    const minX = Math.floor(gcodeStats.bounds.min.x);
    const maxX = Math.ceil(gcodeStats.bounds.max.x);
    const minY = Math.floor(gcodeStats.bounds.min.y);
    const maxY = Math.ceil(gcodeStats.bounds.max.y);
    updateGrid({
      minX,
      maxX: maxX > minX ? maxX : minX + 50,
      minY,
      maxY: maxY > minY ? maxY : minY + 50,
    });
  };

  // Générer un plateau de test réaliste (Démo)
  const handleGenerateDemo = () => {
    if (onGenerateDemoHeightmap) {
      onGenerateDemoHeightmap();
    }
    const basePts = createGridPoints(
      grid.minX,
      grid.maxX,
      grid.minY,
      grid.maxY,
      grid.cols,
      grid.rows
    );
    const demoPts = basePts.map((pt) => {
      const nx = (pt.x - grid.minX) / Math.max(1, grid.maxX - grid.minX);
      const ny = (pt.y - grid.minY) / Math.max(1, grid.maxY - grid.minY);
      const zVal = Number(
        (0.22 * (nx - 0.5) + 0.16 * Math.sin(nx * Math.PI) * Math.cos(ny * Math.PI)).toFixed(3)
      );
      return {
        ...pt,
        z: zVal,
        probed: true,
      };
    });
    const next: HeightmapGrid = {
      ...grid,
      points: demoPts,
      isScanning: false,
      enabled: true,
    };
    setInternalHeightmap(next);
    onHeightmapChange?.(next);
  };

  // Lancer le scan du plateau
  const handleScanHeightmap = () => {
    if (onStartHeightmapScan) {
      onStartHeightmapScan(grid);
      return;
    }
    onSendCommand(`G90 G0 Z${grid.clearanceZ.toFixed(2)}`);
    grid.points.forEach((pt) => {
      onSendCommand(`G90 G0 X${pt.x.toFixed(2)} Y${pt.y.toFixed(2)}`);
      onSendCommand(`G38.2 Z${grid.probeDepthZ.toFixed(2)} F${grid.feedRate}`);
      onSendCommand(`G90 G0 Z${grid.clearanceZ.toFixed(2)}`);
    });
    handleGenerateDemo();
  };

  // Couleur thermique pour une cote Z mesurée (sur fond clair)
  const getZCellColor = (z: number | null) => {
    if (z === null) return 'bg-[#090d14] border-slate-800 text-slate-400';
    if (z > 0.1) return 'bg-red-950/60 border-red-500/50 text-red-200';
    if (z > 0.03) return 'bg-amber-950/60 border-amber-500/50 text-amber-200';
    if (z < -0.1) return 'bg-indigo-950/60 border-indigo-500/50 text-indigo-200';
    if (z < -0.03) return 'bg-sky-950/60 border-sky-500/50 text-sky-200';
    return 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200';
  };

  const canProbe =
    status.connected && (status.state === 'Idle' || status.state === 'Check' || status.state === 'Jog');

  const dirX = probe.directionX === -1 ? -1 : 1;
  const dirY = probe.directionY === -1 ? -1 : 1;
  const totalOffsetXY = (probe.plateThicknessXY + probe.toolDiameter / 2).toFixed(3);
  const hasAlertPin = status.pins.xLimit || status.pins.yLimit || status.pins.zLimit;

  return (
    <div className="bg-[#141b27] border border-slate-800 text-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.28)] rounded-xl p-3.5 flex flex-col gap-3 select-none">
      {/* Barre d'onglets segmentée épurée */}
      <div className="grid grid-cols-3 gap-1 bg-[#090d14] p-1 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('overrides')}
          aria-pressed={activeTab === 'overrides'}
          className={`flex items-center justify-center gap-1.5 min-h-9 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'overrides'
              ? 'bg-[#1b2436] text-slate-50 border border-slate-700 shadow-xs'
              : 'text-slate-300 hover:text-white border border-transparent'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 shrink-0 text-sky-400" />
          <span className="truncate">Overrides</span>
          {hasAlertPin && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('probe')}
          aria-pressed={activeTab === 'probe'}
          className={`flex items-center justify-center gap-1.5 min-h-9 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'probe'
              ? 'bg-[#1b2436] text-slate-50 border border-slate-700 shadow-xs'
              : 'text-slate-300 hover:text-white border border-transparent'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span className="truncate">Palpage</span>
          {status.pins.probe && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('heightmap')}
          aria-pressed={activeTab === 'heightmap'}
          className={`flex items-center justify-center gap-1.5 min-h-9 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'heightmap'
              ? 'bg-[#1b2436] text-slate-50 border border-slate-700 shadow-xs'
              : 'text-slate-300 hover:text-white border border-transparent'
          }`}
        >
          <Grid className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span className="truncate">Nivellement</span>
          {grid.enabled && (
            <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500 text-slate-950 rounded font-mono font-bold shrink-0">
              ON
            </span>
          )}
        </button>
      </div>

      {/* ONGLET 1 : OVERRIDES TEMPS RÉEL & DIAGNOSTIC PINS */}
      {activeTab === 'overrides' && (
        <div className="flex flex-col gap-2.5">
          {/* Vitesse d'avance (Feed Override 10% - 200%) en slider continu */}
          <div className="bg-[#0f1520] p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                Avance (Feed)
              </span>
              <div className="font-mono text-xs flex items-center gap-1.5">
                <span className="text-slate-300 tabular-nums">{status.feedRate} mm/min</span>
                <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/40 text-sky-300 font-bold tabular-nums">
                  {displayedFeedOverride}%
                </span>
                <button
                  type="button"
                  disabled={!status.connected}
                  onClick={() => commitFeedOverride(100)}
                  title="Octet GRBL 0x90 (Reset 100%)"
                  className={`min-h-7 px-2 py-0.5 rounded-md border font-mono text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 ${
                    displayedFeedOverride === 100
                      ? 'bg-sky-400 border-sky-300 text-slate-950'
                      : 'bg-[#1b2436] hover:bg-[#243047] border-slate-700/80 text-slate-100'
                  }`}
                >
                  100%
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">10%</span>
              <input
                type="range"
                aria-label="Override vitesse d'avance"
                min={FEED_OVERRIDE_MIN}
                max={FEED_OVERRIDE_MAX}
                step={1}
                disabled={!status.connected}
                value={displayedFeedOverride}
                onPointerDown={() => {
                  feedPointerDraggingRef.current = true;
                }}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (feedPointerDraggingRef.current) {
                    setDragFeedOverride(next);
                  } else {
                    commitFeedOverride(next);
                  }
                }}
                onPointerUp={(e) => {
                  commitFeedOverride(Number(e.currentTarget.value));
                }}
                onPointerCancel={() => {
                  feedPointerDraggingRef.current = false;
                  setDragFeedOverride(null);
                }}
                onBlur={() => {
                  if (dragFeedOverride !== null) {
                    commitFeedOverride(dragFeedOverride);
                  }
                }}
                className="min-w-0 flex-1 h-2 bg-[#090d14] rounded-lg appearance-none cursor-pointer accent-sky-400 disabled:opacity-40"
              />
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">200%</span>
            </div>
          </div>

          {/* État des Capteurs / Pins du CNC Shield V3.0 */}
          <div className="bg-[#0f1520] p-3 rounded-xl border border-slate-800 flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              Capteurs Shield V3.0 (Fins de course & Sonde)
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { label: 'Lim X', active: status.pins.xLimit, dotColor: 'bg-white', alertColor: 'bg-red-600 border-red-400 text-white' },
                { label: 'Lim Y', active: status.pins.yLimit, dotColor: 'bg-white', alertColor: 'bg-red-600 border-red-400 text-white' },
                { label: 'Lim Z', active: status.pins.zLimit, dotColor: 'bg-white', alertColor: 'bg-red-600 border-red-400 text-white' },
                { label: 'Probe', active: status.pins.probe, dotColor: 'bg-slate-950', alertColor: 'bg-emerald-500 border-emerald-300 text-slate-950' },
              ].map((pin) => (
                <div
                  key={pin.label}
                  className={`flex flex-col items-center justify-center py-2 px-1.5 rounded-lg border font-mono text-[11px] font-bold ${
                    pin.active
                      ? pin.alertColor
                      : 'bg-[#090d14] border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        pin.active ? `${pin.dotColor} animate-ping` : 'bg-slate-600'
                      }`}
                    />
                    <span>{pin.label}</span>
                  </div>
                  <span className="text-[11px] uppercase mt-0.5 font-bold">
                    {pin.active ? 'ACTIF' : 'OK'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 2 : PALPAGE Z & PALPAGE XY COMPLET (TOUCH PLATE) */}
      {activeTab === 'probe' && (
        <div className="flex flex-col gap-2.5">
          {/* Indicateur de contact sonde en direct */}
          <div
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-bold ${
              status.pins.probe
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-100'
                : 'bg-[#0f1520] border-slate-800 text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {status.pins.probe ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-slate-400" />
              )}
              <span>Sonde (Pin A5 / SCL) :</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md font-mono text-[11px] ${
                status.pins.probe
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-[#090d14] border border-slate-700 text-slate-300'
              }`}
            >
              {status.pins.probe ? 'CONTACT DÉTECTÉ' : 'CIRCUIT OUVERT'}
            </span>
          </div>

          {/* Sens de palpage X et Y */}
          <div className="bg-[#0f1520] p-3 rounded-xl border border-slate-800 flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Sens de Palpage des Bords X & Y
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-mono text-slate-300">Axe X :</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionX: 1 })}
                    className={`flex items-center justify-center gap-1 min-h-9 py-1.5 px-2 rounded-lg border text-xs font-bold cursor-pointer transition ${
                      dirX === 1
                        ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                        : 'bg-[#1b2436] border-slate-700/80 text-slate-200 hover:bg-[#243047]'
                    }`}
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>X+ (Gauche)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionX: -1 })}
                    className={`flex items-center justify-center gap-1 min-h-9 py-1.5 px-2 rounded-lg border text-xs font-bold cursor-pointer transition ${
                      dirX === -1
                        ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                        : 'bg-[#1b2436] border-slate-700/80 text-slate-200 hover:bg-[#243047]'
                    }`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>X- (Droit)</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-mono text-slate-300">Axe Y :</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionY: 1 })}
                    className={`flex items-center justify-center gap-1 min-h-9 py-1.5 px-2 rounded-lg border text-xs font-bold cursor-pointer transition ${
                      dirY === 1
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-[#1b2436] border-slate-700/80 text-slate-200 hover:bg-[#243047]'
                    }`}
                  >
                    <ArrowUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Y+ (Avant)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionY: -1 })}
                    className={`flex items-center justify-center gap-1 min-h-9 py-1.5 px-2 rounded-lg border text-xs font-bold cursor-pointer transition ${
                      dirY === -1
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-[#1b2436] border-slate-700/80 text-slate-200 hover:bg-[#243047]'
                    }`}
                  >
                    <ArrowDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Y- (Arrière)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Paramètres : Cale Z, Cale XY, Diamètre fraise, Course & Vitesses */}
          <div className="bg-[#0f1520] p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Dimensions Cale & Fraise
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => updateProbe({ plateThicknessZ: 19.0, plateThicknessXY: 10.0 })}
                  className="min-h-8 px-2.5 py-1 rounded-lg bg-[#1b2436] hover:bg-[#243047] border border-slate-700/80 text-[11px] font-mono text-slate-100 cursor-pointer"
                >
                  Bloc XYZ (19/10)
                </button>
                <button
                  type="button"
                  onClick={() => updateProbe({ plateThicknessZ: 1.6, plateThicknessXY: 0 })}
                  className="min-h-8 px-2.5 py-1 rounded-lg bg-[#1b2436] hover:bg-[#243047] border border-slate-700/80 text-[11px] font-mono text-slate-100 cursor-pointer"
                >
                  PCB 1.6mm
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                  Cale Z (mm)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={probe.plateThicknessZ}
                  onChange={(e) => updateProbe({ plateThicknessZ: parseFloat(e.target.value) || 0 })}
                  className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-100 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                  Cale XY (mm)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={probe.plateThicknessXY}
                  onChange={(e) =>
                    updateProbe({ plateThicknessXY: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                  Ø Fraise (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={probe.toolDiameter}
                  onChange={(e) =>
                    updateProbe({ toolDiameter: parseFloat(e.target.value) || 3.175 })
                  }
                  className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                  Course Max
                </label>
                <input
                  type="number"
                  step="1"
                  value={probe.maxSearchDistance}
                  onChange={(e) =>
                    updateProbe({ maxSearchDistance: parseFloat(e.target.value) || 25 })
                  }
                  className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                  Vit. Rapide
                </label>
                <input
                  type="number"
                  value={probe.fastFeedRate}
                  onChange={(e) =>
                    updateProbe({ fastFeedRate: parseFloat(e.target.value) || 100 })
                  }
                  className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-300 mb-1">
                  Vit. Fine
                </label>
                <input
                  type="number"
                  value={probe.slowFeedRate}
                  onChange={(e) =>
                    updateProbe({ slowFeedRate: parseFloat(e.target.value) || 25 })
                  }
                  className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold text-slate-100 focus:outline-none"
                />
              </div>
            </div>

            <div className="text-xs font-mono text-slate-200 bg-[#090d14] px-3 py-2 rounded-lg border border-slate-800 flex items-center justify-between">
              <span>Compensation XY (Cale + Ø/2) :</span>
              <strong className="text-emerald-400">{totalOffsetXY} mm</strong>
            </div>
          </div>

          {/* Boutons d'exécution directs */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('Z')}
                title="Palper uniquement le dessus de la pièce en Z-"
                className="flex items-center justify-center gap-1.5 min-h-10 py-2 px-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Palper Z</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('X')}
                title={`Palper uniquement le bord X (${dirX === 1 ? 'vers X+' : 'vers X-'})`}
                className="flex items-center justify-center gap-1.5 min-h-10 py-2 px-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>X ({dirX === 1 ? 'X+' : 'X-'})</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('Y')}
                title={`Palper uniquement le bord Y (${dirY === 1 ? 'vers Y+' : 'vers Y-'})`}
                className="flex items-center justify-center gap-1.5 min-h-10 py-2 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Y ({dirY === 1 ? 'Y+' : 'Y-'})</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('XY')}
                title="Palper automatiquement le coin X puis Y avec compensation rayon fraise + cale XY"
                className="flex items-center justify-center gap-1.5 min-h-10 py-2 px-3 rounded-xl bg-[#1b2436] hover:bg-[#243047] border border-slate-700/80 text-slate-100 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Crosshair className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Coin XY</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('XYZ')}
                title="Palpage complet automatique : Z puis X puis Y"
                className="flex items-center justify-center gap-1.5 min-h-10 py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Palper XYZ Complet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 3 : BED LEVELING / HEIGHTMAP (AUTO-NIVELLEMENT) */}
      {activeTab === 'heightmap' && (
        <div className="flex flex-col gap-2.5">
          {/* Switch Activer la compensation Z */}
          <div className="flex items-center justify-between gap-3 bg-[#0f1520] px-3 py-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-100">
                  Compensation Z sur le G-Code
                </div>
                <div className="text-[11px] text-slate-300 truncate">
                  Interpolation bilinéaire en temps réel
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={grid.enabled}
              aria-label="Activer la compensation Z sur le G-Code"
              onClick={() => updateGrid({ enabled: !grid.enabled })}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                grid.enabled
                  ? 'bg-emerald-500 border-emerald-400'
                  : 'bg-[#1b2436] border-slate-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  grid.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Paramétrage de la grille (2 colonnes lisibles) */}
          <div className="bg-[#0f1520] p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Zone & Maillage
              </span>
              <button
                type="button"
                disabled={!gcodeStats}
                onClick={applyGCodeBounds}
                className="flex items-center gap-1 min-h-8 px-2.5 py-1 rounded-lg bg-[#1b2436] hover:bg-[#243047] border border-slate-700/80 text-slate-100 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Dimensions G-Code</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-300 font-mono mb-1">X Min / Max</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    aria-label="X Minimum"
                    value={grid.minX}
                    onChange={(e) => updateGrid({ minX: Number(e.target.value) })}
                    className="w-1/2 min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs text-slate-100"
                  />
                  <input
                    type="number"
                    aria-label="X Maximum"
                    value={grid.maxX}
                    onChange={(e) => updateGrid({ maxX: Number(e.target.value) })}
                    className="w-1/2 min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 font-mono mb-1">Y Min / Max</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    aria-label="Y Minimum"
                    value={grid.minY}
                    onChange={(e) => updateGrid({ minY: Number(e.target.value) })}
                    className="w-1/2 min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs text-slate-100"
                  />
                  <input
                    type="number"
                    aria-label="Y Maximum"
                    value={grid.maxY}
                    onChange={(e) => updateGrid({ maxY: Number(e.target.value) })}
                    className="w-1/2 min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 font-mono mb-1">Cols × Lignes</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    aria-label="Nombre de colonnes"
                    min={2}
                    max={10}
                    value={grid.cols}
                    onChange={(e) =>
                      updateGrid({ cols: Math.max(2, Math.min(10, Number(e.target.value) || 3)) })
                    }
                    className="w-1/2 min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs text-slate-100 font-bold"
                  />
                  <input
                    type="number"
                    aria-label="Nombre de lignes"
                    min={2}
                    max={10}
                    value={grid.rows}
                    onChange={(e) =>
                      updateGrid({ rows: Math.max(2, Math.min(10, Number(e.target.value) || 3)) })
                    }
                    className="w-1/2 min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs text-slate-100 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 font-mono mb-1">Z Séc. / Prof.</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    aria-label="Z de sécurité"
                    value={grid.clearanceZ}
                    onChange={(e) => updateGrid({ clearanceZ: Number(e.target.value) })}
                    className="w-1/2 min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs text-slate-100"
                  />
                  <input
                    type="number"
                    aria-label="Profondeur de palpage Z"
                    value={grid.probeDepthZ}
                    onChange={(e) => updateGrid({ probeDepthZ: Number(e.target.value) })}
                    className="w-1/2 min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2 py-1 font-mono text-xs text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={!status.connected}
                onClick={handleScanHeightmap}
                className="flex items-center justify-center gap-1.5 min-h-10 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Scanner</span>
              </button>

              <button
                type="button"
                onClick={handleGenerateDemo}
                className="flex items-center justify-center gap-1.5 min-h-10 py-2 px-3 rounded-xl bg-[#1b2436] hover:bg-[#243047] border border-slate-700/80 text-slate-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Démo</span>
              </button>
            </div>
          </div>

          {/* Carte topographique Z */}
          <div className="bg-[#0f1520] p-3 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Carte Z ({grid.cols}×{grid.rows} = {grid.points.length} pts)
              </span>
              <button
                type="button"
                onClick={() =>
                  updateGrid({
                    points: createGridPoints(
                      grid.minX,
                      grid.maxX,
                      grid.minY,
                      grid.maxY,
                      grid.cols,
                      grid.rows
                    ),
                    enabled: false,
                  })
                }
                className="flex items-center gap-1 min-h-8 px-2 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-[#1b2436] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réinitialiser</span>
              </button>
            </div>

            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
            >
              {grid.points.map((pt, idx) => (
                <div
                  key={idx}
                  title={`Point (${pt.col}, ${pt.row}) | X=${pt.x} Y=${pt.y} | Z=${
                    pt.z !== null ? `${pt.z.toFixed(3)} mm` : 'Non mesuré'
                  }`}
                  className={`p-1.5 rounded-lg border text-center font-mono ${getZCellColor(pt.z)}`}
                >
                  <div className="text-[11px] font-bold tabular-nums">
                    {pt.z !== null ? (pt.z >= 0 ? `+${pt.z.toFixed(3)}` : pt.z.toFixed(3)) : '---'}
                  </div>
                  <div className="text-[10px] opacity-85 truncate">
                    X{Math.round(pt.x)} Y{Math.round(pt.y)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverridesAndToolsTabs;
