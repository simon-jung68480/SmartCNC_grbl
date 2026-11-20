import React, { useState } from 'react';
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
  Zap,
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
    if (z === null) return 'bg-white border-slate-200 text-slate-500';
    if (z > 0.1) return 'bg-red-50 border-red-300 text-red-800';
    if (z > 0.03) return 'bg-amber-50 border-amber-300 text-amber-800';
    if (z < -0.1) return 'bg-indigo-50 border-indigo-300 text-indigo-800';
    if (z < -0.03) return 'bg-sky-50 border-sky-300 text-sky-800';
    return 'bg-emerald-50 border-emerald-300 text-emerald-800';
  };

  const canProbe =
    status.connected && (status.state === 'Idle' || status.state === 'Check' || status.state === 'Jog');

  const dirX = probe.directionX === -1 ? -1 : 1;
  const dirY = probe.directionY === -1 ? -1 : 1;
  const totalOffsetXY = (probe.plateThicknessXY + probe.toolDiameter / 2).toFixed(3);
  const hasAlertPin =
    status.pins.xLimit || status.pins.yLimit || status.pins.zLimit || status.pins.door || status.pins.hold;

  return (
    <div className="bg-white border border-slate-200/90 text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl p-3 flex flex-col gap-2.5 select-none">
      {/* Barre d'onglets segmentée épurée */}
      <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('overrides')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'overrides'
              ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 border border-transparent'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 shrink-0 text-sky-600" />
          <span className="truncate">Overrides</span>
          {hasAlertPin && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('probe')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'probe'
              ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 border border-transparent'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">Palpage</span>
          {status.pins.probe && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('heightmap')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'heightmap'
              ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 border border-transparent'
          }`}
        >
          <Grid className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span className="truncate">Nivellement</span>
          {grid.enabled && (
            <span className="px-1 py-0.2 text-[9px] bg-emerald-600 text-white rounded font-mono shrink-0">
              ON
            </span>
          )}
        </button>
      </div>

      {/* ONGLET 1 : OVERRIDES TEMPS RÉEL & DIAGNOSTIC PINS */}
      {activeTab === 'overrides' && (
        <div className="flex flex-col gap-2.5">
          {/* Vitesse d'avance (Feed Override 10% - 200%) */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-600" />
                Avance (Feed)
              </span>
              <div className="font-mono text-xs flex items-center gap-1.5">
                <span className="text-slate-500 tabular-nums">{status.feedRate} mm/min</span>
                <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-700 font-bold tabular-nums">
                  {status.overrides.feed}%
                </span>
              </div>
            </div>

            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-600 transition-all duration-150"
                style={{ width: `${Math.min(100, (status.overrides.feed / 200) * 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-5 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x92)}
                title="Octet GRBL 0x92 (-10%)"
                className="py-1.5 hover:bg-slate-100 font-mono text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-40"
              >
                -10%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x94)}
                title="Octet GRBL 0x94 (-1%)"
                className="py-1.5 hover:bg-slate-100 font-mono text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-40"
              >
                -1%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x90)}
                title="Octet GRBL 0x90 (Reset 100%)"
                className="py-1.5 bg-sky-50 hover:bg-sky-600 font-mono text-xs font-bold text-sky-700 hover:text-white cursor-pointer disabled:opacity-40 transition-colors"
              >
                100%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x93)}
                title="Octet GRBL 0x93 (+1%)"
                className="py-1.5 hover:bg-slate-100 font-mono text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-40"
              >
                +1%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x91)}
                title="Octet GRBL 0x91 (+10%)"
                className="py-1.5 hover:bg-slate-100 font-mono text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-40"
              >
                +10%
              </button>
            </div>
          </div>

          {/* Déplacements Rapides (Rapid Override 25% / 50% / 100%) */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-xs font-bold text-slate-900">Rapides (G0)</span>
              <span className="font-mono text-xs font-bold text-amber-700 tabular-nums">
                {status.overrides.rapid}%
              </span>
            </div>

            <div className="inline-flex divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white overflow-hidden">
              {[
                { val: 25, byte: 0x97 },
                { val: 50, byte: 0x96 },
                { val: 100, byte: 0x95 },
              ].map(({ val, byte }) => (
                <button
                  key={val}
                  type="button"
                  disabled={!status.connected}
                  onClick={() => sendRealtimeByte(byte)}
                  title={`Octet GRBL 0x${byte.toString(16).toUpperCase()} (${val}%)`}
                  className={`px-3 py-1 font-mono text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 ${
                    status.overrides.rapid === val
                      ? 'bg-amber-500 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>

          {/* Vitesse Broche (Spindle Override 10% - 200%) */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900">Broche (Spindle)</span>
              <div className="font-mono text-xs flex items-center gap-1.5">
                <span className="text-slate-500 tabular-nums">{status.spindleSpeed} RPM</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold tabular-nums">
                  {status.overrides.spindle}%
                </span>
              </div>
            </div>

            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-150"
                style={{ width: `${Math.min(100, (status.overrides.spindle / 200) * 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-5 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x9b)}
                title="Octet GRBL 0x9B (-10%)"
                className="py-1.5 hover:bg-slate-100 font-mono text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-40"
              >
                -10%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x9d)}
                title="Octet GRBL 0x9D (-1%)"
                className="py-1.5 hover:bg-slate-100 font-mono text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-40"
              >
                -1%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x99)}
                title="Octet GRBL 0x99 (Reset 100%)"
                className="py-1.5 bg-emerald-50 hover:bg-emerald-600 font-mono text-xs font-bold text-emerald-700 hover:text-white cursor-pointer disabled:opacity-40 transition-colors"
              >
                100%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x9c)}
                title="Octet GRBL 0x9C (+1%)"
                className="py-1.5 hover:bg-slate-100 font-mono text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-40"
              >
                +1%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x9a)}
                title="Octet GRBL 0x9A (+10%)"
                className="py-1.5 hover:bg-slate-100 font-mono text-xs font-bold text-slate-700 cursor-pointer disabled:opacity-40"
              >
                +10%
              </button>
            </div>
          </div>

          {/* État des Capteurs / Pins du CNC Shield V3.0 */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              Capteurs Shield V3.0 (Fins de course & Sonde)
            </span>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                { label: 'Lim X', active: status.pins.xLimit, dotColor: 'bg-red-500', alertColor: 'bg-red-600 border-red-700 text-white' },
                { label: 'Lim Y', active: status.pins.yLimit, dotColor: 'bg-red-500', alertColor: 'bg-red-600 border-red-700 text-white' },
                { label: 'Lim Z', active: status.pins.zLimit, dotColor: 'bg-red-500', alertColor: 'bg-red-600 border-red-700 text-white' },
                { label: 'Probe', active: status.pins.probe, dotColor: 'bg-emerald-500', alertColor: 'bg-emerald-600 border-emerald-700 text-white' },
                { label: 'Hold', active: status.pins.hold, dotColor: 'bg-amber-500', alertColor: 'bg-amber-600 border-amber-700 text-white' },
                { label: 'Door', active: status.pins.door, dotColor: 'bg-orange-500', alertColor: 'bg-orange-600 border-orange-700 text-white' },
              ].map((pin) => (
                <div
                  key={pin.label}
                  className={`flex flex-col items-center justify-center py-1.5 px-1.5 rounded-lg border font-mono text-[11px] font-bold ${
                    pin.active
                      ? pin.alertColor
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        pin.active ? 'bg-white animate-ping' : 'bg-slate-300'
                      }`}
                    />
                    <span>{pin.label}</span>
                  </div>
                  <span className="text-[9px] uppercase opacity-80 mt-0.5">
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
            className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold ${
              status.pins.probe
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {status.pins.probe ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-slate-400" />
              )}
              <span>Sonde (Pin A5 / SCL) :</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md font-mono text-[11px] ${
                status.pins.probe
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {status.pins.probe ? 'CONTACT DÉTECTÉ' : 'CIRCUIT OUVERT'}
            </span>
          </div>

          {/* Sens de palpage X et Y */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 flex flex-col gap-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Sens de Palpage des Bords X & Y
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-500">Axe X :</span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionX: 1 })}
                    className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      dirX === 1
                        ? 'bg-red-50 border-red-300 text-red-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ArrowRight className="w-3 h-3 text-red-600 shrink-0" />
                    <span>X+ (Gauche)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionX: -1 })}
                    className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      dirX === -1
                        ? 'bg-red-50 border-red-300 text-red-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ArrowLeft className="w-3 h-3 text-red-600 shrink-0" />
                    <span>X- (Droit)</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-500">Axe Y :</span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionY: 1 })}
                    className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      dirY === 1
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ArrowUp className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Y+ (Avant)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionY: -1 })}
                    className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      dirY === -1
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ArrowDown className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Y- (Arrière)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Paramètres : Cale Z, Cale XY, Diamètre fraise, Course & Vitesses */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Dimensions Cale & Fraise
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateProbe({ plateThicknessZ: 19.0, plateThicknessXY: 10.0 })}
                  className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700 cursor-pointer"
                >
                  Bloc XYZ (19/10)
                </button>
                <button
                  type="button"
                  onClick={() => updateProbe({ plateThicknessZ: 1.6, plateThicknessXY: 0 })}
                  className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700 cursor-pointer"
                >
                  PCB 1.6mm
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Cale Z (mm)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={probe.plateThicknessZ}
                  onChange={(e) => updateProbe({ plateThicknessZ: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Cale XY (mm)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={probe.plateThicknessXY}
                  onChange={(e) =>
                    updateProbe({ plateThicknessXY: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Ø Fraise (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={probe.toolDiameter}
                  onChange={(e) =>
                    updateProbe({ toolDiameter: parseFloat(e.target.value) || 3.175 })
                  }
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Course Max
                </label>
                <input
                  type="number"
                  step="1"
                  value={probe.maxSearchDistance}
                  onChange={(e) =>
                    updateProbe({ maxSearchDistance: parseFloat(e.target.value) || 25 })
                  }
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Vit. Rapide
                </label>
                <input
                  type="number"
                  value={probe.fastFeedRate}
                  onChange={(e) =>
                    updateProbe({ fastFeedRate: parseFloat(e.target.value) || 100 })
                  }
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Vit. Fine
                </label>
                <input
                  type="number"
                  value={probe.slowFeedRate}
                  onChange={(e) =>
                    updateProbe({ slowFeedRate: parseFloat(e.target.value) || 25 })
                  }
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between">
              <span>Compensation XY (Cale + Ø/2) :</span>
              <strong className="text-emerald-700">{totalOffsetXY} mm</strong>
            </div>
          </div>

          {/* Boutons d'exécution directs */}
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('Z')}
                title="Palper uniquement le dessus de la pièce en Z-"
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3 h-3 fill-current shrink-0" />
                <span>Palper Z</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('X')}
                title={`Palper uniquement le bord X (${dirX === 1 ? 'vers X+' : 'vers X-'})`}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3 h-3 fill-current shrink-0" />
                <span>X ({dirX === 1 ? 'X+' : 'X-'})</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('Y')}
                title={`Palper uniquement le bord Y (${dirY === 1 ? 'vers Y+' : 'vers Y-'})`}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3 h-3 fill-current shrink-0" />
                <span>Y ({dirY === 1 ? 'Y+' : 'Y-'})</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('XY')}
                title="Palper automatiquement le coin X puis Y avec compensation rayon fraise + cale XY"
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Crosshair className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Coin XY</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('XYZ')}
                title="Palpage complet automatique : Z puis X puis Y"
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
          <div className="flex items-center justify-between gap-3 bg-slate-50/80 px-3 py-2.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900">
                  Compensation Z sur le G-Code
                </div>
                <div className="text-[10px] text-slate-500 truncate">
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
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                grid.enabled
                  ? 'bg-emerald-600 border-emerald-700'
                  : 'bg-slate-200 border-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                  grid.enabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Paramétrage de la grille (2 colonnes lisibles) */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Zone & Maillage
              </span>
              <button
                type="button"
                disabled={!gcodeStats}
                onClick={applyGCodeBounds}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Maximize2 className="w-3 h-3 text-sky-600" />
                <span>Dimensions G-Code</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 font-mono mb-0.5">X Min / Max</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    aria-label="X Minimum"
                    value={grid.minX}
                    onChange={(e) => updateGrid({ minX: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs text-slate-900"
                  />
                  <input
                    type="number"
                    aria-label="X Maximum"
                    value={grid.maxX}
                    onChange={(e) => updateGrid({ maxX: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-mono mb-0.5">Y Min / Max</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    aria-label="Y Minimum"
                    value={grid.minY}
                    onChange={(e) => updateGrid({ minY: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs text-slate-900"
                  />
                  <input
                    type="number"
                    aria-label="Y Maximum"
                    value={grid.maxY}
                    onChange={(e) => updateGrid({ maxY: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-mono mb-0.5">Cols × Lignes</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    aria-label="Nombre de colonnes"
                    min={2}
                    max={10}
                    value={grid.cols}
                    onChange={(e) =>
                      updateGrid({ cols: Math.max(2, Math.min(10, Number(e.target.value) || 3)) })
                    }
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs text-slate-900 font-bold"
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
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 font-mono mb-0.5">Z Séc. / Prof.</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    aria-label="Z de sécurité"
                    value={grid.clearanceZ}
                    onChange={(e) => updateGrid({ clearanceZ: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs text-slate-900"
                  />
                  <input
                    type="number"
                    aria-label="Profondeur de palpage Z"
                    value={grid.probeDepthZ}
                    onChange={(e) => updateGrid({ probeDepthZ: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                disabled={!status.connected}
                onClick={handleScanHeightmap}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Scanner</span>
              </button>

              <button
                type="button"
                onClick={handleGenerateDemo}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Démo</span>
              </button>
            </div>
          </div>

          {/* Carte topographique Z */}
          <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
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
                className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Réinitialiser</span>
              </button>
            </div>

            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
            >
              {grid.points.map((pt, idx) => (
                <div
                  key={idx}
                  title={`Point (${pt.col}, ${pt.row}) | X=${pt.x} Y=${pt.y} | Z=${
                    pt.z !== null ? `${pt.z.toFixed(3)} mm` : 'Non mesuré'
                  }`}
                  className={`p-1 rounded-lg border text-center font-mono ${getZCellColor(pt.z)}`}
                >
                  <div className="text-[11px] font-bold tabular-nums">
                    {pt.z !== null ? (pt.z >= 0 ? `+${pt.z.toFixed(3)}` : pt.z.toFixed(3)) : '---'}
                  </div>
                  <div className="text-[8px] opacity-75 truncate">
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
