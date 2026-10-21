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

  return (
    <div className="bg-white border border-slate-300 text-slate-800 shadow-sm rounded-xl p-3.5 flex flex-col gap-3 select-none">
      {/* Barre d'onglets sobre */}
      <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('overrides')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'overrides'
              ? 'bg-white text-slate-900 border border-slate-300 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 shrink-0 text-blue-600" />
          <span className="truncate">Overrides & Pins</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('probe')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'probe'
              ? 'bg-white text-slate-900 border border-slate-300 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">Palpage XYZ</span>
          {status.pins.probe && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('heightmap')}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'heightmap'
              ? 'bg-white text-slate-900 border border-slate-300 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Grid className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span className="truncate">Auto-nivellement</span>
          {grid.enabled && (
            <span className="px-1 py-0.2 text-[9px] bg-emerald-600 text-white rounded font-mono">
              ON
            </span>
          )}
        </button>
      </div>

      {/* ONGLET 1 : OVERRIDES TEMPS RÉEL & DIAGNOSTIC PINS */}
      {activeTab === 'overrides' && (
        <div className="flex flex-col gap-3">
          {/* Vitesse d'avance (Feed Override 10% - 200%) */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                Vitesse d'avance (Feed)
              </span>
              <div className="font-mono text-xs">
                <span className="text-slate-600 mr-2">{status.feedRate} mm/min</span>
                <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-bold">
                  {status.overrides.feed}%
                </span>
              </div>
            </div>

            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
              <div
                className="h-full bg-blue-600 transition-all duration-150"
                style={{ width: `${Math.min(100, (status.overrides.feed / 200) * 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x92)}
                title="Octet GRBL 0x92 (-10%)"
                className="py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-40"
              >
                -10%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x94)}
                title="Octet GRBL 0x94 (-1%)"
                className="py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-40"
              >
                -1%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x90)}
                title="Octet GRBL 0x90 (Reset 100%)"
                className="py-1.5 rounded bg-blue-50 hover:bg-blue-600 border border-blue-300 hover:border-blue-600 font-mono text-xs font-bold text-blue-700 hover:text-white cursor-pointer disabled:opacity-40"
              >
                100%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x93)}
                title="Octet GRBL 0x93 (+1%)"
                className="py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-40"
              >
                +1%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x91)}
                title="Octet GRBL 0x91 (+10%)"
                className="py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-40"
              >
                +10%
              </button>
            </div>
          </div>

          {/* Déplacements Rapides (Rapid Override 25% / 50% / 100%) */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                Rapides (G0)
              </div>
              <div className="text-[11px] font-mono text-slate-600 mt-0.5">
                Actuel : <strong className="text-amber-700">{status.overrides.rapid}%</strong>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
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
                  className={`px-3 py-1.5 rounded font-mono text-xs font-bold border transition-colors cursor-pointer disabled:opacity-40 ${
                    status.overrides.rapid === val
                      ? 'bg-amber-500 border-amber-600 text-white'
                      : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>

          {/* Vitesse Broche (Spindle Override 10% - 200%) */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Vitesse Broche (Spindle)</span>
              <div className="font-mono text-xs">
                <span className="text-slate-600 mr-2">{status.spindleSpeed} RPM</span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">
                  {status.overrides.spindle}%
                </span>
              </div>
            </div>

            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
              <div
                className="h-full bg-emerald-600 transition-all duration-150"
                style={{ width: `${Math.min(100, (status.overrides.spindle / 200) * 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x9b)}
                title="Octet GRBL 0x9B (-10%)"
                className="py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-40"
              >
                -10%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x9d)}
                title="Octet GRBL 0x9D (-1%)"
                className="py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-40"
              >
                -1%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x99)}
                title="Octet GRBL 0x99 (Reset 100%)"
                className="py-1.5 rounded bg-emerald-50 hover:bg-emerald-600 border border-emerald-300 hover:border-emerald-600 font-mono text-xs font-bold text-emerald-700 hover:text-white cursor-pointer disabled:opacity-40"
              >
                100%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x9c)}
                title="Octet GRBL 0x9C (+1%)"
                className="py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-40"
              >
                +1%
              </button>
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => sendRealtimeByte(0x9a)}
                title="Octet GRBL 0x9A (+10%)"
                className="py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-mono text-xs font-bold text-slate-800 cursor-pointer disabled:opacity-40"
              >
                +10%
              </button>
            </div>
          </div>

          {/* État des Capteurs / Pins du CNC Shield V3.0 */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 flex flex-col gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-600" />
              Capteurs CNC Shield V3.0 (Fins de course & Sonde)
            </span>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                { label: 'Lim X', active: status.pins.xLimit, alertColor: 'bg-red-600 border-red-700 text-white' },
                { label: 'Lim Y', active: status.pins.yLimit, alertColor: 'bg-red-600 border-red-700 text-white' },
                { label: 'Lim Z', active: status.pins.zLimit, alertColor: 'bg-red-600 border-red-700 text-white' },
                {
                  label: 'Probe',
                  active: status.pins.probe,
                  alertColor: 'bg-emerald-600 border-emerald-700 text-white',
                },
                { label: 'Hold', active: status.pins.hold, alertColor: 'bg-amber-600 border-amber-700 text-white' },
                { label: 'Door', active: status.pins.door, alertColor: 'bg-orange-600 border-orange-700 text-white' },
              ].map((pin) => (
                <div
                  key={pin.label}
                  className={`flex flex-col items-center justify-center py-1.5 px-2 rounded border font-mono text-xs font-bold ${
                    pin.active
                      ? pin.alertColor
                      : 'bg-white border-slate-200 text-slate-500'
                  }`}
                >
                  <span>{pin.label}</span>
                  <span className="text-[9px] uppercase mt-0.5">
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
        <div className="flex flex-col gap-3">
          {/* Indicateur de contact sonde en direct */}
          <div
            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold ${
              status.pins.probe
                ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {status.pins.probe ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-slate-500" />
              )}
              <span>Sonde de Palpage (Pin A5 / SCL) :</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                status.pins.probe
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {status.pins.probe ? 'CONTACT DÉTECTÉ' : 'CIRCUIT OUVERT'}
            </span>
          </div>

          {/* Sens de palpage X et Y (pour palpage X, Y, Coin XY et XYZ) */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-800 flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Sens de Palpage des Bords X & Y
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Direction X */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-600">Direction Axe X :</span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionX: 1 })}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded border text-[11px] font-bold cursor-pointer ${
                      dirX === 1
                        ? 'bg-red-50 border-red-400 text-red-800'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>Vers X+ (Bord Gauche)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionX: -1 })}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded border text-[11px] font-bold cursor-pointer ${
                      dirX === -1
                        ? 'bg-red-50 border-red-400 text-red-800'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>Vers X- (Bord Droit)</span>
                  </button>
                </div>
              </div>

              {/* Direction Y */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-slate-600">Direction Axe Y :</span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionY: 1 })}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded border text-[11px] font-bold cursor-pointer ${
                      dirY === 1
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <ArrowUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Vers Y+ (Bord Avant)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProbe({ directionY: -1 })}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded border text-[11px] font-bold cursor-pointer ${
                      dirY === -1
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <ArrowDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Vers Y- (Bord Arrière)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Paramètres : Cale Z, Cale XY, Diamètre fraise, Course & Vitesses */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Dimensions Cale & Fraise
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateProbe({ plateThicknessZ: 19.0, plateThicknessXY: 10.0 })}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[10px] font-mono text-slate-800 cursor-pointer"
                >
                  Bloc XYZ (Z=19 / XY=10)
                </button>
                <button
                  type="button"
                  onClick={() => updateProbe({ plateThicknessZ: 1.6, plateThicknessXY: 0 })}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[10px] font-mono text-slate-800 cursor-pointer"
                >
                  PCB 1.6mm
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Cale Z (mm)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={probe.plateThicknessZ}
                  onChange={(e) => updateProbe({ plateThicknessZ: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Cale XY (mm)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={probe.plateThicknessXY}
                  onChange={(e) =>
                    updateProbe({ plateThicknessXY: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Ø Fraise (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={probe.toolDiameter}
                  onChange={(e) =>
                    updateProbe({ toolDiameter: parseFloat(e.target.value) || 3.175 })
                  }
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Course Max (mm)
                </label>
                <input
                  type="number"
                  step="1"
                  value={probe.maxSearchDistance}
                  onChange={(e) =>
                    updateProbe({ maxSearchDistance: parseFloat(e.target.value) || 25 })
                  }
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Vitesse Rapide
                </label>
                <input
                  type="number"
                  value={probe.fastFeedRate}
                  onChange={(e) =>
                    updateProbe({ fastFeedRate: parseFloat(e.target.value) || 100 })
                  }
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Vitesse Fine
                </label>
                <input
                  type="number"
                  value={probe.slowFeedRate}
                  onChange={(e) =>
                    updateProbe({ slowFeedRate: parseFloat(e.target.value) || 25 })
                  }
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1.5 rounded border border-slate-200 flex items-center justify-between">
              <span>Compensation XY (Cale XY + Rayon Ø/2) :</span>
              <strong className="text-emerald-700">{totalOffsetXY} mm</strong>
            </div>
          </div>

          {/* Boutons d'exécution directs : Palper Z, Palper X, Palper Y, Palper XY, Palper XYZ */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Lancer un cycle de palpage (G38.2)
            </div>

            {/* Ligne 1 : Palper Z / Palper X / Palper Y */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('Z')}
                title="Palper uniquement le dessus de la pièce en Z-"
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Palper Z</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('X')}
                title={`Palper uniquement le bord X (${dirX === 1 ? 'vers X+' : 'vers X-'})`}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg bg-red-600 hover:bg-red-700 border border-red-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Palper X ({dirX === 1 ? 'X+' : 'X-'})</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('Y')}
                title={`Palper uniquement le bord Y (${dirY === 1 ? 'vers Y+' : 'vers Y-'})`}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Palper Y ({dirY === 1 ? 'Y+' : 'Y-'})</span>
              </button>
            </div>

            {/* Ligne 2 : Palper Coin XY / Palper Complet XYZ */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('XY')}
                title="Palper automatiquement le coin X puis Y avec compensation rayon fraise + cale XY"
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Crosshair className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Palper XY (Coin X+Y)</span>
              </button>

              <button
                type="button"
                disabled={!canProbe}
                onClick={() => triggerProbeWithMode('XYZ')}
                title="Palpage complet automatique : Z puis X puis Y"
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 border border-amber-600 text-white font-extrabold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
        <div className="flex flex-col gap-3">
          {/* Interrupteur Activer la compensation Z sur le G-Code */}
          <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-600" />
              <div>
                <div className="text-xs font-bold text-slate-900">
                  Activer la compensation Z sur le G-Code
                </div>
                <div className="text-[10px] text-slate-500">
                  Interpolation bilinéaire automatique lors de l'usinage
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => updateGrid({ enabled: !grid.enabled })}
              className={`px-3 py-1 rounded font-mono text-xs font-bold border transition-colors cursor-pointer ${
                grid.enabled
                  ? 'bg-emerald-600 border-emerald-700 text-white'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {grid.enabled ? 'ACTIF (ON)' : 'INACTIF'}
            </button>
          </div>

          {/* Paramétrage de la grille X/Y, Colonnes/Lignes, Z sécurité */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Zone & Maillage de Palpage
              </span>
              <button
                type="button"
                disabled={!gcodeStats}
                onClick={applyGCodeBounds}
                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Dimensions du G-Code chargé</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] text-slate-600 font-mono">X Min / Max</label>
                <div className="flex gap-1 mt-0.5">
                  <input
                    type="number"
                    value={grid.minX}
                    onChange={(e) => updateGrid({ minX: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-300 rounded px-1.5 py-1 font-mono text-xs text-slate-900"
                  />
                  <input
                    type="number"
                    value={grid.maxX}
                    onChange={(e) => updateGrid({ maxX: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-300 rounded px-1.5 py-1 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-600 font-mono">Y Min / Max</label>
                <div className="flex gap-1 mt-0.5">
                  <input
                    type="number"
                    value={grid.minY}
                    onChange={(e) => updateGrid({ minY: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-300 rounded px-1.5 py-1 font-mono text-xs text-slate-900"
                  />
                  <input
                    type="number"
                    value={grid.maxY}
                    onChange={(e) => updateGrid({ maxY: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-300 rounded px-1.5 py-1 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-600 font-mono">Cols × Lignes</label>
                <div className="flex gap-1 mt-0.5">
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={grid.cols}
                    onChange={(e) =>
                      updateGrid({ cols: Math.max(2, Math.min(10, Number(e.target.value) || 3)) })
                    }
                    className="w-1/2 bg-white border border-slate-300 rounded px-1.5 py-1 font-mono text-xs text-slate-900 font-bold"
                  />
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={grid.rows}
                    onChange={(e) =>
                      updateGrid({ rows: Math.max(2, Math.min(10, Number(e.target.value) || 3)) })
                    }
                    className="w-1/2 bg-white border border-slate-300 rounded px-1.5 py-1 font-mono text-xs text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-600 font-mono">Z Séc. / Prof.</label>
                <div className="flex gap-1 mt-0.5">
                  <input
                    type="number"
                    value={grid.clearanceZ}
                    onChange={(e) => updateGrid({ clearanceZ: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-300 rounded px-1.5 py-1 font-mono text-xs text-slate-900"
                  />
                  <input
                    type="number"
                    value={grid.probeDepthZ}
                    onChange={(e) => updateGrid({ probeDepthZ: Number(e.target.value) })}
                    className="w-1/2 bg-white border border-slate-300 rounded px-1.5 py-1 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={!status.connected}
                onClick={handleScanHeightmap}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Scanner le plateau</span>
              </button>

              <button
                type="button"
                onClick={handleGenerateDemo}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Plateau de test (Démo)</span>
              </button>
            </div>
          </div>

          {/* Tableau visuel coloré des cotes Z mesurées (mm) */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Carte Topographique Z ({grid.cols}×{grid.rows} = {grid.points.length} points)
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
                className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-900 cursor-pointer"
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
                  className={`p-1.5 rounded border text-center font-mono ${getZCellColor(pt.z)}`}
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
