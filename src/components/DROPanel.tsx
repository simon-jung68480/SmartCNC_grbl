import React, { useState, useRef, useEffect } from 'react';
import {
  Unlock,
  Home,
  RotateCcw,
  Target,
  Crosshair,
  ArrowUpToLine,
  Compass,
  AlertTriangle,
  CheckCircle2,
  Play,
  Pause,
  Navigation,
  WifiOff,
  Check,
  X,
  CornerDownLeft,
  LocateFixed,
} from 'lucide-react';
import { GrblStatus, MachineState } from '../types/cnc';

export interface DROPanelProps {
  status: GrblStatus;
  onSendCommand: (command: string) => void;
  onSendRealtime?: (byte: number | string) => void;
  onSoftReset?: () => void;
  onZeroWorkAxis?: (axis: 'X' | 'Y' | 'Z' | 'XY' | 'ALL') => void;
  onSetMachineZero?: () => void;
  largeFont?: boolean;
  safeRetractZBeforeOrigin?: boolean;
  safeRetractZHeight?: number;
  confirmZeroAll?: boolean;
  useHoming?: boolean;
}

const GRBL_ALARMS_FR: Record<number, { title: string; desc: string }> = {
  1: {
    title: 'Fin de course matérielle (Hard Limit)',
    desc: 'Un capteur de fin de course a été déclenché. Le mouvement a été stoppé immédiatement.',
  },
  2: {
    title: 'Fin de course logicielle (Soft Limit)',
    desc: 'La cible dépasse les limites maximales de la machine ($130-$132).',
  },
  3: {
    title: 'Reset pendant un mouvement',
    desc: 'Arrêt d’urgence ou reset effectué en plein déplacement. Perte potentielle de pas.',
  },
  4: {
    title: 'Erreur initiale de sonde (Probe Fail)',
    desc: 'La sonde Z-Probe est déjà en contact avant le démarrage du cycle G38.2.',
  },
  5: {
    title: 'Échec de palpage (Probe Fail)',
    desc: 'La sonde n’a pas touché la pièce sur la course maximale autorisée.',
  },
  6: {
    title: 'Reset pendant le Homing',
    desc: 'Le cycle de prise d’origine ($H) a été interrompu par un reset.',
  },
  7: {
    title: 'Porte de sécurité ouverte pendant Homing',
    desc: 'La porte de sécurité a été ouverte durant le cycle de prise d’origine.',
  },
  8: {
    title: 'Échec de dégagement Homing (Pull-off)',
    desc: 'L’axe n’a pas réussi à libérer le contacteur de fin de course après détection.',
  },
  9: {
    title: 'Contacteur Homing introuvable',
    desc: 'Aucun contacteur de fin de course n’a été déclenché sur la distance de recherche.',
  },
};

function getStateBadgeConfig(state: MachineState, connected: boolean) {
  if (!connected || state === 'Disconnected') {
    return {
      label: 'DÉCONNECTÉ',
      bg: 'bg-[#1b2436] border-slate-700 text-slate-300',
      dot: 'bg-slate-400',
      icon: WifiOff,
    };
  }
  if (state === 'Idle') {
    return {
      label: 'PRÊT (IDLE)',
      bg: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300',
      dot: 'bg-emerald-400',
      icon: CheckCircle2,
    };
  }
  if (state === 'Run') {
    return {
      label: 'EN USINAGE',
      bg: 'bg-sky-500/15 border-sky-400/40 text-sky-300',
      dot: 'bg-sky-400 animate-pulse',
      icon: Play,
    };
  }
  if (state === 'Jog') {
    return {
      label: 'JOG MANUEL',
      bg: 'bg-sky-500/15 border-sky-400/40 text-sky-300',
      dot: 'bg-sky-400 animate-pulse',
      icon: Navigation,
    };
  }
  if (state.startsWith('Hold')) {
    return {
      label: `PAUSE (${state})`,
      bg: 'bg-amber-500/15 border-amber-400/40 text-amber-300',
      dot: 'bg-amber-400',
      icon: Pause,
    };
  }
  if (state === 'Alarm') {
    return {
      label: 'ALARME GRBL',
      bg: 'bg-red-500/20 border-red-400/50 text-rose-200',
      dot: 'bg-red-500 animate-ping',
      icon: AlertTriangle,
    };
  }
  if (state === 'Home') {
    return {
      label: 'HOMING ($H)',
      bg: 'bg-amber-500/15 border-amber-400/40 text-amber-300',
      dot: 'bg-amber-400 animate-pulse',
      icon: Compass,
    };
  }
  return {
    label: state.toUpperCase(),
    bg: 'bg-amber-500/15 border-amber-400/40 text-amber-300',
    dot: 'bg-amber-400',
    icon: AlertTriangle,
  };
}

