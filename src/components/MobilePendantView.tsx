import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  AlertOctagon,
  Pause,
  Play,
  Unlock,
  Target,
  LocateFixed,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  OctagonX,
  RotateCcw,
  Navigation,
  ArrowUpToLine,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Radio,
  Home,
  Monitor,
  Gauge,
  Sliders,
  Settings,
  X,
  Check,
  Smartphone,
} from 'lucide-react';
import { GrblStatus, MachineState, ProbeConfig } from '../types/cnc';

export interface MobilePendantViewProps {
  status: GrblStatus;
  onSendCommand: (command: string) => void;
  onSendRealtime?: (byte: number | string) => void;
  onSoftReset?: () => void;
  onZeroWorkAxis?: (axis: 'X' | 'Y' | 'Z' | 'XY' | 'ALL') => void;
  onSetMachineZero?: () => void;
  onJog?: (axes: { x?: number; y?: number; z?: number }, feedRate: number) => void;
  onCancelJog?: () => void;
  onPauseJob?: () => void;
  onResumeJob?: () => void;
  probeConfig?: ProbeConfig;
  onProbeConfigChange?: (config: ProbeConfig) => void;
  onStartProbe?: (config: ProbeConfig) => void;
  onExitPendant: () => void;
  useHoming?: boolean;
}

const STEP_PRESETS: number[] = [0.1, 1, 10, 50, 100];
const QUICK_PROBE_PLATES: { label: string; thickness: number }[] = [
  { label: 'Cale 19.0 mm', thickness: 19.0 },
  { label: 'Cale 15.0 mm', thickness: 15.0 },
  { label: 'PCB 1.6 mm', thickness: 1.6 },
  { label: 'Feuille 0.1 mm', thickness: 0.1 },
];

const GRBL_ALARMS_FR: Record<number, { title: string; desc: string }> = {
  1: {
    title: 'Fin de course matérielle (Hard Limit)',
    desc: 'Capteur de fin de course percuté. Mouvement stoppé immédiatement.',
  },
  2: {
    title: 'Fin de course logicielle (Soft Limit)',
    desc: 'La cible dépasse les limites maximales de la machine ($130-$132).',
  },
  3: {
    title: 'Reset pendant un déplacement',
    desc: 'Arrêt d’urgence ou reset pendant un mouvement. Perte possible de pas.',
  },
  4: {
    title: 'Contact initial de sonde (Probe Fail)',
    desc: 'La sonde Z-Probe est déjà en contact avant le départ du palpage G38.2.',
  },
  5: {
    title: 'Échec de palpage (Probe Fail)',
    desc: 'La sonde n’a pas détecté de contact sur la course maximale autorisée.',
  },
  6: {
    title: 'Reset pendant le Homing',
    desc: 'Le cycle de prise d’origine ($H) a été interrompu par un reset.',
  },
  7: {
    title: 'Porte ouverte pendant Homing',
    desc: 'La porte de sécurité a été ouverte durant le cycle de prise d’origine.',
  },
  8: {
    title: 'Dégagement Homing échoué (Pull-off)',
    desc: 'Impossible de libérer le contacteur de fin de course après détection.',
  },
  9: {
    title: 'Contacteur Homing introuvable',
    desc: 'Aucun capteur trouvé sur la distance de recherche configurée.',
  },
};

