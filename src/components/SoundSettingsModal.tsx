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
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-white border border-slate-300 rounded-xl max-w-xl w-full p-5 space-y-4 shadow-xl text-slate-900 animate-in fade-in zoom-in-95 duration-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-settings-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              {settings.enabled && settings.masterVolume > 0 ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div>
              <h2 id="audio-settings-title" className="text-sm font-bold text-slate-900 leading-tight">
                Signaux Sonores & Alertes d'Atelier
              </h2>
              <p className="text-[11px] text-slate-500">
                Retour audio autonome en temps réel (Web Audio API synthétisé)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master Volume Bar */}
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSettings({ enabled: !settings.enabled })}
                className={`p-1.5 rounded text-xs font-semibold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  settings.enabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
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
              <span className="text-xs font-medium text-slate-700">Volume Général</span>
            </div>
            <span className="text-xs font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
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
              className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-600 disabled:opacity-40"
            />
            <Volume2 className="w-4 h-4 text-slate-600 shrink-0" />
          </div>
        </div>

        {/* Sound Events List */}
        <div className="space-y-2.5">
          {/* 1. Probe Contact */}
          <div className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <label htmlFor="sound-probe" className="text-xs font-bold text-slate-900 cursor-pointer">
                    Contact Palpeur Z / Touch Plate
                  </label>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    1046 Hz
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Bip court et aigu dès la détection de contact (Broche Probe). Indispensable pour tester la pince croco contre la fraise au touché avant de lancer le palpage.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-center">
              <button
                onClick={() => handleTestSound('probe')}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                title="Tester le son"
              >
                <Play className="w-3 h-3 text-sky-600 fill-sky-600" />
                <span>Tester</span>
              </button>
              <input
                id="sound-probe"
                type="checkbox"
                checked={settings.probeContact}
                onChange={(e) => updateSettings({ probeContact: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
              />
            </div>
          </div>

          {/* 2. Job Complete */}
          <div className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <label htmlFor="sound-job" className="text-xs font-bold text-slate-900 cursor-pointer">
                    Fin d'Usinage (Job Complété 100%)
                  </label>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    3 notes
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Carillon mélodique de succès quand toutes les lignes de G-Code sont achevées. Permet de savoir que la pièce est prête sans rester devant l'écran.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-center">
              <button
                onClick={() => handleTestSound('job')}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                title="Tester le son"
              >
                <Play className="w-3 h-3 text-sky-600 fill-sky-600" />
                <span>Tester</span>
              </button>
              <input
                id="sound-job"
                type="checkbox"
                checked={settings.jobComplete}
                onChange={(e) => updateSettings({ jobComplete: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
              />
            </div>
          </div>

          {/* 3. Alarm Alert */}
          <div className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded bg-red-100 text-red-700 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <label htmlFor="sound-alarm" className="text-xs font-bold text-slate-900 cursor-pointer">
                    Alarme GRBL & Fins de Course
                  </label>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-red-50 text-red-800 border border-red-200">
                    Urgence
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Tonalité d'alerte bitonale percutante dès que GRBL entre en mode Alarme ou qu'une fin de course mécanique (X, Y, Z) est enclenchée.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-center">
              <button
                onClick={() => handleTestSound('alarm')}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                title="Tester le son"
              >
                <Play className="w-3 h-3 text-sky-600 fill-sky-600" />
                <span>Tester</span>
              </button>
              <input
                id="sound-alarm"
                type="checkbox"
                checked={settings.alarmAlert}
                onChange={(e) => updateSettings({ alarmAlert: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
              />
            </div>
          </div>

          {/* 4. Jog Click */}
          <div className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <Move className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <label htmlFor="sound-jog" className="text-xs font-bold text-slate-900 cursor-pointer">
                    Clic Discret de Jogging
                  </label>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    Micro-bip
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Micro-clic mécanique subtil à chaque impulsion manuelle de déplacement (boutons à l'écran, pavé tactile ou raccourcis clavier).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-center">
              <button
                onClick={() => handleTestSound('jog')}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                title="Tester le son"
              >
                <Play className="w-3 h-3 text-sky-600 fill-sky-600" />
                <span>Tester</span>
              </button>
              <input
                id="sound-jog"
                type="checkbox"
                checked={settings.jogClick}
                onChange={(e) => updateSettings({ jogClick: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Workshop Note */}
        <div className="p-2.5 rounded-lg bg-sky-50/70 border border-sky-200 flex items-center gap-2 text-[11px] text-sky-900">
          <Info className="w-4 h-4 text-sky-600 shrink-0" />
          <span>
            Synthétisé directement par votre navigateur (zéro latence, zéro fichier externe, 100% autonome).
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Rétablir les valeurs sonores d'origine"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Réinitialiser</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
