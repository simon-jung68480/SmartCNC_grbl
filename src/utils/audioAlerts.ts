/**
 * SmartCNC - Atelier Audio Alerts & Sound Feedback
 *
 * Moteur audio autonome 100% Web Audio API (zéro fichier mp3 externe, zéro latence).
 * Conçu pour les ateliers d'usinage afin d'alerter l'opérateur même lorsqu'il ne regarde pas l'écran :
 * - Contact de palpeur Z / Touch plate (bip de continuité type multimètre de précision).
 * - Fin d'usinage (carillon de succès 3 notes).
 * - Alarme GRBL & déclenchement de fin de course (signal d'urgence 2 tonalités).
 * - Clic mécanique discret de jogging.
 */

import { useState, useEffect, useCallback } from 'react';

export interface AudioAlertSettings {
  masterVolume: number;   // 0 - 100
  enabled: boolean;        // Interrupteur général
  probeContact: boolean;   // Bip contact plaque palpeur
  jobComplete: boolean;    // Carillon fin de job 100%
  alarmAlert: boolean;     // Tonalité alarme GRBL / limites
  jogClick: boolean;       // Micro-clic de déplacement manuel
}

export const DEFAULT_AUDIO_SETTINGS: AudioAlertSettings = {
  masterVolume: 80,
  enabled: true,
  probeContact: true,
  jobComplete: true,
  alarmAlert: true,
  jogClick: false, // Désactivé par défaut pour discrétion, activable en un clic
};

const STORAGE_KEY = 'smartcnc_audio_settings_v1';

// ============================================================================
// GESTION DU CONTEXTE AUDIO SÉCURISÉ (Auto-unlock au premier geste utilisateur)
// ============================================================================

let sharedAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!sharedAudioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }

  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }

  return sharedAudioCtx;
}

/**
 * Déverrouille l'AudioContext dès la première interaction utilisateur (politique autoplay navigateur).
 */
function setupAutoUnlock() {
  if (typeof window === 'undefined') return;

  const handleUserGesture = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        isAudioUnlocked = true;
      }).catch(() => {});
    } else if (ctx && ctx.state === 'running') {
      isAudioUnlocked = true;
    }

    if (isAudioUnlocked) {
      window.removeEventListener('pointerdown', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
    }
  };

  window.addEventListener('pointerdown', handleUserGesture, { passive: true });
  window.addEventListener('keydown', handleUserGesture, { passive: true });
  window.addEventListener('touchstart', handleUserGesture, { passive: true });
}

// Initialise l'écouteur au chargement du module
if (typeof window !== 'undefined') {
  setupAutoUnlock();
}

// ============================================================================
// GESTION DES PARAMÈTRES (LocalStorage & Événements Réactifs)
// ============================================================================

let currentSettings: AudioAlertSettings = loadSettingsFromStorage();
const changeListeners = new Set<(settings: AudioAlertSettings) => void>();

function loadSettingsFromStorage(): AudioAlertSettings {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      masterVolume: typeof parsed.masterVolume === 'number' ? Math.max(0, Math.min(100, parsed.masterVolume)) : DEFAULT_AUDIO_SETTINGS.masterVolume,
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_AUDIO_SETTINGS.enabled,
      probeContact: typeof parsed.probeContact === 'boolean' ? parsed.probeContact : DEFAULT_AUDIO_SETTINGS.probeContact,
      jobComplete: typeof parsed.jobComplete === 'boolean' ? parsed.jobComplete : DEFAULT_AUDIO_SETTINGS.jobComplete,
      alarmAlert: typeof parsed.alarmAlert === 'boolean' ? parsed.alarmAlert : DEFAULT_AUDIO_SETTINGS.alarmAlert,
      jogClick: typeof parsed.jogClick === 'boolean' ? parsed.jogClick : DEFAULT_AUDIO_SETTINGS.jogClick,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function getAudioSettings(): AudioAlertSettings {
  return currentSettings;
}

export function saveAudioSettings(settings: AudioAlertSettings): void {
  currentSettings = { ...settings };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    } catch {
      // ignore
    }
  }
  changeListeners.forEach((listener) => {
    try {
      listener(currentSettings);
    } catch {
      // ignore
    }
  });
}

export function updateAudioSettings(patch: Partial<AudioAlertSettings>): AudioAlertSettings {
  const updated: AudioAlertSettings = {
    ...currentSettings,
    ...patch,
  };
  saveAudioSettings(updated);
  return updated;
}