function getStateBadge(state: MachineState, connected: boolean) {
  if (!connected || state === 'Disconnected') {
    return {
      label: 'DÉCONNECTÉ',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-300',
      dotClass: 'bg-slate-400',
      icon: WifiOff,
    };
  }
  if (state === 'Idle') {
    return {
      label: 'PRÊT (IDLE)',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      dotClass: 'bg-emerald-500 animate-pulse',
      icon: CheckCircle2,
    };
  }
  if (state === 'Run') {
    return {
      label: 'EN USINAGE',
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-300',
      dotClass: 'bg-sky-500 animate-pulse',
      icon: Play,
    };
  }
  if (state === 'Jog') {
    return {
      label: 'JOGGING',
      badgeClass: 'bg-blue-50 text-blue-800 border-blue-300',
      dotClass: 'bg-blue-500 animate-pulse',
      icon: Navigation,
    };
  }
  if (state.startsWith('Hold')) {
    return {
      label: `PAUSE (${state})`,
      badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
      dotClass: 'bg-amber-500 animate-ping',
      icon: Pause,
    };
  }
  if (state === 'Alarm') {
    return {
      label: 'ALARME GRBL',
      badgeClass: 'bg-red-50 text-red-900 border-red-400 animate-pulse',
      dotClass: 'bg-red-600 animate-ping',
      icon: AlertTriangle,
    };
  }
  return {
    label: state.toUpperCase(),
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    dotClass: 'bg-amber-500',
    icon: AlertTriangle,
  };
}

