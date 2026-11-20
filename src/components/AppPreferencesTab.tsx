import React from 'react';
import {
  Layers,
  ZoomIn,
  LayoutGrid,
  ShieldAlert,
  Volume2,
  VolumeX,
  Gamepad2,
  Keyboard,
  Sun,
  Moon,
  RotateCcw,
  Check,
  Eye,
  Play,
  Home,
  LocateFixed,
} from 'lucide-react';
import { MAX_UI_SCALE, MIN_UI_SCALE, useAppPreferences } from '../utils/appPreferences';
import {
  useAudioAlertSettings,
  playProbeContactBeep,
  playJobCompleteMelody,
  playAlarmAlert,
  playJogClick,
} from '../utils/audioAlerts';

export type AppPreferencesSection = 'all' | 'interface' | 'operation' | 'sound' | 'control';

export interface AppPreferencesTabProps {
  onResetLayout?: () => void;
  section?: AppPreferencesSection;
}

export const AppPreferencesTab: React.FC<AppPreferencesTabProps> = ({
  onResetLayout,
  section = 'all',
}) => {
  const { preferences, updatePreferences, resetPreferences } = useAppPreferences();
  const { settings: audioSettings, updateSettings: updateAudioSettings } = useAudioAlertSettings();

  const showInterface = section === 'all' || section === 'interface';
  const showOperation = section === 'all' || section === 'operation';
  const showSound = section === 'all' || section === 'sound';
  const showControl = section === 'all' || section === 'control';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#0b0f17] text-slate-100">
      {/* THÈME D'AFFICHAGE : MODE NUIT / MODE JOUR */}
      {showInterface && (
        <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-2 text-sky-300 font-bold text-sm sm:text-base">
            {preferences.theme === 'light' ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-sky-400" />
            )}
            <h3>Thème d'affichage (Mode Nuit / Mode Jour)</h3>
          </div>
          <p className="text-xs text-slate-300 mb-4 leading-relaxed">
            Basculer entre l’interface sombre d’atelier et le mode jour haute lisibilité pour les espaces fortement éclairés.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={() => updatePreferences({ theme: 'dark' })}
              aria-pressed={preferences.theme === 'dark'}
              className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                preferences.theme === 'dark'
                  ? 'bg-sky-500/15 border-sky-400 shadow-sm'
                  : 'bg-[#0f1520] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-sky-400" />
                  <span className="text-xs sm:text-sm font-bold text-slate-50">
                    Mode Nuit (Atelier sombre)
                  </span>
                </div>
                {preferences.theme === 'dark' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-400 text-slate-950">
                    Actif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Thème sombre Cockpit réduisant la fatigue visuelle devant la machine en éclairage modéré.
              </p>
            </button>

            <button
              type="button"
              onClick={() => updatePreferences({ theme: 'light' })}
              aria-pressed={preferences.theme === 'light'}
              className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                preferences.theme === 'light'
                  ? 'bg-sky-500/15 border-sky-400 shadow-sm'
                  : 'bg-[#0f1520] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="text-xs sm:text-sm font-bold text-slate-50">
                    Mode Jour (Atelier lumineux)
                  </span>
                </div>
                {preferences.theme === 'light' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-400 text-slate-950">
                    Actif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Interface claire et contrastée, optimale sous éclairage d’atelier intense ou en plein jour.
              </p>
            </button>
          </div>
        </section>
      )}

      {/* TAILLE DE L'INTERFACE & ZOOM ATELIER */}
      {showInterface && (
      <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3 text-sky-300 font-bold text-sm sm:text-base">
          <ZoomIn className="w-5 h-5 text-sky-400" />
          <h3>Zoom de l’interface</h3>
        </div>

        <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5 mb-3">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="app-ui-scale" className="text-xs font-semibold text-slate-100">
              Niveau de zoom
            </label>
            <span className="font-mono text-sm font-bold text-sky-300 bg-sky-500/15 px-2.5 py-0.5 rounded-md border border-sky-500/40">
              {Math.round(preferences.uiScale * 100)} %
            </span>
          </div>

          <div className="flex items-center gap-4 mb-3">
            <span className="text-[11px] font-mono text-slate-300">{MIN_UI_SCALE * 100} %</span>
            <input
              id="app-ui-scale"
              type="range"
              min={MIN_UI_SCALE}
              max={MAX_UI_SCALE}
              step={0.05}
              value={preferences.uiScale}
              onChange={(e) => updatePreferences({ uiScale: parseFloat(e.target.value) || 1.0 })}
              aria-valuetext={`${Math.round(preferences.uiScale * 100)} %`}
              className="min-w-0 flex-1 h-2 bg-[#090d14] rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
            <span className="text-[11px] font-mono text-slate-300">{MAX_UI_SCALE * 100} %</span>
          </div>

          <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr))]">
            {[
              { label: '90% Compact', val: 0.9 },
              { label: '100% Standard', val: 1.0 },
              { label: '110% Confort', val: 1.1 },
              { label: '125% Atelier (1.5m)', val: 1.25 },
              { label: '140% Éloigné (2m+)', val: 1.4 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => updatePreferences({ uiScale: preset.val })}
                className={`min-h-9 py-1.5 px-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  Math.abs(preferences.uiScale - preset.val) < 0.02
                    ? 'bg-sky-400 text-slate-950 border-sky-300 font-bold'
                    : 'bg-[#1b2436] hover:bg-[#243047] text-slate-100 border-slate-700/80'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Grand DRO */}
        <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-sky-400" />
              <label className="text-xs font-semibold text-slate-100">
                Mode Grand DRO (Chiffres X, Y, Z extra-larges)
              </label>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Agrandit les chiffres du panneau Coordonnées.
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.largeDroFont}
            onChange={(e) => updatePreferences({ largeDroFont: e.target.checked })}
            className="w-5 h-5 accent-sky-400 rounded cursor-pointer"
          />
        </div>
      </section>
      )}

      {/* 0. CONFIGURATION MACHINE & FINS DE COURSE (HOMING) */}
      {showOperation && (
      <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-2 text-sky-300 font-bold text-sm sm:text-base">
          <Home className="w-5 h-5 text-sky-400" />
          <h3>Mode de Fonctionnement Machine & Fins de Course (Homing)</h3>
        </div>
        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
          Choisissez comment vous référencez votre CNC. Si vous n'avez pas de contacteurs de fin de course branchés sur votre CNC Shield,
          le mode sans fin de course évite les fausses manœuvres et masque le cycle $H (qui bloquerait GRBL en alarme).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Option 1 : Sans fin de course */}
          <div
            onClick={() => updatePreferences({ useHoming: false })}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
              !preferences.useHoming
                ? 'bg-sky-500/15 border-sky-400 shadow-sm'
                : 'bg-[#0f1520] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <LocateFixed className="w-4 h-4 text-amber-400" />
                  <span className="text-xs sm:text-sm font-bold text-slate-50">
                    Sans fin de course (Actuel)
                  </span>
                </div>
                {!preferences.useHoming && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-400 text-slate-950">
                    Actif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Aucun capteur physique nécessaire. Le bouton <strong className="text-amber-300">« Mettre Machine à 0;0;0 ici »</strong> est mis en avant pour définir manuellement le zéro machine où vous le souhaitez.
              </p>
            </div>
            <div className="text-[11px] font-semibold text-slate-200 bg-[#090d14] p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              <span>Bouton Homing ($H) masqué (Zéro risque d'alarme GRBL)</span>
            </div>
          </div>

          {/* Option 2 : Avec fins de course */}
          <div
            onClick={() => updatePreferences({ useHoming: true })}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
              preferences.useHoming
                ? 'bg-sky-500/15 border-sky-400 shadow-sm'
                : 'bg-[#0f1520] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-sky-400" />
                  <span className="text-xs sm:text-sm font-bold text-slate-50">
                    Avec fins de course physiques (Homing $H)
                  </span>
                </div>
                {preferences.useHoming && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-400 text-slate-950">
                    Actif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Pour CNC avec micro-switchs ou capteurs branchés sur le CNC Shield (broches X+, Y+, Z+).
                Ajoute le bouton principal <strong className="text-sky-300">« Lancer Cycle Homing ($H) »</strong> sur le panneau de pilotage et la télécommande mobile.
              </p>
            </div>
            <div className="text-[11px] font-semibold text-sky-300 bg-[#090d14] p-2.5 rounded-lg border border-sky-500/30 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
              <span>Bouton Homing ($H) actif et bien visible</span>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* 1. VUE 3D & HAUTEUR DE LA GRILLE / TABLE MARTYR */}
      {showInterface && (
      <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3 text-sky-300 font-bold text-sm sm:text-base">
          <Layers className="w-5 h-5 text-sky-400" />
          <h3>Vue 3D & Hauteur de la Grille par rapport au Zéro Machine</h3>
        </div>
        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
          Permet d'ajuster l'élévation ou la profondeur de la table d'usinage et de la grille dans la vue 3D.
          Si votre table martyr ou votre plateau est situé en dessous du Zéro Machine (ex: après un Homing ou un repère en haut de course),
          vous pouvez caler la grille exactement au niveau physique de votre martyr.
        </p>

        {/* Réglage Hauteur Z de la grille */}
        <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="text-xs font-semibold text-slate-100">
              Hauteur Z de la grille / plateau (Offset Z table martyr) :
            </label>
            <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-sky-300 bg-sky-500/15 px-2.5 py-1 rounded-md border border-sky-500/40">
              <span>{preferences.gridZOffset > 0 ? `+${preferences.gridZOffset.toFixed(1)}` : preferences.gridZOffset.toFixed(1)}</span>
              <span className="text-xs text-slate-300 font-sans">mm</span>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-3">
            <span className="text-[11px] font-mono text-slate-300">-120 mm</span>
            <input
              type="range"
              min={-120}
              max={50}
              step={0.5}
              value={preferences.gridZOffset}
              onChange={(e) => updatePreferences({ gridZOffset: parseFloat(e.target.value) || 0 })}
              className="flex-1 h-2 bg-[#090d14] rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
            <span className="text-[11px] font-mono text-slate-300">+50 mm</span>
          </div>

          {/* Boutons presets rapides */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-medium text-slate-300 mr-1">Raccourcis :</span>
            {[
              { label: '0.0 mm (Zéro MPos)', val: 0.0 },
              { label: '-10.0 mm (Martyr fin)', val: -10.0 },
              { label: '-15.0 mm (Martyr 15mm)', val: -15.0 },
              { label: '-19.0 mm (MDF 19mm)', val: -19.0 },
              { label: '-50.0 mm (Mi-course Z)', val: -50.0 },
              { label: '-80.0 mm (Fond de course)', val: -80.0 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => updatePreferences({ gridZOffset: p.val })}
                className={`min-h-8 px-2.5 py-1 text-xs font-mono font-semibold rounded-lg border transition-colors cursor-pointer ${
                  Math.abs(preferences.gridZOffset - p.val) < 0.1
                    ? 'bg-sky-400 text-slate-950 border-sky-300 font-bold'
                    : 'bg-[#1b2436] hover:bg-[#243047] text-slate-100 border-slate-700/80'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dimensions du plateau personnalisé & Grille */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-100">
                Dimensions personnalisées du plateau 3D
              </label>
              <input
                type="checkbox"
                checked={preferences.useCustomBedDimensions}
                onChange={(e) => updatePreferences({ useCustomBedDimensions: e.target.checked })}
                className="w-4 h-4 accent-sky-400 rounded cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-300 mb-2.5">
              Par défaut, la vue 3D utilise les courses GRBL $130 (X) et $131 (Y). Activez ceci pour forcer des dimensions manuelles.
            </p>
            {preferences.useCustomBedDimensions && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-slate-300 font-medium">Largeur X (mm)</span>
                  <input
                    type="number"
                    min={50}
                    max={2000}
                    value={preferences.customBedWidth}
                    onChange={(e) => updatePreferences({ customBedWidth: Math.max(50, parseInt(e.target.value) || 300) })}
                    className="w-full min-h-9 px-2.5 py-1 text-xs font-mono border border-slate-700 rounded-lg bg-[#090d14] text-slate-100"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-300 font-medium">Longueur Y (mm)</span>
                  <input
                    type="number"
                    min={50}
                    max={2000}
                    value={preferences.customBedLength}
                    onChange={(e) => updatePreferences({ customBedLength: Math.max(50, parseInt(e.target.value) || 300) })}
                    className="w-full min-h-9 px-2.5 py-1 text-xs font-mono border border-slate-700 rounded-lg bg-[#090d14] text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5">
            <label className="text-xs font-semibold text-slate-100 block mb-1">
              Espacement du quadrillage principal
            </label>
            <p className="text-[11px] text-slate-300 mb-2">
              Définit la fréquence des graduations majeures avec cotes chiffrées sur le plateau.
            </p>
            <div className="flex gap-2">
              {[
                { label: '50 mm (Recommandé)', val: 50 },
                { label: '100 mm (Grands plateaux)', val: 100 },
                { label: '25 mm (Haute précision)', val: 25 },
              ].map((step) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => updatePreferences({ gridMajorStep: step.val })}
                  className={`flex-1 min-h-9 py-1.5 px-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    preferences.gridMajorStep === step.val
                      ? 'bg-sky-500/20 border-sky-400 text-sky-200 font-bold'
                      : 'bg-[#1b2436] hover:bg-[#243047] text-slate-100 border-slate-700/80'
                  }`}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* 3. DISPOSITION & GESTION DES FENÊTRES */}
      {showInterface && (
      <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3 text-sky-300 font-bold text-sm sm:text-base">
          <LayoutGrid className="w-5 h-5 text-sky-400" />
          <h3>Disposition & Dimensions des Fenêtres</h3>
        </div>
        <p className="text-xs text-slate-300 mb-3">
          Dans l’atelier CNC, ouvrez Disposition pour déplacer ou masquer les panneaux. Utilisez les séparateurs pour ajuster leur taille.
        </p>

        <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-slate-100 block">
              Réinitialiser la disposition d'origine
            </span>
            <span className="text-[11px] text-slate-300">
              Restaure la position, la visibilité et les dimensions des panneaux CNC.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onResetLayout) onResetLayout();
            }}
            className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            <span>Rétablir la disposition par défaut</span>
          </button>
        </div>
      </section>
      )}

      {/* 4. SÉCURITÉ MACHINE & GARDE-FOUS (Recommandations Audit Ergonomie) */}
      {showOperation && (
      <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3 text-sky-300 font-bold text-sm sm:text-base">
          <ShieldAlert className="w-5 h-5 text-sky-400" />
          <h3>Sécurité d'Usinage & Garde-fous Anti-Collision</h3>
        </div>
        <div className="space-y-3">
          {/* Dégagement Z avant X0 Y0 */}
          <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5 flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <label className="text-xs font-semibold text-slate-100">
                  Dégagement Z automatique avant tout retour origine pièce XY (Anti-crash brides)
                </label>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                Recommandation ergonomique n°1 : lors d'un clic sur « Aller à Origine Pièce XY », la machine élève obligatoirement l'axe Z avant tout déplacement horizontal pour éviter de heurter des brides de bridage.
              </p>
              {preferences.safeRetractZBeforeOrigin && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-slate-200 font-medium">Hauteur de dégagement Z :</span>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    step={1}
                    value={preferences.safeRetractZHeight}
                    onChange={(e) => updatePreferences({ safeRetractZHeight: Math.max(2, parseFloat(e.target.value) || 10) })}
                    className="w-20 min-h-8 px-2 py-0.5 text-xs font-mono font-bold border border-slate-700 rounded-lg bg-[#090d14] text-slate-100"
                  />
                  <span className="text-xs text-slate-300">mm au-dessus de l'origine</span>
                </div>
              )}
            </div>
            <input
              type="checkbox"
              checked={preferences.safeRetractZBeforeOrigin}
              onChange={(e) => updatePreferences({ safeRetractZBeforeOrigin: e.target.checked })}
              className="w-5 h-5 accent-sky-400 rounded cursor-pointer mt-0.5"
            />
          </div>

          {/* Confirmation Zéro Pièce */}
          <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-100 block">
                Demander confirmation avant d'écraser le zéro pièce (XYZ = 0)
              </label>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Affiche une demande de confirmation de 3 secondes pour éviter d'écraser son origine par inadvertance avec un doigt sale ou ganté.
              </p>
            </div>
            <input
              type="checkbox"
              checked={preferences.confirmZeroAll}
              onChange={(e) => updatePreferences({ confirmZeroAll: e.target.checked })}
              className="w-5 h-5 accent-sky-400 rounded cursor-pointer"
            />
          </div>
        </div>
      </section>
      )}

      {/* 5. SIGNAUX SONORES D'ATELIER */}
      {showSound && (
      <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2.5 mb-3">
          <div className="flex items-center gap-2.5 text-sky-300 font-bold text-sm sm:text-base">
            <Volume2 className="w-5 h-5 text-sky-400" />
            <h3>Signaux Sonores & Alertes Audio d'Atelier (Web Audio API)</h3>
          </div>
          <button
            type="button"
            onClick={() => updateAudioSettings({ enabled: !audioSettings.enabled })}
            className={`inline-flex items-center gap-1.5 min-h-8 px-3 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              audioSettings.enabled
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                : 'bg-rose-500/20 text-rose-200 border-rose-400/50'
            }`}
          >
            {audioSettings.enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{audioSettings.enabled ? 'Sons Activés' : 'Muet'}</span>
          </button>
        </div>

        <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5 mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-100">Volume sonore général :</label>
            <span className="font-mono text-sm font-bold text-slate-100">
              {Math.round(audioSettings.masterVolume * 100)} %
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audioSettings.masterVolume}
            onChange={(e) => updateAudioSettings({ masterVolume: parseFloat(e.target.value) || 0 })}
            className="w-full h-2 bg-[#090d14] rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            {
              id: 'probeContact',
              name: 'Bip Contact Sonde (Touch Plate)',
              desc: 'Bip aigu (1046 Hz) dès que la pince croco touche la cale.',
              checked: audioSettings.probeContact,
              test: () => playProbeContactBeep(true),
            },
            {
              id: 'jobComplete',
              name: 'Carillon Fin d\'Usinage',
              desc: 'Mélodie 3 notes dès que le G-Code atteint 100%.',
              checked: audioSettings.jobComplete,
              test: () => playJobCompleteMelody(true),
            },
            {
              id: 'alarmAlert',
              name: 'Alarme & Fins de Course',
              desc: 'Tonalité d\'alerte bitonale si la machine passe en alarme.',
              checked: audioSettings.alarmAlert,
              test: () => playAlarmAlert(true),
            },
            {
              id: 'jogClick',
              name: 'Micro-clic de Jogging',
              desc: 'Clic haptique à chaque déplacement manuel au pas.',
              checked: audioSettings.jogClick,
              test: () => playJogClick(true),
            },
          ].map((item) => (
            <div key={item.id} className="bg-[#0f1520] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-100 block truncate">{item.name}</span>
                <span className="text-[11px] text-slate-300 block truncate">{item.desc}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={item.test}
                  className="min-h-8 px-2.5 py-1 text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Play className="w-3 h-3 text-sky-400 fill-sky-400" />
                  <span>Test</span>
                </button>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => updateAudioSettings({ [item.id]: e.target.checked } as any)}
                  className="w-4 h-4 accent-sky-400 rounded cursor-pointer"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* 6. RACCOURCIS CLAVIER & MANETTE GAMEPAD */}
      {showControl && (
      <>
      <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3 text-sky-300 font-bold text-sm sm:text-base">
          <Keyboard className="w-5 h-5 text-sky-400" />
          <h3>Pilotage au Clavier</h3>
        </div>
        <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-4">
          <div>
            <label htmlFor="pref-keyboard-shortcuts" className="text-xs font-semibold text-slate-100 block">
              Activer les raccourcis clavier de déplacement (Jogging XYZ)
            </label>
            <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
              Flèches / Pavé numérique pour XY, PageUp/PageDown (+/-) pour Z, <code className="font-mono text-sky-300">[</code> / <code className="font-mono text-sky-300">]</code> pour changer de pas, Espace pour Pause et Échap pour Stop Jog.
            </p>
          </div>
          <input
            id="pref-keyboard-shortcuts"
            type="checkbox"
            checked={preferences.keyboardShortcutsEnabled}
            onChange={(e) => updatePreferences({ keyboardShortcutsEnabled: e.target.checked })}
            className="w-5 h-5 accent-sky-400 rounded cursor-pointer shrink-0"
          />
        </div>
      </section>

      <section className="bg-[#141b27] border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2.5 mb-3 text-sky-300 font-bold text-sm sm:text-base">
          <Gamepad2 className="w-5 h-5 text-sky-400" />
          <h3>Contrôles Manette Gamepad & Clavier</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-100">
                Zone morte du joystick (Deadzone)
              </label>
              <span className="font-mono text-xs font-bold text-sky-300">
                {Math.round(preferences.gamepadDeadzone * 100)} %
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.35}
              step={0.01}
              value={preferences.gamepadDeadzone}
              onChange={(e) => updatePreferences({ gamepadDeadzone: parseFloat(e.target.value) || 0.15 })}
              className="w-full h-2 bg-[#090d14] rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
            <p className="text-[11px] text-slate-300 mt-1.5">
              Empêche les micro-déplacements parasites si le joystick analogique a du jeu mécanique.
            </p>
          </div>

          <div className="bg-[#0f1520] border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-100">
                Vitesse max Jogging Joystick
              </label>
              <span className="font-mono text-xs font-bold text-sky-300">
                {preferences.gamepadMaxSpeed} mm/min
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={preferences.gamepadMaxSpeed}
              onChange={(e) => updatePreferences({ gamepadMaxSpeed: parseInt(e.target.value) || 2000 })}
              className="w-full h-2 bg-[#090d14] rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
            <p className="text-[11px] text-slate-300 mt-1.5">
              Vitesse de consigne transmise au mode continu proportionnel ($J=G91...).
            </p>
          </div>
        </div>
      </section>
      </>
      )}

      {/* BOUTON GLOBAL RÉINITIALISER PRÉFÉRENCES */}
      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={resetPreferences}
          className="inline-flex items-center gap-1.5 min-h-10 px-4 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:text-white bg-[#1b2436] hover:bg-[#243047] border border-slate-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
          <span>Rétablir toutes les préférences par défaut</span>
        </button>
      </div>
    </div>
  );
};
