import { useState, useEffect, useCallback, useRef } from 'react';

export interface AppPreferences {
  // Machine & Fins de Course (Homing)
  useHoming: boolean; // false = Sans fins de course (Référence 0;0;0 manuelle), true = Avec fins de course physiques (Cycle Homing $H)

  // 3D & Plateau / Grille
  gridZOffset: number; // Hauteur Z de la grille par rapport au zéro machine (mm, ex: 0, -15, -50, -80)
  customBedWidth: number; // Largeur X affichée de la table (mm)
  customBedLength: number; // Longueur Y affichée de la table (mm)
  useCustomBedDimensions: boolean; // Si true, utilise customBedWidth/Length au lieu des paramètres GRBL $130/$131
  gridMajorStep: number; // Pas de la grille principale en mm (ex: 50 ou 100)

  // Interface & Échelle visuelle (Zoom)
  uiScale: number; // Échelle globale de l'interface (ex: 0.9, 1.0, 1.1, 1.25, 1.4)
  largeDroFont: boolean; // Mode très grands chiffres pour le DRO (lisibilité à 2 mètres)

  // Sécurité d'usinage & Garde-fous
  safeRetractZBeforeOrigin: boolean; // Montée préalable en Z avant tout retour origine XY
  safeRetractZHeight: number; // Hauteur de sécurité Z (mm, défaut 10.0)
  confirmZeroAll: boolean; // Demander confirmation avant d'écraser le zéro pièce (XYZ=0)
  rapidPositioningSpeed: number; // Vitesse d'avance pour les déplacements rapides de cadrage (mm/min, défaut 1800)

  // Périphériques & Manette Gamepad
  keyboardShortcutsEnabled: boolean; // Raccourcis clavier d'atelier
  gamepadDeadzone: number; // Zone morte joystick manette (défaut 0.15 = 15%)
  gamepadMaxSpeed: number; // Vitesse max au joystick (mm/min, défaut 2000)
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  useHoming: false,
  gridZOffset: 0.0,
  customBedWidth: 300,
  customBedLength: 300,
  useCustomBedDimensions: false,
  gridMajorStep: 50,

  uiScale: 1.0,
  largeDroFont: false,

  safeRetractZBeforeOrigin: true,
  safeRetractZHeight: 10.0,
  confirmZeroAll: false,
  rapidPositioningSpeed: 1800,

  keyboardShortcutsEnabled: true,
  gamepadDeadzone: 0.15,
  gamepadMaxSpeed: 2000,
};

const STORAGE_KEY = 'smartcnc_app_preferences_v1';
export const MIN_UI_SCALE = 0.75;
export const MAX_UI_SCALE = 1.6;
const clampUiScale = (scale: number) => Number.isFinite(scale)
  ? Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, scale))
  : DEFAULT_APP_PREFERENCES.uiScale;

/**
 * Charge les préférences utilisateur depuis le localStorage
 */
export function loadAppPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      useHoming: typeof parsed.useHoming === 'boolean' ? parsed.useHoming : DEFAULT_APP_PREFERENCES.useHoming,
      gridZOffset: typeof parsed.gridZOffset === 'number' ? parsed.gridZOffset : DEFAULT_APP_PREFERENCES.gridZOffset,
      customBedWidth: typeof parsed.customBedWidth === 'number' ? parsed.customBedWidth : DEFAULT_APP_PREFERENCES.customBedWidth,
      customBedLength: typeof parsed.customBedLength === 'number' ? parsed.customBedLength : DEFAULT_APP_PREFERENCES.customBedLength,
      useCustomBedDimensions: typeof parsed.useCustomBedDimensions === 'boolean' ? parsed.useCustomBedDimensions : DEFAULT_APP_PREFERENCES.useCustomBedDimensions,
      gridMajorStep: typeof parsed.gridMajorStep === 'number' ? parsed.gridMajorStep : DEFAULT_APP_PREFERENCES.gridMajorStep,

      uiScale: clampUiScale(parsed.uiScale),
      largeDroFont: typeof parsed.largeDroFont === 'boolean' ? parsed.largeDroFont : DEFAULT_APP_PREFERENCES.largeDroFont,

      safeRetractZBeforeOrigin: typeof parsed.safeRetractZBeforeOrigin === 'boolean' ? parsed.safeRetractZBeforeOrigin : DEFAULT_APP_PREFERENCES.safeRetractZBeforeOrigin,
      safeRetractZHeight: typeof parsed.safeRetractZHeight === 'number' ? parsed.safeRetractZHeight : DEFAULT_APP_PREFERENCES.safeRetractZHeight,
      confirmZeroAll: typeof parsed.confirmZeroAll === 'boolean' ? parsed.confirmZeroAll : DEFAULT_APP_PREFERENCES.confirmZeroAll,
      rapidPositioningSpeed: typeof parsed.rapidPositioningSpeed === 'number' ? parsed.rapidPositioningSpeed : DEFAULT_APP_PREFERENCES.rapidPositioningSpeed,

      keyboardShortcutsEnabled: typeof parsed.keyboardShortcutsEnabled === 'boolean' ? parsed.keyboardShortcutsEnabled : DEFAULT_APP_PREFERENCES.keyboardShortcutsEnabled,
      gamepadDeadzone: typeof parsed.gamepadDeadzone === 'number' ? parsed.gamepadDeadzone : DEFAULT_APP_PREFERENCES.gamepadDeadzone,
      gamepadMaxSpeed: typeof parsed.gamepadMaxSpeed === 'number' ? parsed.gamepadMaxSpeed : DEFAULT_APP_PREFERENCES.gamepadMaxSpeed,
    };
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

/**
 * Sauvegarde les préférences utilisateur dans le localStorage et notifie les composants
 */
export function saveAppPreferences(prefs: AppPreferences): void {
  const next = { ...prefs, uiScale: clampUiScale(prefs.uiScale) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Erreur sauvegarde préférences SmartCNC', err);
  }
  applyUiScale(next.uiScale);
  window.dispatchEvent(new CustomEvent('smartcnc:preferences-changed', { detail: next }));
}

/**
 * Applique le facteur d'échelle / zoom sur l'interface du navigateur
 */
export function applyUiScale(scale: number): void {
  document.documentElement.style.setProperty('zoom', String(clampUiScale(scale)));
}

/**
 * Hook React pour utiliser et synchroniser les préférences SmartCNC dans n'importe quel composant
 */
export function useAppPreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadAppPreferences());
  const latest = useRef(preferences);

  useEffect(() => {
    // Applique l'échelle au premier montage
    applyUiScale(latest.current.uiScale);

    const handleUpdate = (e: Event) => {
      latest.current = (e as CustomEvent<AppPreferences>).detail ?? loadAppPreferences();
      setPreferences(latest.current);
    };

    window.addEventListener('smartcnc:preferences-changed', handleUpdate);
    return () => {
      window.removeEventListener('smartcnc:preferences-changed', handleUpdate);
    };
  }, []);

  const updatePreferences = useCallback((changes: Partial<AppPreferences>) => {
    saveAppPreferences({ ...latest.current, ...changes });
  }, []);

  const resetPreferences = useCallback(() => {
    saveAppPreferences(DEFAULT_APP_PREFERENCES);
  }, []);

  return {
    preferences,
    updatePreferences,
    resetPreferences,
  };
}
