import { useState, useEffect, useCallback } from 'react';

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

      uiScale: typeof parsed.uiScale === 'number' ? parsed.uiScale : DEFAULT_APP_PREFERENCES.uiScale,
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    // Applique l'échelle d'interface globale (zoom)
    applyUiScale(prefs.uiScale);
    window.dispatchEvent(new CustomEvent('smartcnc:preferences-changed', { detail: prefs }));
  } catch (err) {
    console.error('Erreur sauvegarde préférences SmartCNC', err);
  }
}

/**
 * Applique le facteur d'échelle / zoom sur l'interface du navigateur
 */
export function applyUiScale(scale: number): void {
  const clamped = Math.max(0.75, Math.min(1.6, scale || 1.0));
  try {
    // Zoom CSS moderne universel (Chromium, Edge, Safari)
    (document.documentElement.style as any).zoom = String(clamped);
  } catch {
    // fallback
  }
}

/**
 * Hook React pour utiliser et synchroniser les préférences SmartCNC dans n'importe quel composant
 */
export function useAppPreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadAppPreferences());

  useEffect(() => {
    // Applique l'échelle au premier montage
    applyUiScale(preferences.uiScale);

    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<AppPreferences>;
      if (customEvent.detail) {
        setPreferences(customEvent.detail);
      } else {
        setPreferences(loadAppPreferences());
      }
    };

    window.addEventListener('smartcnc:preferences-changed', handleUpdate);
    return () => {
      window.removeEventListener('smartcnc:preferences-changed', handleUpdate);
    };
  }, []);

  const updatePreferences = useCallback((changes: Partial<AppPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...changes };
      saveAppPreferences(next);
      return next;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    saveAppPreferences(DEFAULT_APP_PREFERENCES);
    setPreferences(DEFAULT_APP_PREFERENCES);
  }, []);

  return {
    preferences,
    updatePreferences,
    resetPreferences,
  };
}
