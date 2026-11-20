import React from 'react';
import {
  Volume2,
  VolumeX,
  Volume1,
  X,
  Play,
  RotateCcw,
  Zap,
  CheckCircle2,
  ShieldAlert,
  Move,
  Info,
} from 'lucide-react';
import {
  useAudioAlertSettings,
  playProbeContactBeep,
  playJobCompleteMelody,
  playAlarmAlert,
  playJogClick,
  DEFAULT_AUDIO_SETTINGS,
} from '../utils/audioAlerts';

export interface SoundSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SoundSettingsModal: React.FC<SoundSettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = useAudioAlertSettings();

  if (!isOpen) return null;

  const handleTestSound = (type: 'probe' | 'job' | 'alarm' | 'jog') => {
    switch (type) {
      case 'probe':
        playProbeContactBeep(true);
        break;
      case 'job':
        playJobCompleteMelody(true);
        break;
      case 'alarm':
        playAlarmAlert(true);
        break;
      case 'jog':
        playJogClick(true);
        break;
    }
  };

  const handleResetDefaults = () => {
    updateSettings(DEFAULT_AUDIO_SETTINGS);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-[#141b27] border border-slate-700 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-settings-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-400 flex items-center justify-center">
              {settings.enabled && settings.masterVolume > 0 ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div>
              <h2 id="audio-settings-title" className="text-sm font-bold text-slate-50 leading-tight">
                Signaux Sonores & Alertes d'Atelier
              </h2>
              <p className="text-[11px] text-slate-300">
                Retour audio autonome en temps réel (Web Audio API synthétisé)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-9 min-w-9 flex items-center justify-center rounded-lg bg-[#1b2436] hover:bg-[#243047] text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
            title="Fermer"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master Volume Bar */}
        <div className="p-3.5 rounded-xl bg-[#0f1520] border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => updateSettings({ enabled: !settings.enabled })}
                className={`min-h-9 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  settings.enabled
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50 hover:bg-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-200 border-rose-400/50 hover:bg-rose-500/30'
                }`}
                title={settings.enabled ? 'Couper tous les sons' : 'Activer les sons'}
              >
                {settings.enabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Audio Actif</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>Muet (Mute)</span>
                  </>
                )}
              </button>
              <span className="text-xs font-semibold text-slate-200">Volume Général</span>
            </div>
            <span className="text-xs font-mono font-bold text-slate-100 bg-[#090d14] px-2.5 py-1 rounded-md border border-slate-700">
              {settings.enabled ? `${settings.masterVolume}%` : 'Désactivé'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Volume1 className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={settings.masterVolume}
              disabled={!settings.enabled}
              onChange={(e) => updateSettings({ masterVolume: Number(e.target.value) })}
              className="flex-1 h-2 bg-[#090d14] rounded-lg appearance-none cursor-pointer accent-sky-400 disabled:opacity-40"
            />
            <Volume2 className="w-4 h-4 text-slate-300 shrink-0" />
          </div>
        </div>

        {/* Sound Events List */}
        <div className="space-y-2.5">
          {/* 1. Probe Contact */}
          <div className="p-3 rounded-xl border border-slate-800 bg-[#0f1520] hover:border-slate-700 transition-colors flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="sound-probe" className="text-xs font-bold text-slate-50 cursor-pointer">
                    Contact Palpeur Z / Touch Plate
                  </label>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/40">
                    1046 Hz
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Bip court et aigu dès la détection de contact (Broche Probe). Indispensable pour tester la pince croco contre la fraise au touché avant de lancer le palpage.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-center">
              <button
                onClick={() => handleTestSound('probe')}
                className="min-h-8 px-2.5 py-1 rounded-lg bg-[#1b2436] hover:bg-[#243047] text-slate-100 text-xs font-semibold border border-slate-700/80 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Tester le son"
              >
                <Play className="w-3 h-3 text-sky-400 fill-sky-400" />
                <span>Tester</span>
              </button>
              <input
                id="sound-probe"
                type="checkbox"
                checked={settings.probeContact}
                onChange={(e) => updateSettings({ probeContact: e.target.checked })}
                className="w-4 h-4 accent-sky-400 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* 2. Job Complete */}
          <div className="p-3 rounded-xl border border-slate-800 bg-[#0f1520] hover:border-slate-700 transition-colors flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="sound-job" className="text-xs font-bold text-slate-50 cursor-pointer">
                    Fin d'Usinage (Job Complété 100%)
                  </label>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-500/40">
                    3 notes
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Carillon mélodique de succès quand toutes les lignes de G-Code sont achevées. Permet de savoir que la pièce est prête sans rester devant l'écran.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-center">
              <button
                onClick={() => handleTestSound('job')}
                className="min-h-8 px-2.5 py-1 rounded-lg bg-[#1b2436] hover:bg-[#243047] text-slate-100 text-xs font-semibold border border-slate-700/80 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Tester le son"
              >
                <Play className="w-3 h-3 text-sky-400 fill-sky-400" />
                <span>Tester</span>
              </button>
              <input
                id="sound-job"
                type="checkbox"
                checked={settings.jobComplete}
                onChange={(e) => updateSettings({ jobComplete: e.target.checked })}
                className="w-4 h-4 accent-sky-400 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* 3. Alarm Alert */}
          <div className="p-3 rounded-xl border border-slate-800 bg-[#0f1520] hover:border-slate-700 transition-colors flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="sound-alarm" className="text-xs font-bold text-slate-50 cursor-pointer">
                    Alarme GRBL & Fins de Course
                  </label>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 border border-rose-500/40">
                    Urgence
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Tonalité d'alerte bitonale percutante dès que GRBL entre en mode Alarme ou qu'une fin de course mécanique (X, Y, Z) est enclenchée.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-center">
              <button
                onClick={() => handleTestSound('alarm')}
                className="min-h-8 px-2.5 py-1 rounded-lg bg-[#1b2436] hover:bg-[#243047] text-slate-100 text-xs font-semibold border border-slate-700/80 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Tester le son"
              >
                <Play className="w-3 h-3 text-sky-400 fill-sky-400" />
                <span>Tester</span>
              </button>
              <input
                id="sound-alarm"
                type="checkbox"
                checked={settings.alarmAlert}
                onChange={(e) => updateSettings({ alarmAlert: e.target.checked })}
                className="w-4 h-4 accent-sky-400 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* 4. Jog Click */}
          <div className="p-3 rounded-xl border border-slate-800 bg-[#0f1520] hover:border-slate-700 transition-colors flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#1b2436] border border-slate-700 text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                <Move className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="sound-jog" className="text-xs font-bold text-slate-50 cursor-pointer">
                    Clic Discret de Jogging
                  </label>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#1b2436] text-slate-200 border border-slate-700">
                    Micro-bip
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-normal">
                  Micro-clic mécanique subtil à chaque impulsion manuelle de déplacement (boutons à l'écran, pavé tactile ou raccourcis clavier).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-center">
              <button
                onClick={() => handleTestSound('jog')}
                className="min-h-8 px-2.5 py-1 rounded-lg bg-[#1b2436] hover:bg-[#243047] text-slate-100 text-xs font-semibold border border-slate-700/80 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Tester le son"
              >
                <Play className="w-3 h-3 text-sky-400 fill-sky-400" />
                <span>Tester</span>
              </button>
              <input
                id="sound-jog"
                type="checkbox"
                checked={settings.jogClick}
                onChange={(e) => updateSettings({ jogClick: e.target.checked })}
                className="w-4 h-4 accent-sky-400 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Workshop Note */}
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center gap-2 text-xs text-sky-200">
          <Info className="w-4 h-4 text-sky-400 shrink-0" />
          <span>
            Synthétisé directement par votre navigateur (zéro latence, zéro fichier externe, 100% autonome).
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3">
          <button
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#1b2436] transition-colors cursor-pointer"
            title="Rétablir les valeurs sonores d'origine"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Réinitialiser</span>
          </button>

          <button
            onClick={onClose}
            className="min-h-9 px-4 py-1.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-xs transition-colors cursor-pointer shadow-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