export const MobilePendantView: React.FC<MobilePendantViewProps> = ({
  status,
  onSendCommand,
  onSendRealtime,
  onSoftReset,
  onZeroWorkAxis,
  onSetMachineZero,
  onJog,
  onCancelJog,
  onPauseJob,
  onResumeJob,
  probeConfig,
  onProbeConfigChange,
  onStartProbe,
  onExitPendant,
  useHoming = false,
}) => {
  // Mode de pas ou continu
  const [jogMode, setJogMode] = useState<'step' | 'continuous'>('step');
  const [selectedStep, setSelectedStep] = useState<number>(1); // 1 mm par défaut
  const [xyFeedRate, setXyFeedRate] = useState<number>(2500); // mm/min
  const [zFeedRate, setZFeedRate] = useState<number>(600); // mm/min

  // Cale Z de palpage rapide
  const [plateThickness, setPlateThickness] = useState<number>(
    probeConfig?.plateThicknessZ || 19.0
  );
  const [isEditingThickness, setIsEditingThickness] = useState<boolean>(false);
  const [customThicknessInput, setCustomThicknessInput] = useState<string>(
    String(probeConfig?.plateThicknessZ || 19.0)
  );

  // Mémorisation de l'état continu actif
  const continuousActiveRef = useRef<boolean>(false);
  const pointerDownCountRef = useRef<number>(0);

  // Vibreur haptique pour sensation de bouton physique sous le pouce
  const triggerHaptic = useCallback((ms: number = 30) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignorer si non supporté
      }
    }
  }, []);

  const isMotionAllowed =
    status.connected &&
    (status.state === 'Idle' || status.state === 'Jog' || status.state === 'Check');
  const isPaused = status.state.startsWith('Hold');
  const isRunning = status.state === 'Run';
  const isAlarm = status.state === 'Alarm';

  // Soft Reset
  const handleEmergencyStop = useCallback(() => {
    triggerHaptic(80);
    if (onSoftReset) {
      onSoftReset();
    } else if (onSendRealtime) {
      onSendRealtime(0x18);
    } else {
      onSendCommand('\x18');
    }
  }, [triggerHaptic, onSoftReset, onSendRealtime, onSendCommand]);

  // Feed Hold (Pause !)
  const handlePause = useCallback(() => {
    triggerHaptic(40);
    if (onPauseJob) {
      onPauseJob();
    } else if (onSendRealtime) {
      onSendRealtime('!');
    } else {
      onSendCommand('!');
    }
  }, [triggerHaptic, onPauseJob, onSendRealtime, onSendCommand]);

  // Cycle Start (Reprendre ~)
  const handleResume = useCallback(() => {
    triggerHaptic(40);
    if (onResumeJob) {
      onResumeJob();
    } else if (onSendRealtime) {
      onSendRealtime('~');
    } else {
      onSendCommand('~');
    }
  }, [triggerHaptic, onResumeJob, onSendRealtime, onSendCommand]);

  // Déverrouiller $X
  const handleUnlock = useCallback(() => {
    triggerHaptic(40);
    onSendCommand('$X');
  }, [triggerHaptic, onSendCommand]);

  // Jog Cancel
  const handleStopJog = useCallback(() => {
    triggerHaptic(50);
    continuousActiveRef.current = false;
    if (onCancelJog) {
      onCancelJog();
    } else if (onSendRealtime) {
      onSendRealtime(0x85);
    } else {
      onSendCommand('\x85');
    }
  }, [triggerHaptic, onCancelJog, onSendRealtime, onSendCommand]);

  // Exécution du mouvement de Jog
  const executeJogMove = useCallback(
    (dx: number, dy: number, dz: number) => {
      if (!isMotionAllowed) return;
      const isZOnly = dx === 0 && dy === 0 && dz !== 0;
      const feed = isZOnly ? zFeedRate : xyFeedRate;

      if (onJog) {
        const axes: { x?: number; y?: number; z?: number } = {};
        if (dx !== 0) axes.x = dx;
        if (dy !== 0) axes.y = dy;
        if (dz !== 0) axes.z = dz;
        onJog(axes, feed);
        return;
      }

      const unitCode = status.unit === 'in' ? 'G20' : 'G21';
      const parts: string[] = [];
      if (dx !== 0) parts.push(`X${dx.toFixed(3)}`);
      if (dy !== 0) parts.push(`Y${dy.toFixed(3)}`);
      if (dz !== 0) parts.push(`Z${dz.toFixed(3)}`);
      if (parts.length === 0) return;

      onSendCommand(`$J=${unitCode}G91 ${parts.join(' ')} F${Math.round(feed)}`);
    },
    [isMotionAllowed, zFeedRate, xyFeedRate, onJog, status.unit, onSendCommand]
  );

  // Gestionnaire d'appui sur une touche directionnelle
  const handleJogPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    dx: number,
    dy: number,
    dz: number
  ) => {
    e.preventDefault();
    if (!isMotionAllowed) return;

    triggerHaptic(25);
    pointerDownCountRef.current += 1;

    if (jogMode === 'step') {
      executeJogMove(dx * selectedStep, dy * selectedStep, dz * selectedStep);
    } else {
      continuousActiveRef.current = true;
      // En mode continu, ordonner une grande distance de déplacement qui sera stoppée au relâchement
      const distance = dz !== 0 ? 100 : 300;
      executeJogMove(dx * distance, dy * distance, dz * distance);
    }
  };

  // Gestionnaire de relâchement (pour stopper le jog continu)
  const handleJogPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (jogMode === 'continuous' && continuousActiveRef.current) {
      handleStopJog();
    }
  };

  // Gestion de la perte de focus ou sortie d'écran du pointeur
  const handleJogPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (jogMode === 'continuous' && continuousActiveRef.current) {
      handleStopJog();
    }
  };

  // Mise à zéro d'un axe de travail
  const handleZeroWork = (axis: 'X' | 'Y' | 'Z' | 'XY' | 'ALL') => {
    triggerHaptic(40);
    if (onZeroWorkAxis) {
      onZeroWorkAxis(axis);
    } else {
      const gcode =
        axis === 'ALL'
          ? 'G10 L20 P1 X0 Y0 Z0'
          : axis === 'XY'
          ? 'G10 L20 P1 X0 Y0'
          : `G10 L20 P1 ${axis}0`;
      onSendCommand(gcode);
    }
  };

  // Mettre Machine à 0;0;0 (Sans capteurs homing)
  const handleMachineZeroHere = () => {
    triggerHaptic(60);
    if (onSetMachineZero) {
      onSetMachineZero();
    } else {
      onSendCommand('G92 X0 Y0 Z0');
    }
  };

  // Lancement du cycle de Palpage Z Rapide
  const handleLaunchZProbe = () => {
    triggerHaptic(50);
    const cfg: ProbeConfig = {
      mode: 'Z',
      directionX: 1,
      directionY: 1,
      plateThicknessZ: plateThickness,
      plateThicknessXY: probeConfig?.plateThicknessXY || 10.0,
      toolDiameter: probeConfig?.toolDiameter || 3.175,
      maxSearchDistance: probeConfig?.maxSearchDistance || 25,
      fastFeedRate: probeConfig?.fastFeedRate || 120,
      slowFeedRate: probeConfig?.slowFeedRate || 30,
      retractDistance: probeConfig?.retractDistance || 2.0,
      finalSafeZ: probeConfig?.finalSafeZ || 10.0,
    };

    if (onStartProbe) {
      onStartProbe(cfg);
    } else {
      // Séquence G-Code autonome de secours si le backend gère en direct
      const cmds = [
        'G21 G91',
        `G38.2 Z-${cfg.maxSearchDistance.toFixed(2)} F${cfg.fastFeedRate}`,
        `G0 Z${cfg.retractDistance.toFixed(2)}`,
        `G38.2 Z-${(cfg.retractDistance + 2).toFixed(2)} F${cfg.slowFeedRate}`,
        `G10 L20 P1 Z${cfg.plateThicknessZ.toFixed(3)}`,
        `G0 Z${cfg.finalSafeZ.toFixed(2)}`,
        'G90',
      ].join('\n');
      onSendCommand(cmds);
    }
  };

  const handleApplyThickness = (val: number) => {
    setPlateThickness(val);
    setCustomThicknessInput(String(val));
    setIsEditingThickness(false);
    if (onProbeConfigChange && probeConfig) {
      onProbeConfigChange({ ...probeConfig, plateThicknessZ: val });
    }
  };

  const badge = getStateBadge(status.state, status.connected);
  const BadgeIcon = badge.icon;
  const alarmDetail = isAlarm ? GRBL_ALARMS_FR[status.alarmCode || 0] : null;

  const formatCoord = (val?: number) => {
    if (val === undefined || isNaN(val)) return '0.000';
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(3);
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 text-slate-900 select-none touch-manipulation flex flex-col font-sans pb-28">
      {/* =====================================================================
          EN-TÊTE PENDANT : ÉTAT MACHINE, DÉVERROUILLER $X & BASCULE BUREAU
      ===================================================================== */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-300 px-3 py-2.5 shadow-xs flex items-center justify-between gap-2">
        {/* Titre & Badge d'état */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shrink-0 shadow-xs">
            <Smartphone className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-slate-900 tracking-tight">SmartCNC</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 border border-sky-300">
                Pendant
              </span>
            </div>
            {/* État GRBL */}
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-mono font-bold ${badge.badgeClass}`}
            >
              <span className={`w-2 h-2 rounded-full ${badge.dotClass}`} />
              <BadgeIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">{badge.label}</span>
            </div>
          </div>
        </div>

        {/* Boutons d'action : Déverrouiller $X + Mode Bureau */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUnlock}
            title="Déverrouiller GRBL ($X)"
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition-colors shadow-xs cursor-pointer active:scale-95 ${
              isAlarm
                ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 ring-2 ring-amber-400 animate-pulse'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300'
            }`}
          >
            <Unlock className="w-4 h-4 text-amber-500 shrink-0" />
            <span>$X</span>
          </button>

          <button
            type="button"
            onClick={onExitPendant}
            title="Basculer vers l'interface complète Desktop"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white border border-slate-900 shadow-xs cursor-pointer active:scale-95"
          >
            <Monitor className="w-4 h-4 text-sky-300 shrink-0" />
            <span className="hidden xs:inline">Bureau</span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          BANNIÈRE D'ALARME GRBL (SI ACTIVE)
      ===================================================================== */}
      {isAlarm && (
        <div className="bg-red-50 border-b border-red-300 p-3 flex items-start justify-between gap-3 text-red-950 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wide text-red-900">
                {alarmDetail?.title || `Alarme GRBL #${status.alarmCode || '?'}`}
              </div>
              <div className="text-xs text-red-800 mt-0.5 leading-snug">
                {alarmDetail?.desc || status.alarmMessage || 'Machine verrouillée pour sécurité.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUnlock}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shrink-0 shadow-xs cursor-pointer active:scale-95"
          >
            Déverrouiller ($X)
          </button>
        </div>
      )}

      {/* =====================================================================
          CONTENU PRINCIPAL DU PENDANT
      ===================================================================== */}
      <main className="flex-1 flex flex-col p-3 gap-3 max-w-xl mx-auto w-full">
        {/* ===================================================================
            SECTION 1 : DRO TACTILE GÉANT (LISIBLE À 1 MÈTRE)
        =================================================================== */}
        <section className="bg-white border border-slate-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-slate-700" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Coordonnées Pièce (DRO)
              </h2>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              <span className="font-bold">{status.activeWCS}</span>
              <span>•</span>
              <span>{status.unit.toUpperCase()}</span>
            </div>
          </div>

          {/* AXES X, Y, Z EN GRANDS CHIFFRES */}
          <div className="flex flex-col gap-2">
            {/* AXE X */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 flex items-center justify-center font-black text-lg shrink-0">
                  X
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none truncate">
                    {formatCoord(status.wpos.x)}
                  </span>
                  <span className="text-[11px] font-mono text-slate-600 mt-1">
                    MPos: {formatCoord(status.mpos.x)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={!isMotionAllowed}
                onClick={() => handleZeroWork('X')}
                title="Mettre X = 0 à la position actuelle"
                className="min-w-[76px] h-12 rounded-xl bg-white hover:bg-rose-50 border-2 border-rose-400 text-rose-800 text-sm font-extrabold shadow-xs transition-transform active:scale-90 cursor-pointer disabled:opacity-40 flex items-center justify-center"
              >
                X = 0
              </button>
            </div>

            {/* AXE Y */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center font-black text-lg shrink-0">
                  Y
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none truncate">
                    {formatCoord(status.wpos.y)}
                  </span>
                  <span className="text-[11px] font-mono text-slate-600 mt-1">
                    MPos: {formatCoord(status.mpos.y)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={!isMotionAllowed}
                onClick={() => handleZeroWork('Y')}
                title="Mettre Y = 0 à la position actuelle"
                className="min-w-[76px] h-12 rounded-xl bg-white hover:bg-emerald-50 border-2 border-emerald-500 text-emerald-800 text-sm font-extrabold shadow-xs transition-transform active:scale-90 cursor-pointer disabled:opacity-40 flex items-center justify-center"
              >
                Y = 0
              </button>
            </div>

            {/* AXE Z */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-lg bg-sky-100 text-sky-800 border border-sky-300 flex items-center justify-center font-black text-lg shrink-0">
                  Z
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none truncate">
                    {formatCoord(status.wpos.z)}
                  </span>
                  <span className="text-[11px] font-mono text-slate-600 mt-1">
                    MPos: {formatCoord(status.mpos.z)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={!isMotionAllowed}
                onClick={() => handleZeroWork('Z')}
                title="Mettre Z = 0 à la position actuelle"
                className="min-w-[76px] h-12 rounded-xl bg-white hover:bg-sky-50 border-2 border-sky-500 text-sky-800 text-sm font-extrabold shadow-xs transition-transform active:scale-90 cursor-pointer disabled:opacity-40 flex items-center justify-center"
              >
                Z = 0
              </button>
            </div>
          </div>

          {/* GROS BOUTONS D'ORIGINES RAPIDES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-200">
            {/* Prendre Origine Pièce (XYZ = 0) */}
            <button
              type="button"
              disabled={!isMotionAllowed}
              onClick={() => handleZeroWork('ALL')}
              className="flex items-center justify-center gap-2 h-13 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-sm shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-40"
            >
              <Target className="w-5 h-5 shrink-0" />
              <span>Prendre Origine Pièce (XYZ = 0)</span>
            </button>

            {useHoming ? (
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => {
                  triggerHaptic(60);
                  onSendCommand('$H');
                }}
                title="Lancer le cycle Homing automatique sur les capteurs de fin de course ($H)"
                className="flex items-center justify-center gap-2 h-13 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-extrabold text-sm shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-40"
              >
                <Home className="w-5 h-5 shrink-0" />
                <span>Cycle Homing ($H)</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!isMotionAllowed}
                onClick={handleMachineZeroHere}
                title="Définit la position actuelle comme 0 Machine sans capteurs"
                className="flex items-center justify-center gap-2 h-13 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border-2 border-amber-500 text-amber-900 font-bold text-sm shadow-xs transition-transform active:scale-95 cursor-pointer disabled:opacity-40"
              >
                <LocateFixed className="w-5 h-5 text-amber-700 shrink-0" />
                <span>Mettre Machine à 0;0;0</span>
              </button>
            )}
          </div>

          {/* Déplacements de sécurité vers origines */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!isMotionAllowed}
              onClick={() => {
                triggerHaptic(30);
                onSendCommand('G90 G0 X0 Y0');
              }}
              className="flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-800 active:scale-95 cursor-pointer disabled:opacity-40"
            >
              <Navigation className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Aller à X0 Y0</span>
            </button>

            <button
              type="button"
              disabled={!isMotionAllowed}
              onClick={() => {
                triggerHaptic(30);
                onSendCommand('G90 G0 Z10');
              }}
              className="flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-800 active:scale-95 cursor-pointer disabled:opacity-40"
            >
              <ArrowUpToLine className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Monter Z Sécurité (+10)</span>
            </button>
          </div>
        </section>

        {/* ===================================================================
            SECTION 2 : PAVÉ DE JOGGING HAUTE RÉACTIVITÉ
        =================================================================== */}
        <section className="bg-white border border-slate-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-700" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Pavé de Jogging Tactile
              </h2>
            </div>
            <div className="text-[11px] font-mono text-slate-600">
              Vitesse : <strong className="text-slate-800">{xyFeedRate}</strong> mm/min
            </div>
          </div>

          {/* SÉLECTEUR DE PAS TACTILE GÉANT */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Incrément de Pas :
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {STEP_PRESETS.map((val) => {
                const isSelected = jogMode === 'step' && selectedStep === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      triggerHaptic(20);
                      setJogMode('step');
                      setSelectedStep(val);
                    }}
                    className={`h-11 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                      isSelected
                        ? 'bg-sky-600 text-white border-2 border-sky-700 shadow-md scale-102'
                        : 'bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}

              {/* Mode Continu */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  setJogMode('continuous');
                }}
                className={`h-11 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                  jogMode === 'continuous'
                    ? 'bg-amber-600 text-white border-2 border-amber-700 shadow-md scale-102'
                    : 'bg-slate-100 text-amber-800 border border-slate-300 hover:bg-amber-50'
                }`}
                title="Maintenir la touche enfoncée pour avancer, relâcher pour stopper"
              >
                Cont.
              </button>
            </div>
          </div>

          {/* PAVÉ DIRECTIONNEL : XY (GRILLE 3X3) + COLONNE Z VERTICALE */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {/* COLONNE GAUCHE + CENTRE (3 COLONNES SUR 4) : PAVÉ XY 3x3 */}
            <div className="col-span-3 grid grid-cols-3 gap-2">
              {/* Ligne 1 : X- Y+ | Y+ | X+ Y+ */}
              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, -1, 1, 0)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="h-16 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 flex flex-col items-center justify-center text-slate-700 transition-transform active:scale-92 cursor-pointer disabled:opacity-40"
              >
                <ArrowUpLeft className="w-6 h-6 text-slate-600" />
                <span className="text-[10px] font-mono font-bold mt-0.5">X- Y+</span>
              </button>

              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, 0, 1, 0)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="h-16 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border-2 border-emerald-400 flex flex-col items-center justify-center text-emerald-900 transition-transform active:scale-92 cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <ArrowUp className="w-7 h-7 text-emerald-700 stroke-[2.5]" />
                <span className="text-xs font-mono font-black">Y+</span>
              </button>

              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, 1, 1, 0)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="h-16 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 flex flex-col items-center justify-center text-slate-700 transition-transform active:scale-92 cursor-pointer disabled:opacity-40"
              >
                <ArrowUpRight className="w-6 h-6 text-slate-600" />
                <span className="text-[10px] font-mono font-bold mt-0.5">X+ Y+</span>
              </button>

              {/* Ligne 2 : X- | STOP JOG | X+ */}
              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, -1, 0, 0)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="h-16 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border-2 border-rose-400 flex flex-col items-center justify-center text-rose-900 transition-transform active:scale-92 cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <ArrowLeft className="w-7 h-7 text-rose-700 stroke-[2.5]" />
                <span className="text-xs font-mono font-black">X-</span>
              </button>

              {/* BOUTON CENTRAL : STOP JOG */}
              <button
                type="button"
                onClick={handleStopJog}
                title="Arrêter immédiatement le déplacement Jog"
                className="h-16 rounded-xl bg-slate-800 hover:bg-slate-900 active:bg-black border-2 border-slate-900 text-white flex flex-col items-center justify-center shadow-md transition-transform active:scale-92 cursor-pointer"
              >
                <OctagonX className="w-6 h-6 text-red-400" />
                <span className="text-[11px] font-black uppercase tracking-tight mt-0.5">
                  STOP JOG
                </span>
              </button>

              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, 1, 0, 0)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="h-16 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border-2 border-rose-400 flex flex-col items-center justify-center text-rose-900 transition-transform active:scale-92 cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <ArrowRight className="w-7 h-7 text-rose-700 stroke-[2.5]" />
                <span className="text-xs font-mono font-black">X+</span>
              </button>

              {/* Ligne 3 : X- Y- | Y- | X+ Y- */}
              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, -1, -1, 0)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="h-16 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 flex flex-col items-center justify-center text-slate-700 transition-transform active:scale-92 cursor-pointer disabled:opacity-40"
              >
                <ArrowDownLeft className="w-6 h-6 text-slate-600" />
                <span className="text-[10px] font-mono font-bold mt-0.5">X- Y-</span>
              </button>

              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, 0, -1, 0)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="h-16 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border-2 border-emerald-400 flex flex-col items-center justify-center text-emerald-900 transition-transform active:scale-92 cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <ArrowDown className="w-7 h-7 text-emerald-700 stroke-[2.5]" />
                <span className="text-xs font-mono font-black">Y-</span>
              </button>

              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, 1, -1, 0)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="h-16 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 flex flex-col items-center justify-center text-slate-700 transition-transform active:scale-92 cursor-pointer disabled:opacity-40"
              >
                <ArrowDownRight className="w-6 h-6 text-slate-600" />
                <span className="text-[10px] font-mono font-bold mt-0.5">X+ Y-</span>
              </button>
            </div>

            {/* COLONNE DROITE (1 COLONNE SUR 4) : TOUCHES VERTICALES Z+ ET Z- */}
            <div className="col-span-1 flex flex-col gap-2 justify-between">
              {/* Z+ (Monter la fraise) */}
              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, 0, 0, 1)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="flex-1 min-h-[100px] rounded-xl bg-sky-50 hover:bg-sky-100 active:bg-sky-200 border-2 border-sky-400 flex flex-col items-center justify-center text-sky-950 transition-transform active:scale-92 cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <ArrowUp className="w-8 h-8 text-sky-700 stroke-[3]" />
                <span className="text-sm font-mono font-black mt-1">Z+</span>
                <span className="text-[10px] font-bold text-sky-800">Monter</span>
              </button>

              {/* Z- (Descendre la fraise) */}
              <button
                type="button"
                disabled={!isMotionAllowed}
                onPointerDown={(e) => handleJogPointerDown(e, 0, 0, -1)}
                onPointerUp={handleJogPointerUp}
                onPointerCancel={handleJogPointerCancel}
                className="flex-1 min-h-[100px] rounded-xl bg-sky-50 hover:bg-sky-100 active:bg-sky-200 border-2 border-sky-400 flex flex-col items-center justify-center text-sky-950 transition-transform active:scale-92 cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <ArrowDown className="w-8 h-8 text-sky-700 stroke-[3]" />
                <span className="text-sm font-mono font-black mt-1">Z-</span>
                <span className="text-[10px] font-bold text-sky-800">Descendre</span>
              </button>
            </div>
          </div>
        </section>

        {/* ===================================================================
            SECTION 3 : PALPAGE Z-PROBE RAPIDE (TOUCH PLATE)
        =================================================================== */}
        <section className="bg-white border border-slate-300 rounded-2xl p-3.5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Palpage Z Rapide (Sonde Pin A5)
              </h2>
            </div>
            {/* Indicateur de contact sonde en direct */}
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                status.pins.probe
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-400 animate-pulse'
                  : 'bg-slate-100 text-slate-600 border border-slate-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status.pins.probe ? 'bg-emerald-600' : 'bg-slate-400'
                }`}
              />
              <span>{status.pins.probe ? 'CONTACT FERMÉ' : 'SONDE OUVERTE'}</span>
            </div>
          </div>

          {/* Choix rapide de l'épaisseur de cale */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <span>Épaisseur de Cale Z :</span>
              <span className="font-mono text-blue-700 font-extrabold text-xs">
                {plateThickness.toFixed(2)} mm
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {QUICK_PROBE_PLATES.map((plate) => {
                const isSelected = Math.abs(plateThickness - plate.thickness) < 0.01;
                return (
                  <button
                    key={plate.label}
                    type="button"
                    onClick={() => handleApplyThickness(plate.thickness)}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer active:scale-95 text-center ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300'
                    }`}
                  >
                    {plate.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bouton de déclenchement du Palpage Z */}
          <button
            type="button"
            disabled={!isMotionAllowed}
            onClick={handleLaunchZProbe}
            className="flex items-center justify-center gap-2 h-13 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-sm shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-40"
          >
            <Play className="w-5 h-5 fill-current shrink-0" />
            <span>Lancer Palpage Z Direct ({plateThickness.toFixed(1)} mm)</span>
          </button>
        </section>
      </main>

      {/* =====================================================================
          BARRE D'URGENCE FIXE EN BAS D'ÉCRAN (ACCÈS RAPIDE INCONDITIONNEL)
      ===================================================================== */}
      <footer className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t-2 border-slate-300 px-3 py-2 shadow-2xl flex items-center gap-2">
        {/* GROS BOUTON STOP URGENCE */}
        <button
          type="button"
          onClick={handleEmergencyStop}
          title="Arrêt d'urgence immédiat (Soft Reset 0x18)"
          className="flex-1 h-13 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white flex items-center justify-center gap-2 font-black text-sm uppercase tracking-wider shadow-lg border-2 border-red-700 cursor-pointer active:scale-95"
        >
          <AlertOctagon className="w-6 h-6 shrink-0 animate-pulse" />
          <span>STOP URGENCE</span>
        </button>

        {/* BOUTON PAUSE (!) */}
        <button
          type="button"
          disabled={!status.connected || (!isRunning && status.state !== 'Jog')}
          onClick={handlePause}
          title="Mettre en pause (Feed Hold !)"
          className="h-13 px-3.5 sm:px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-35 disabled:pointer-events-none active:scale-95"
        >
          <Pause className="w-5 h-5 fill-current shrink-0" />
          <span>Pause (!)</span>
        </button>

        {/* BOUTON REPRENDRE (~) */}
        <button
          type="button"
          disabled={!status.connected || !isPaused}
          onClick={handleResume}
          title="Reprendre l'usinage (Cycle Start ~)"
          className="h-13 px-3.5 sm:px-4 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-35 disabled:pointer-events-none active:scale-95"
        >
          <Play className="w-5 h-5 fill-current shrink-0" />
          <span>Reprendre (~)</span>
        </button>
      </footer>
    </div>
  );
};

export default MobilePendantView;