export function subscribeAudioSettings(listener: (settings: AudioAlertSettings) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * Hook React pour connecter les composants aux réglages sonores en temps réel.
 */
export function useAudioAlertSettings() {
  const [settings, setSettings] = useState<AudioAlertSettings>(getAudioSettings);

  useEffect(() => {
    return subscribeAudioSettings(setSettings);
  }, []);

  const update = useCallback((patch: Partial<AudioAlertSettings>) => {
    return updateAudioSettings(patch);
  }, []);

  return { settings, updateSettings: update };
}

// ============================================================================
// SYNTHÈSE SONORE WEB AUDIO API
// ============================================================================

function getEffectiveVolume(baseGain: number, force = false): number {
  if (!force && (!currentSettings.enabled || currentSettings.masterVolume <= 0)) {
    return 0;
  }
  const factor = currentSettings.masterVolume / 100;
  return baseGain * factor;
}

// Anti-spam throttles pour éviter la saturation audio lors des rebonds mécaniques
let lastAlarmTime = 0;
let lastJogTime = 0;
let lastProbeTime = 0;

/**
 * 1. BIP DE CONTACT PALPEUR (Touch Plate Z-Probe)
 * Bip court, aigu et net (1046 Hz - Do6).
 * Équivalent sonore d'un testeur de continuité Fluke : idéal pour tester la pince croco
 * contre la fraise / palpeur avant d'exécuter la descente de palpage.
 */
export function playProbeContactBeep(force = false): void {
  if (!force && (!currentSettings.enabled || !currentSettings.probeContact)) return;

  const now = performance.now();
  if (!force && now - lastProbeTime < 70) return; // Anti-rebond 70ms
  lastProbeTime = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  const gainLevel = getEffectiveVolume(0.35, force);
  if (gainLevel <= 0) return;

  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1046.5, t0); // Note Do6 / C6 (très clair et distinct)

  // Enveloppe d'attaque instantanée (1ms) et déclin doux (75ms)
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(gainLevel, t0 + 0.002);
  gain.gain.setValueAtTime(gainLevel, t0 + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t0 + 0.095);

  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/**
 * 2. CARILLON DE FIN D'USINAGE (Job Completed)
 * Mélodie de succès à 3 notes ascendantes (Mi5 ➔ Sol#5 ➔ Si5), harmonique et chaleureuse.
 * Avertit l'utilisateur à travers l'atelier que le travail à 100% est achevé.
 */
export function playJobCompleteMelody(force = false): void {
  if (!force && (!currentSettings.enabled || !currentSettings.jobComplete)) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const masterVol = getEffectiveVolume(0.3, force);
  if (masterVol <= 0) return;

  const notes = [
    { freq: 659.25, time: 0.00, dur: 0.16 }, // Mi5 (E5)
    { freq: 830.61, time: 0.14, dur: 0.18 }, // Sol#5 (G#5)
    { freq: 987.77, time: 0.30, dur: 0.45 }, // Si5 (B5) - résonance finale
  ];

  const t0 = ctx.currentTime;

  notes.forEach((note) => {
    const noteStart = t0 + note.time;
    const noteEnd = noteStart + note.dur;

    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.freq, noteStart);

    // Doublage discret à l'octave supérieure avec triangle pour timbre d'instrument / carillon
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(note.freq * 2, noteStart);

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.linearRampToValueAtTime(masterVol, noteStart + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    osc.connect(gain);
    subOsc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(noteStart);
    subOsc.start(noteStart);
    osc.stop(noteEnd + 0.01);
    subOsc.stop(noteEnd + 0.01);

    osc.onended = () => {
      osc.disconnect();
      subOsc.disconnect();
      gain.disconnect();
    };
  });
}

/**
 * 3. ALERTE ALARME GRBL / FIN DE COURSE PERCUTÉ (Alarm State)
 * Signal sonore industriel bitonal percutant (2 salves 880Hz / 660Hz).
 * Conçu pour traverser les bruits d'aspiration et de broche sans distorsion désagréable.
 */
export function playAlarmAlert(force = false): void {
  if (!force && (!currentSettings.enabled || !currentSettings.alarmAlert)) return;

  const now = performance.now();
  if (!force && now - lastAlarmTime < 1400) return; // Throttle 1.4s
  lastAlarmTime = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  const gainLevel = getEffectiveVolume(0.38, force);
  if (gainLevel <= 0) return;

  const t0 = ctx.currentTime;

  // Deux paires d'impulsions d'urgence
  const pulses = [
    { freq: 880, start: 0.00, end: 0.11 },
    { freq: 660, start: 0.12, end: 0.23 },
    { freq: 880, start: 0.30, end: 0.41 },
    { freq: 660, start: 0.42, end: 0.58 },
  ];

  pulses.forEach((p) => {
    const startTime = t0 + p.start;
    const endTime = t0 + p.end;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(p.freq, startTime);

    // Filtre passe-bas à 2400Hz pour adoucir les harmoniques agressives du sawtooth
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.008);
    gain.gain.setValueAtTime(gainLevel, endTime - 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(endTime + 0.01);

    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  });
}

/**
 * 4. CLIC DISCRET DE JOGGING (Manual Jog Step)
 * Clic tactile court à glissando rapide (1600Hz ➔ 700Hz en 22ms).
 * Confirme immédiatement à l'oreille chaque impulsion de pas sans fatiguer l'opérateur.
 */
export function playJogClick(force = false): void {
  if (!force && (!currentSettings.enabled || !currentSettings.jogClick)) return;

  const now = performance.now();
  if (!force && now - lastJogTime < 45) return; // Anti-flood 45ms
  lastJogTime = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  const gainLevel = getEffectiveVolume(0.18, force);
  if (gainLevel <= 0) return;

  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1600, t0);
  osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.022);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(gainLevel, t0 + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.024);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t0 + 0.026);

  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