export const DROPanel: React.FC<DROPanelProps> = ({
  status,
  onSendCommand,
  onSendRealtime,
  onSoftReset,
  onZeroWorkAxis,
  onSetMachineZero,
  largeFont = false,
  safeRetractZBeforeOrigin = true,
  safeRetractZHeight = 10,
  confirmZeroAll = false,
  useHoming = false,
}) => {
  const [editingAxis, setEditingAxis] = useState<'X' | 'Y' | 'Z' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [confirmingZeroAll, setConfirmingZeroAll] = useState<boolean>(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (editingAxis && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingAxis]);

  const badge = getStateBadgeConfig(status.state, status.connected);
  const BadgeIcon = badge.icon;

  const isDisabled = !status.connected;
  const isMotionAllowed =
    status.connected && (status.state === 'Idle' || status.state === 'Jog' || status.state === 'Check');

  const handleSoftReset = () => {
    if (onSoftReset) {
      onSoftReset();
    } else if (onSendRealtime) {
      onSendRealtime(0x18);
    } else {
      onSendCommand('\x18');
    }
  };

  const handleZeroWork = (axis: 'X' | 'Y' | 'Z' | 'XY' | 'ALL') => {
    if (onZeroWorkAxis) {
      onZeroWorkAxis(axis);
      return;
    }
    if (axis === 'ALL') {
      onSendCommand('G10 L20 P1 X0 Y0 Z0');
    } else if (axis === 'XY') {
      onSendCommand('G10 L20 P1 X0 Y0');
    } else {
      onSendCommand(`G10 L20 P1 ${axis}0`);
    }
  };

  const handleClickZeroAll = () => {
    if (confirmZeroAll && !confirmingZeroAll) {
      setConfirmingZeroAll(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingZeroAll(false);
      }, 3000);
      return;
    }
    setConfirmingZeroAll(false);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    handleZeroWork('ALL');
  };

  const handleGoOriginXY = () => {
    if (safeRetractZBeforeOrigin) {
      const zH = (safeRetractZHeight || 10).toFixed(3);
      onSendCommand(`G21 G90\nG0 Z${zH}\nG0 X0 Y0`);
    } else {
      onSendCommand('G90 G0 X0 Y0');
    }
  };

  const handleMachineZeroHere = () => {
    if (onSetMachineZero) {
      onSetMachineZero();
    } else {
      onSendCommand('G92.1');
    }
  };

  const startEditingAxis = (axis: 'X' | 'Y' | 'Z', currentVal: number) => {
    if (!status.connected) return;
    setEditingAxis(axis);
    setEditValue(currentVal.toFixed(3));
  };

  const applySetAxisValue = (axis: 'X' | 'Y' | 'Z') => {
    const parsed = parseFloat(editValue.replace(',', '.'));
    if (!isNaN(parsed)) {
      onSendCommand(`G10 L20 P1 ${axis}${parsed.toFixed(3)}`);
    }
    setEditingAxis(null);
  };

  const applyGoToAxisValue = (axis: 'X' | 'Y' | 'Z') => {
    const parsed = parseFloat(editValue.replace(',', '.'));
    if (!isNaN(parsed)) {
      onSendCommand(`G90 G0 ${axis}${parsed.toFixed(3)}`);
    }
    setEditingAxis(null);
  };

  const axesConfig: Array<{
    axis: 'X' | 'Y' | 'Z';
    key: 'x' | 'y' | 'z';
    accentText: string;
    stripBg: string;
    zeroBtnClass: string;
  }> = [
    {
      axis: 'X',
      key: 'x',
      accentText: 'text-rose-400',
      stripBg: 'bg-rose-500',
      zeroBtnClass:
        'bg-[#1b2436] hover:bg-rose-500 border-slate-700 hover:border-rose-400 text-slate-100 hover:text-slate-950',
    },
    {
      axis: 'Y',
      key: 'y',
      accentText: 'text-emerald-400',
      stripBg: 'bg-emerald-500',
      zeroBtnClass:
        'bg-[#1b2436] hover:bg-emerald-500 border-slate-700 hover:border-emerald-400 text-slate-100 hover:text-slate-950',
    },
    {
      axis: 'Z',
      key: 'z',
      accentText: 'text-sky-400',
      stripBg: 'bg-sky-400',
      zeroBtnClass:
        'bg-[#1b2436] hover:bg-sky-400 border-slate-700 hover:border-sky-300 text-slate-100 hover:text-slate-950',
    },
  ];

  const alarmInfo =
    status.state === 'Alarm'
      ? GRBL_ALARMS_FR[status.alarmCode || 0] || {
          title: `Alarme GRBL ${status.alarmCode ? `#${status.alarmCode}` : ''}`,
          desc:
            status.alarmMessage ||
            'Machine verrouillée par sécurité. Déverrouillez ($X) ou lancez un Homing ($H).',
        }
      : null;

  return (
    <div className="bg-[#141b27] border border-slate-800 text-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.28)] rounded-xl p-3.5 flex flex-col gap-2.5 select-none">
      {/* Barre supérieure compacte : État GRBL + WCS + Actions système */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 min-h-8 rounded-lg border font-mono text-[11px] font-bold tracking-wide ${badge.bg}`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${badge.dot}`} />
            <BadgeIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{badge.label}</span>
          </div>

          {status.isSimulator && status.connected && (
            <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-400/40 rounded-md">
              SIMU
            </span>
          )}

          <span
            title="Système de coordonnées pièce actif (WCS)"
            className="px-2 py-0.5 rounded-md bg-[#1b2436] border border-slate-700 font-mono text-[11px] font-semibold text-slate-200"
          >
            {status.activeWCS}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!isMotionAllowed}
            onClick={() => onSendCommand(status.distanceMode === 'G90' ? 'G91' : 'G90')}
            title="Basculer entre coordonnées Absolues (G90) et Relatives (G91)"
            className="min-h-8 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-[#1b2436] border border-slate-700 text-slate-200 hover:bg-[#243047] transition-colors cursor-pointer disabled:opacity-40"
          >
            {status.distanceMode}
          </button>

          <button
            type="button"
            disabled={isDisabled}
            onClick={() => onSendCommand('$X')}
            title="Déverrouiller GRBL sans prise d'origine ($X)"
            className={`min-h-8 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              status.state === 'Alarm'
                ? 'bg-amber-400 border-amber-300 text-slate-950 hover:bg-amber-300'
                : 'bg-[#1b2436] border-slate-700 text-slate-200 hover:bg-[#243047]'
            }`}
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>$X</span>
          </button>

          <button
            type="button"
            disabled={isDisabled}
            onClick={handleSoftReset}
            title="Soft Reset immédiat (0x18 / Ctrl+X)"
            className="min-h-8 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-950/60 border border-red-500/45 text-rose-200 hover:bg-red-600 hover:border-red-500 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Bannière d'alarme ou d'erreur si présente */}
      {(alarmInfo || status.lastError) && (
        <div
          className={`flex items-start justify-between gap-2.5 px-3 py-2.5 rounded-xl border text-xs ${
            alarmInfo
              ? 'bg-red-950/75 border-red-500/60 text-red-100'
              : 'bg-amber-950/60 border-amber-500/50 text-amber-100'
          }`}
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${alarmInfo ? 'text-rose-400' : 'text-amber-400'}`} />
            <div className="min-w-0">
              {alarmInfo ? (
                <>
                  <div className="font-bold text-rose-200">
                    ALARME {status.alarmCode ? `#${status.alarmCode}` : ''} : {alarmInfo.title}
                  </div>
                  <div className="text-[11px] text-rose-100/90 mt-0.5 leading-snug">{alarmInfo.desc}</div>
                </>
              ) : (
                <>
                  <div className="font-bold text-amber-200">Dernière erreur GRBL :</div>
                  <div className="text-[11px] font-mono mt-0.5 break-all text-amber-100">{status.lastError}</div>
                </>
              )}
            </div>
          </div>
          {status.state === 'Alarm' && (
            <button
              type="button"
              onClick={() => onSendCommand('$X')}
              className="shrink-0 min-h-8 px-3 py-1 rounded-lg bg-red-500 hover:bg-red-400 text-white font-bold text-xs cursor-pointer"
            >
              Acquitter ($X)
            </button>
          )}
        </div>
      )}

      {/* Écran DRO encastré (Axes X, Y, Z) */}
      <div className="bg-[#090d14] border border-slate-800/90 rounded-xl p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span>Position Pièce (WPos)</span>
          <span>MPos · Origine</span>
        </div>

        {axesConfig.map(({ axis, key, accentText, stripBg, zeroBtnClass }) => {
          const wposVal = status.wpos[key];
          const mposVal = status.mpos[key];
          const isEditing = editingAxis === axis;

          return (
            <div
              key={axis}
              className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#111722] pl-3.5 pr-2.5 py-2 text-slate-100 flex items-center justify-between gap-2"
            >
              <span className={`absolute left-0 top-0 bottom-0 w-1 ${stripBg}`} aria-hidden="true" />

              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className={`w-6 text-center font-mono text-lg font-extrabold shrink-0 ${accentText}`}>
                  {axis}
                </span>

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') applySetAxisValue(axis);
                          if (e.key === 'Escape') setEditingAxis(null);
                        }}
                        className="w-28 min-h-9 bg-[#141b27] border border-sky-400 rounded-lg px-2.5 py-1 font-mono text-base font-bold text-slate-50 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => applySetAxisValue(axis)}
                        title={`Forcer la cote pièce ${axis} à cette valeur`}
                        className="min-h-8 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Fixer cote</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGoToAxisValue(axis)}
                        title={`Déplacer la machine vers ${axis}=${editValue} (G90 G0)`}
                        className="min-h-8 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 text-[11px] font-bold cursor-pointer"
                      >
                        <CornerDownLeft className="w-3.5 h-3.5" />
                        <span>Aller à</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingAxis(null)}
                        aria-label="Annuler l'édition"
                        className="min-h-8 min-w-8 p-1.5 rounded-lg bg-[#1b2436] hover:bg-[#243047] border border-slate-700 text-slate-300 hover:text-white cursor-pointer flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!status.connected}
                        onClick={() => startEditingAxis(axis, wposVal)}
                        title={`Cliquer pour modifier la cote ${axis} ou envoyer un déplacement`}
                        className="text-left cursor-pointer disabled:cursor-default inline-flex items-baseline gap-1.5 rounded-md px-1 -mx-1 hover:bg-[#1b2436] transition-colors"
                      >
                        <span
                          className={`font-mono leading-none ${
                            largeFont ? 'text-3xl sm:text-4xl' : 'text-2xl'
                          } font-bold tracking-tight tabular-nums ${accentText}`}
                        >
                          {wposVal >= 0 ? `+${wposVal.toFixed(3)}` : wposVal.toFixed(3)}
                        </span>
                        <span className="font-mono text-xs text-slate-400 font-semibold">
                          {status.unit}
                        </span>
                      </button>
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
                        MPos {mposVal.toFixed(3)} {status.unit}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {!isEditing && (
                <button
                  type="button"
                  disabled={!isMotionAllowed}
                  onClick={() => handleZeroWork(axis)}
                  title={`Définir l'origine Pièce ${axis} = 0 à la position actuelle (sans bouger la machine)`}
                  className={`min-h-9 px-3 py-1.5 rounded-lg border font-mono text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:cursor-not-allowed ${zeroBtnClass}`}
                >
                  {axis}=0
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Zone 1 : Origine (sans déplacement) */}
      <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
          Origine (sans déplacement)
        </div>

        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            disabled={!isMotionAllowed}
            onClick={handleClickZeroAll}
            title={
              confirmingZeroAll
                ? 'Cliquez pour confirmer la mise à zéro XYZ de la pièce'
                : 'Fixe X=0, Y=0 et Z=0 de la pièce à la position actuelle de la fraise'
            }
            className={`min-h-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
              confirmingZeroAll
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 animate-pulse border border-amber-300'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm'
            }`}
          >
            <Target className="w-4 h-4 shrink-0" />
            <span>
              {confirmingZeroAll ? 'Confirmer XYZ=0 ?' : 'Origine Pièce (XYZ = 0)'}
            </span>
          </button>

          <button
            type="button"
            disabled={!isMotionAllowed}
            onClick={() => handleZeroWork('XY')}
            title="Fixe uniquement X=0 et Y=0 de la pièce à la position actuelle"
            className="min-h-10 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#1b2436] hover:bg-[#243047] border border-slate-700 text-emerald-300 text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Crosshair className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span>XY = 0</span>
          </button>
        </div>

        {useHoming ? (
          <div className="flex items-stretch gap-1.5">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => onSendCommand('$H')}
              title="Exécuter la séquence automatique de prise d'origine sur les capteurs de fin de course X/Y/Z ($H)"
              className="min-h-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold transition-colors shadow-sm cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Cycle Homing ($H)</span>
            </button>

            <button
              type="button"
              disabled={!isMotionAllowed}
              onClick={handleMachineZeroHere}
              title="Forcer la position actuelle comme 0;0;0 Machine sans déclencher les capteurs (secours)"
              className="min-h-10 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#1b2436] hover:bg-[#243047] border border-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <LocateFixed className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>0 Machine ici</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!isMotionAllowed}
            onClick={handleMachineZeroHere}
            title="Définit la position actuelle comme le 0;0;0 Machine (sans utiliser de capteurs Homing)"
            className="min-h-9 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <LocateFixed className="w-4 h-4 text-amber-300 shrink-0" />
            <span>0 Machine ici (sans Homing)</span>
          </button>
        )}
      </div>

      {/* Zone 2 : Aller à (déplacement) */}
      <div className="pt-2 border-t border-slate-800 flex flex-col gap-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
          Aller à (déplacement)
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            disabled={!isMotionAllowed}
            onClick={handleGoOriginXY}
            title={
              safeRetractZBeforeOrigin
                ? `Monte Z à +${safeRetractZHeight}mm en sécurité avant d'aller à X0 Y0 (Anti-crash brides)`
                : "Déplacer la machine vers l'origine Pièce X0 Y0 (G90 G0 X0 Y0)"
            }
            className="min-h-9 flex items-center justify-center gap-1 px-2 py-2 rounded-xl bg-[#1b2436] hover:bg-[#243047] border border-slate-700 text-xs font-semibold text-slate-100 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Navigation className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate">Origine XY</span>
            {safeRetractZBeforeOrigin && (
              <span className="text-[10px] font-mono px-1 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 shrink-0">
                Z
              </span>
            )}
          </button>

          <button
            type="button"
            disabled={!isMotionAllowed}
            onClick={() => onSendCommand('G90 G0 Z10')}
            title="Monter la fraise à Z = +10mm en coordonnées Pièce (G90 G0 Z10)"
            className="min-h-9 flex items-center justify-center gap-1 px-2 py-2 rounded-xl bg-[#1b2436] hover:bg-[#243047] border border-slate-700 text-xs font-semibold text-slate-100 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <ArrowUpToLine className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Z +10</span>
          </button>

          <button
            type="button"
            disabled={!isMotionAllowed}
            onClick={() => onSendCommand('G53 G0 X0 Y0')}
            title="Retourner aux coordonnées Machine X0 Y0 (G53 G0 X0 Y0)"
            className="min-h-9 flex items-center justify-center gap-1 px-2 py-2 rounded-xl bg-[#1b2436] hover:bg-[#243047] border border-slate-700 text-xs font-semibold text-slate-100 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>0 Machine</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DROPanel;
