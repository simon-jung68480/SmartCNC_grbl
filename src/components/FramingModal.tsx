import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Maximize2,
  X,
  Play,
  Square,
  RotateCw,
  Target,
  Crosshair,
  Shield,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  ArrowUpLeft,
  Move,
  Zap,
  Info,
  Clock,
  Sliders,
  Check,
} from 'lucide-react';
import { Coordinates, GrblStatus } from '../types/cnc';

export interface FramingSettings {
  safeZ: number;
  feedRate: number;
  margin: number;
  mode: 'once' | 'continuous';
  useLaserPointer: boolean;
  laserPowerS: number;
}

const STORAGE_KEY = 'smartcnc_framing_settings_v1';

const DEFAULT_SETTINGS: FramingSettings = {
  safeZ: 10.0,
  feedRate: 1500,
  margin: 5.0,
  mode: 'once',
  useLaserPointer: false,
  laserPowerS: 5,
};

export interface FramingModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: GrblStatus;
  bounds?: {
    min: Coordinates;
    max: Coordinates;
    size: Coordinates;
  };
  fileName?: string;
  onSendCommand: (command: string) => void;
  onSendRealtime?: (byteOrChar: number | string) => void;
  onZeroWorkAxis?: (axis: 'X' | 'Y' | 'Z' | 'XY' | 'ALL') => void;
}

type CornerId = 'bottom-left' | 'bottom-right' | 'top-right' | 'top-left' | 'center';

export const FramingModal: React.FC<FramingModalProps> = ({
  isOpen,
  onClose,
  status,
  bounds,
  fileName,
  onSendCommand,
  onSendRealtime,
  onZeroWorkAxis,
}) => {
  // --- Persistent Settings in localStorage ---
  const [settings, setSettings] = useState<FramingSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to parse framing settings from localStorage', e);
    }
    return DEFAULT_SETTINGS;
  });

  const updateSettings = useCallback((patch: Partial<FramingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save framing settings to localStorage', e);
      }
      return next;
    });
  }, []);

  // Mode manuel de dimensions si aucun fichier ou si l'utilisateur veut tester un brut spécifique
  const [customStock, setCustomStock] = useState({
    enabled: !bounds || (bounds.size.x === 0 && bounds.size.y === 0),
    width: 100,
    height: 80,
    depth: 10,
    originX: 0,
    originY: 0,
  });

  // État d'exécution du cadrage
  const [isFramingActive, setIsFramingActive] = useState<boolean>(false);
  const [cycleCounter, setCycleCounter] = useState<number>(0);
  const [lastActionFeedback, setLastActionFeedback] = useState<string | null>(null);

  // Refs pour la gestion de boucle continue réactive
  const continuousRunningRef = useRef<boolean>(false);
  const wasRunningRef = useRef<boolean>(false);

  // Synchronise continuousRunningRef
  useEffect(() => {
    continuousRunningRef.current = isFramingActive && settings.mode === 'continuous';
  }, [isFramingActive, settings.mode]);

  // Nettoyage à la fermeture ou au démontage
  useEffect(() => {
    return () => {
      if (continuousRunningRef.current) {
        continuousRunningRef.current = false;
        if (settings.useLaserPointer) {
          onSendCommand('M5');
        }
      }
    };
  }, [onSendCommand, settings.useLaserPointer]);

  // Calcul des coordonnées de base de la boîte englobante
  const baseBounds = useMemo(() => {
    if (customStock.enabled || !bounds || (bounds.size.x === 0 && bounds.size.y === 0)) {
      const minX = customStock.originX;
      const maxX = customStock.originX + customStock.width;
      const minY = customStock.originY;
      const maxY = customStock.originY + customStock.height;
      const minZ = -customStock.depth;
      const maxZ = 0;
      return {
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ,
        width: Math.abs(maxX - minX),
        length: Math.abs(maxY - minY),
        height: Math.abs(maxZ - minZ),
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };
    }

    const minX = Math.min(bounds.min.x, bounds.max.x);
    const maxX = Math.max(bounds.min.x, bounds.max.x);
    const minY = Math.min(bounds.min.y, bounds.max.y);
    const maxY = Math.max(bounds.min.y, bounds.max.y);
    const minZ = Math.min(bounds.min.z, bounds.max.z);
    const maxZ = Math.max(bounds.min.z, bounds.max.z);

    return {
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
      width: Math.max(0.1, maxX - minX),
      length: Math.max(0.1, maxY - minY),
      height: Math.max(0.1, maxZ - minZ),
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }, [bounds, customStock]);

  // Calcul du rectangle cadré effectif (avec la marge de sécurité brides)
  const framedBounds = useMemo(() => {
    const margin = Math.max(0, settings.margin);
    const minX = baseBounds.minX - margin;
    const maxX = baseBounds.maxX + margin;
    const minY = baseBounds.minY - margin;
    const maxY = baseBounds.maxY + margin;
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      length: maxY - minY,
      centerX: baseBounds.centerX,
      centerY: baseBounds.centerY,
    };
  }, [baseBounds, settings.margin]);

  // Points remarquables pour le cadrage
  const cornerPoints: Record<CornerId, { x: number; y: number; label: string; icon: React.ReactNode }> = {
    'bottom-left': {
      x: framedBounds.minX,
      y: framedBounds.minY,
      label: 'Bas-Gauche (Xmin, Ymin)',
      icon: <ArrowDownLeft className="w-4 h-4" />,
    },
    'bottom-right': {
      x: framedBounds.maxX,
      y: framedBounds.minY,
      label: 'Bas-Droit (Xmax, Ymin)',
      icon: <ArrowDownRight className="w-4 h-4" />,
    },
    'top-right': {
      x: framedBounds.maxX,
      y: framedBounds.maxY,
      label: 'Haut-Droit (Xmax, Ymax)',
      icon: <ArrowUpRight className="w-4 h-4" />,
    },
    'top-left': {
      x: framedBounds.minX,
      y: framedBounds.maxY,
      label: 'Haut-Gauche (Xmin, Ymax)',
      icon: <ArrowUpLeft className="w-4 h-4" />,
    },
    center: {
      x: framedBounds.centerX,
      y: framedBounds.centerY,
      label: 'Centre Pièce (Xcenter, Ycenter)',
      icon: <Target className="w-4 h-4" />,
    },
  };

  // Conditions de sécurité machine
  const isMachineConnected = status.connected;
  const isAlarm = status.state === 'Alarm';
  const isBusyJob = status.state === 'Run' || status.state === 'Hold' || status.state === 'Hold:0' || status.state === 'Hold:1';
  const canSendMove = isMachineConnected && !isAlarm && !isBusyJob;

  // Envoi d'un cycle de tracé de rectangle complet
  const executeFramingCycle = useCallback(() => {
    if (!isMachineConnected || isAlarm) return;

    const safeZ = settings.safeZ;
    const feed = Math.max(100, settings.feedRate);
    const { minX, maxX, minY, maxY } = framedBounds;

    const cmds: string[] = [
      'G21 G90', // Unités mm, absolu
      `G0 Z${safeZ.toFixed(3)}`, // LEVÉE Z DE SÉCURITÉ EN PREMIER !
    ];

    if (settings.useLaserPointer) {
      cmds.push(`M3 S${Math.max(1, settings.laserPowerS)}`); // Laser basse puissance
    }

    // Parcours rectangulaire dans le sens des aiguilles d'une montre
    cmds.push(`G0 X${minX.toFixed(3)} Y${minY.toFixed(3)}`);
    cmds.push(`G1 X${maxX.toFixed(3)} Y${minY.toFixed(3)} F${feed}`);
    cmds.push(`G1 X${maxX.toFixed(3)} Y${maxY.toFixed(3)} F${feed}`);
    cmds.push(`G1 X${minX.toFixed(3)} Y${maxY.toFixed(3)} F${feed}`);
    cmds.push(`G1 X${minX.toFixed(3)} Y${minY.toFixed(3)} F${feed}`);

    if (settings.mode === 'once' && settings.useLaserPointer) {
      cmds.push('M5');
    }

    onSendCommand(cmds.join('\n'));
    setLastActionFeedback('Tracé du rectangle envoyé à la machine.');
  }, [isMachineConnected, isAlarm, settings, framedBounds, onSendCommand]);

  // Démarrage du traçage
  const handleStartFraming = () => {
    if (!canSendMove) return;

    setIsFramingActive(true);
    setCycleCounter(1);
    continuousRunningRef.current = settings.mode === 'continuous';
    executeFramingCycle();
  };

  // Arrêt du cadrage
  const handleStopFraming = (immediate: boolean = false) => {
    continuousRunningRef.current = false;
    setIsFramingActive(false);

    if (immediate && onSendRealtime) {
      onSendRealtime('!'); // Feed hold immédiat
    }

    if (settings.useLaserPointer) {
      onSendCommand('M5');
    }

    setLastActionFeedback(immediate ? 'Arrêt d’urgence (Feed Hold) appliqué !' : 'Cadrage arrêté.');
  };

  // Suivi de l'état machine pour boucler en continu quand GRBL redevient Idle
  useEffect(() => {
    const isCurrentlyRunning = status.state === 'Run' || status.state === 'Jog';

    if (wasRunningRef.current && !isCurrentlyRunning && status.state === 'Idle') {
      // Machine vient de terminer un mouvement
      if (continuousRunningRef.current) {
        // Planifier le prochain tour après une brève pause de confort
        const timer = setTimeout(() => {
          if (continuousRunningRef.current) {
            setCycleCounter((c) => c + 1);
            executeFramingCycle();
          }
        }, 350);
        return () => clearTimeout(timer);
      } else if (isFramingActive) {
        setIsFramingActive(false);
        setLastActionFeedback('Tracé 1 cycle terminé avec succès.');
      }
    }

    wasRunningRef.current = isCurrentlyRunning;
  }, [status.state, isFramingActive, executeFramingCycle]);

  // Déplacement vers un point d'ancrage (coin ou centre)
  const handleMoveToPoint = (pointId: CornerId) => {
    if (!canSendMove) return;

    const point = cornerPoints[pointId];
    const safeZ = settings.safeZ;

    // Toujours lever Z avant de se déplacer en XY !
    const cmds = [
      'G21 G90',
      `G0 Z${safeZ.toFixed(3)}`, // Z de sécurité
      `G0 X${point.x.toFixed(3)} Y${point.y.toFixed(3)}`,
    ];

    onSendCommand(cmds.join('\n'));
    setLastActionFeedback(`Déplacement vers ${point.label} (Z sécurité: +${safeZ.toFixed(1)} mm)`);
  };

  // Utiliser la position actuelle WPos Z comme Z de sécurité
  const handleUseCurrentZ = () => {
    const curZ = Math.round(status.wpos.z * 10) / 10;
    updateSettings({ safeZ: curZ });
    setLastActionFeedback(`Z de sécurité défini sur Z actuel (+${curZ.toFixed(1)} mm)`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4">
      <div className="bg-white border border-slate-300 text-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* =====================================================================
            EN-TÊTE MODALE
        ===================================================================== */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-600">
              <Maximize2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Assistant de Cadrage & Bounding Box (Framing)
                </h2>
                {fileName && (
                  <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-200 text-slate-700">
                    {fileName}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Vérification du positionnement de la pièce et contrôle anti-collision avec les brides de serrage (clamps)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
            title="Fermer la fenêtre (Échap)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* =====================================================================
            BANNIÈRE DE STATUT MACHINE & SÉCURITÉ
        ===================================================================== */}
        <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-100/70 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            {!isMachineConnected ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-rose-50 text-rose-700 border border-rose-300">
                <ShieldAlert className="w-3.5 h-3.5" />
                CNC Déconnectée — Mouvements désactivés
              </span>
            ) : isAlarm ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-rose-50 text-rose-700 border border-rose-300">
                <ShieldAlert className="w-3.5 h-3.5" />
                Machine en ALARME ($X requis) — Déplacement interdit
              </span>
            ) : isBusyJob ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                Usinage en cours ({status.state}) — Cadrage suspendu
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Machine Prête ({status.state})
              </span>
            )}

            {isMachineConnected && (
              <span className="font-mono text-slate-600">
                WPos : X <b className="text-slate-800">{status.wpos.x.toFixed(2)}</b>, Y{' '}
                <b className="text-slate-800">{status.wpos.y.toFixed(2)}</b>, Z{' '}
                <b className="text-slate-800">{status.wpos.z.toFixed(2)}</b>
              </span>
            )}
          </div>

          {/* Règle d'or de sécurité */}
          <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-medium">
            <Shield className="w-3.5 h-3.5 text-sky-600" />
            <span>Sécurité active : levée Z à +{settings.safeZ.toFixed(1)} mm avant tout mouvement XY</span>
          </div>
        </div>

        {/* =====================================================================
            CORPS PRINCIPAL EN 2 COLONNES RESPONSIVES
        ===================================================================== */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* COLONNE GAUCHE (7/12) : Dimensions & Visualiseur 2D Interactif */}
          <div className="lg:col-span-7 space-y-4 flex flex-col">
            
            {/* Boîte des Dimensions Cotées */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Dimensions Boîte Englobante (Bounding Box)
                  </h3>
                  {settings.margin > 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Marge brides: +{settings.margin} mm
                    </span>
                  )}
                </div>

                {/* Option Brut Personnalisé */}
                <button
                  type="button"
                  onClick={() => setCustomStock((s) => ({ ...s, enabled: !s.enabled }))}
                  className="text-[11px] font-medium text-sky-600 hover:text-sky-700 underline"
                >
                  {customStock.enabled ? 'Utiliser G-Code' : 'Dimensions manuelles'}
                </button>
              </div>

              {/* Si mode manuel activé */}
              {customStock.enabled && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-amber-900 mb-0.5">Largeur X (mm)</label>
                    <input
                      type="number"
                      min="1"
                      step="5"
                      value={customStock.width}
                      onChange={(e) => setCustomStock((s) => ({ ...s, width: Math.max(1, parseFloat(e.target.value) || 1) }))}
                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-900 mb-0.5">Longueur Y (mm)</label>
                    <input
                      type="number"
                      min="1"
                      step="5"
                      value={customStock.height}
                      onChange={(e) => setCustomStock((s) => ({ ...s, height: Math.max(1, parseFloat(e.target.value) || 1) }))}
                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-900 mb-0.5">Épaisseur Z (mm)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="1"
                      value={customStock.depth}
                      onChange={(e) => setCustomStock((s) => ({ ...s, depth: Math.max(0.1, parseFloat(e.target.value) || 0.1) }))}
                      className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Cartouches d'axes X, Y, Z */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-600 mb-0.5">
                    Axe X (Largeur)
                  </span>
                  <div className="text-sm font-bold text-slate-800">
                    {baseBounds.width.toFixed(1)} <span className="text-[11px] font-normal text-slate-500">mm</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {baseBounds.minX.toFixed(1)} ➔ {baseBounds.maxX.toFixed(1)}
                  </div>
                  {settings.margin > 0 && (
                    <div className="text-[10px] font-bold text-amber-700 mt-1 border-t border-slate-100 pt-1">
                      Cadre: {framedBounds.width.toFixed(1)} mm
                    </div>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">
                    Axe Y (Longueur)
                  </span>
                  <div className="text-sm font-bold text-slate-800">
                    {baseBounds.length.toFixed(1)} <span className="text-[11px] font-normal text-slate-500">mm</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {baseBounds.minY.toFixed(1)} ➔ {baseBounds.maxY.toFixed(1)}
                  </div>
                  {settings.margin > 0 && (
                    <div className="text-[10px] font-bold text-amber-700 mt-1 border-t border-slate-100 pt-1">
                      Cadre: {framedBounds.length.toFixed(1)} mm
                    </div>
                  )}
                </div>

                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-sky-600 mb-0.5">
                    Axe Z (Course / Prof.)
                  </span>
                  <div className="text-sm font-bold text-slate-800">
                    {baseBounds.height.toFixed(1)} <span className="text-[11px] font-normal text-slate-500">mm</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {baseBounds.minZ.toFixed(1)} ➔ {baseBounds.maxZ.toFixed(1)}
                  </div>
                  <div className="text-[10px] font-medium text-sky-700 mt-1 border-t border-slate-100 pt-1">
                    Safe: +{settings.safeZ.toFixed(1)} mm
                  </div>
                </div>
              </div>
            </div>

            {/* Visualiseur 2D SVG Interactif du Brut et des Coins */}
            <div className="border border-slate-200 rounded-xl bg-slate-900 text-white p-3 space-y-2 flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <Target className="w-3.5 h-3.5 text-sky-400" />
                  Vue 2D du Plateau (Cliquez sur un point pour y déplacer l'outil)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Centre: X{framedBounds.centerX.toFixed(1)} Y{framedBounds.centerY.toFixed(1)}
                </span>
              </div>

              {/* Rendu Schématique SVG Interactif */}
              <div className="w-full h-56 relative flex items-center justify-center select-none overflow-hidden rounded-lg bg-slate-950 border border-slate-800">
                <svg
                  viewBox="0 0 460 250"
                  className="w-full h-full max-h-56"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.8" />
                    </pattern>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="5"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
                    </marker>
                  </defs>

                  {/* Grille de fond machine */}
                  <rect width="100%" height="100%" fill="url(#grid-pattern)" />

                  {/* Espace normalisé pour l'affichage : centre à (230, 125) */}
                  {(() => {
                    const svgW = 460;
                    const svgH = 250;
                    const pad = 40;
                    const maxSpanX = framedBounds.width;
                    const maxSpanY = framedBounds.length;
                    const scaleX = (svgW - pad * 2) / Math.max(10, maxSpanX);
                    const scaleY = (svgH - pad * 2) / Math.max(10, maxSpanY);
                    const scale = Math.min(scaleX, scaleY, 2.5);

                    // Conversion Coordonnées CNC -> Coordonnées SVG (axe Y inversé en SVG)
                    const toSvgX = (cncX: number) => 230 + (cncX - framedBounds.centerX) * scale;
                    const toSvgY = (cncY: number) => 125 - (cncY - framedBounds.centerY) * scale;

                    const rxMin = toSvgX(baseBounds.minX);
                    const rxMax = toSvgX(baseBounds.maxX);
                    const ryMin = toSvgY(baseBounds.minY); // ryMin est en bas (y svg plus grand)
                    const ryMax = toSvgY(baseBounds.maxY); // ryMax est en haut (y svg plus petit)

                    const rectW = Math.abs(rxMax - rxMin);
                    const rectH = Math.abs(ryMin - ryMax);
                    const rectLeft = Math.min(rxMin, rxMax);
                    const rectTop = Math.min(ryMin, ryMax);

                    // Coordonnées du cadre avec marge
                    const fxMin = toSvgX(framedBounds.minX);
                    const fxMax = toSvgX(framedBounds.maxX);
                    const fyMin = toSvgY(framedBounds.minY);
                    const fyMax = toSvgY(framedBounds.maxY);
                    const fLeft = Math.min(fxMin, fxMax);
                    const fTop = Math.min(fyMin, fyMax);
                    const fW = Math.abs(fxMax - fxMin);
                    const fH = Math.abs(fyMin - fyMax);

                    // Position outil actuel WPos
                    const toolSvgX = toSvgX(status.wpos.x);
                    const toolSvgY = toSvgY(status.wpos.y);

                    return (
                      <g>
                        {/* Zone de marge Brides (Pointillés Ambre) */}
                        {settings.margin > 0 && (
                          <rect
                            x={fLeft}
                            y={fTop}
                            width={fW}
                            height={fH}
                            fill="#f59e0b"
                            fillOpacity="0.08"
                            stroke="#f59e0b"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                            rx="4"
                          />
                        )}

                        {/* Rectangle Brut G-Code (Bleu ciel) */}
                        <rect
                          x={rectLeft}
                          y={rectTop}
                          width={rectW}
                          height={rectH}
                          fill="#0284c7"
                          fillOpacity="0.18"
                          stroke="#38bdf8"
                          strokeWidth="2"
                          rx="3"
                        />

                        {/* Flèches de direction du tracé (Horloge) */}
                        <line
                          x1={fxMin + 15}
                          y1={fyMin}
                          x2={fxMax - 15}
                          y2={fyMin}
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          markerEnd="url(#arrow)"
                          strokeOpacity="0.8"
                        />
                        <line
                          x1={fxMax}
                          y1={fyMin - 15}
                          x2={fxMax}
                          y2={fyMax + 15}
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          markerEnd="url(#arrow)"
                          strokeOpacity="0.8"
                        />
                        <line
                          x1={fxMax - 15}
                          y1={fyMax}
                          x2={fxMin + 15}
                          y2={fyMax}
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          markerEnd="url(#arrow)"
                          strokeOpacity="0.8"
                        />
                        <line
                          x1={fxMin}
                          y1={fyMax + 15}
                          x2={fxMin}
                          y2={fyMin - 15}
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          markerEnd="url(#arrow)"
                          strokeOpacity="0.8"
                        />

                        {/* Cotes de dimensions sur le brut */}
                        <text
                          x={230}
                          y={rectTop - 8}
                          fill="#94a3b8"
                          fontSize="10"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          X: {baseBounds.width.toFixed(1)} mm
                        </text>
                        <text
                          x={rectLeft - 8}
                          y={125}
                          fill="#94a3b8"
                          fontSize="10"
                          textAnchor="middle"
                          fontFamily="monospace"
                          transform={`rotate(-90 ${rectLeft - 8} 125)`}
                        >
                          Y: {baseBounds.length.toFixed(1)} mm
                        </text>

                        {/* 5 Cibles Interactives (Coins + Centre) */}
                        {[
                          { id: 'bottom-left' as CornerId, x: fxMin, y: fyMin, title: 'Bas-Gauche' },
                          { id: 'bottom-right' as CornerId, x: fxMax, y: fyMin, title: 'Bas-Droit' },
                          { id: 'top-right' as CornerId, x: fxMax, y: fyMax, title: 'Haut-Droit' },
                          { id: 'top-left' as CornerId, x: fxMin, y: fyMax, title: 'Haut-Gauche' },
                          { id: 'center' as CornerId, x: 230, y: 125, title: 'Centre' },
                        ].map((target) => (
                          <g
                            key={target.id}
                            className="cursor-pointer group"
                            onClick={() => handleMoveToPoint(target.id)}
                          >
                            <circle
                              cx={target.x}
                              cy={target.y}
                              r="10"
                              fill="#0ea5e9"
                              fillOpacity="0.25"
                              stroke="#38bdf8"
                              strokeWidth="1.5"
                              className="transition duration-150 hover:r-12 hover:fill-sky-400 hover:fill-opacity-50"
                            />
                            <circle cx={target.x} cy={target.y} r="2.5" fill="#f8fafc" />
                            <title>Cliquez pour aller à : {target.title}</title>
                          </g>
                        ))}

                        {/* Position Actuelle de la Fraise (Point Animé Rouge/Jaune) */}
                        {isMachineConnected && (
                          <g>
                            <circle
                              cx={toolSvgX}
                              cy={toolSvgY}
                              r="6"
                              fill="#ef4444"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                            >
                              <animate
                                attributeName="r"
                                values="5;7.5;5"
                                dur="1.5s"
                                repeatCount="indefinite"
                              />
                            </circle>
                            <text
                              x={toolSvgX + 8}
                              y={toolSvgY - 4}
                              fill="#f87171"
                              fontSize="9"
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              Fraise
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })()}
                </svg>
              </div>

              {/* Raccourci vers les 5 boutons de positionnement direct */}
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {(Object.keys(cornerPoints) as CornerId[]).map((pid) => {
                  const pt = cornerPoints[pid];
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => handleMoveToPoint(pid)}
                      disabled={!canSendMove}
                      className="flex flex-col items-center justify-center p-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-700 transition disabled:opacity-40 disabled:pointer-events-none"
                      title={`Aller à ${pt.label} (Z levé à +${settings.safeZ} mm d'abord)`}
                    >
                      <span className="text-sky-400 mb-0.5">{pt.icon}</span>
                      <span className="truncate max-w-[80px]">
                        {pid === 'center'
                          ? 'Centre'
                          : pid === 'bottom-left'
                          ? 'Bas-G.'
                          : pid === 'bottom-right'
                          ? 'Bas-D.'
                          : pid === 'top-right'
                          ? 'Haut-D.'
                          : 'Haut-G.'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message de notification d'action */}
            {lastActionFeedback && (
              <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  {lastActionFeedback}
                </span>
                <button
                  type="button"
                  onClick={() => setLastActionFeedback(null)}
                  className="text-sky-600 hover:text-sky-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* COLONNE DROITE (5/12) : Paramètres Réglables & Actions d'Exécution */}
          <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
            
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <Sliders className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Paramètres de Sécurité Cadrage
                </h3>
              </div>

              {/* 1. Z DE SÉCURITÉ PENDANT LE CADRAGE */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-sky-600" />
                    Z de Sécurité (au-dessus de Z0)
                  </label>
                  <button
                    type="button"
                    onClick={handleUseCurrentZ}
                    className="text-[10px] font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2 py-0.5 rounded transition"
                    title="Prendre la hauteur actuelle de la fraise"
                  >
                    Utiliser Z actuel ({status.wpos.z > 0 ? `+${status.wpos.z.toFixed(1)}` : status.wpos.z.toFixed(1)})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={settings.safeZ}
                    onChange={(e) => updateSettings({ safeZ: Math.max(0.5, parseFloat(e.target.value) || 5) })}
                    className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold font-mono text-slate-800"
                  />
                  <span className="text-xs font-medium text-slate-500">mm au-dessus de Z0</span>
                </div>

                {/* Presets rapides de Z */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[5, 10, 15, 20, 30].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateSettings({ safeZ: val })}
                      className={`px-2 py-1 rounded text-xs font-semibold border transition ${
                        settings.safeZ === val
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      +{val} mm
                    </button>
                  ))}
                </div>

                {settings.safeZ <= 2 && (
                  <p className="text-[11px] text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                    Attention : Z ≤ 2 mm très proche de la pièce !
                  </p>
                )}
              </div>

              {/* 2. VITESSE D'AVANCE (FEED RATE) */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-600" />
                    Vitesse d'avance du cadrage
                  </label>
                  <span className="text-xs font-bold font-mono text-sky-700">
                    {settings.feedRate} mm/min
                  </span>
                </div>

                <input
                  type="range"
                  min="300"
                  max="3000"
                  step="100"
                  value={settings.feedRate}
                  onChange={(e) => updateSettings({ feedRate: parseInt(e.target.value, 10) || 1200 })}
                  className="w-full accent-sky-600 cursor-pointer"
                />

                <div className="flex flex-wrap gap-1.5">
                  {[600, 1200, 1800, 2400].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => updateSettings({ feedRate: f })}
                      className={`px-2 py-1 rounded text-xs font-semibold border transition ${
                        settings.feedRate === f
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. MARGE SUPPLÉMENTAIRE BRIDES (OFFSET SÉCURITÉ) */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-amber-600" />
                    Marge Brides (Offset de dégagement)
                  </label>
                  <span className="text-xs font-bold font-mono text-amber-700">
                    +{settings.margin} mm
                  </span>
                </div>

                <p className="text-[11px] text-slate-500">
                  Élargit le périmètre pour vérifier que les vis et brides ne coupent pas la trajectoire.
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {[0, 2, 5, 10, 15].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateSettings({ margin: m })}
                      className={`px-2 py-1 rounded text-xs font-semibold border transition ${
                        settings.margin === m
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {m === 0 ? '0 mm (Exact)' : `+${m} mm`}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. MODE CONTINU / RÉPÉTITION & OPTION POINTEUR LASER */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">Mode de Tracé</label>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input
                        type="radio"
                        name="framing_mode"
                        checked={settings.mode === 'once'}
                        onChange={() => updateSettings({ mode: 'once' })}
                        className="accent-sky-600"
                      />
                      1 tour (Arrêt auto)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                      <input
                        type="radio"
                        name="framing_mode"
                        checked={settings.mode === 'continuous'}
                        onChange={() => updateSettings({ mode: 'continuous' })}
                        className="accent-sky-600"
                      />
                      En boucle (Continu)
                    </label>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    Pointeur Diode / Laser
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={settings.useLaserPointer}
                      onChange={(e) => updateSettings({ useLaserPointer: e.target.checked })}
                      className="accent-sky-600"
                    />
                    Activer M3 S{settings.laserPowerS} (Basse intensité)
                  </label>
                </div>
              </div>
            </div>

            {/* =====================================================================
                ACTIONS D'EXÉCUTION PRINCIPALES (BAS DE COLONNE DROITE)
            ===================================================================== */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              
              {/* État de cadrage continu actif avec bouton d'arrêt */}
              {isFramingActive ? (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                      Cadrage en cours — Tour #{cycleCounter}
                    </span>
                    <span className="font-mono">{settings.mode === 'continuous' ? 'Mode Continu' : '1 Tour'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleStopFraming(false)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Terminer et Arrêter</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStopFraming(true)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Arrêt Immédiat (!)</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Bouton Principal de Tracé */
                <button
                  type="button"
                  onClick={handleStartFraming}
                  disabled={!canSendMove}
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-sm font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md hover:shadow-lg transition disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {settings.mode === 'continuous'
                      ? 'Lancer le Cadrage en Boucle (Continu)'
                      : 'Tracer le Rectangle Complet (1 Tour)'}
                  </span>
                </button>
              )}

              {/* Raccourci pour mettre à zéro XY au point actuel */}
              {onZeroWorkAxis && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    Calibré au bon coin ?
                  </span>
                  <button
                    type="button"
                    onClick={() => onZeroWorkAxis('XY')}
                    disabled={!canSendMove}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2 py-1 rounded transition disabled:opacity-40"
                    title="Définir l'origine pièce X0 Y0 à la position actuelle"
                  >
                    <Crosshair className="w-3 h-3 text-sky-600" />
                    <span>Mettre à Zéro X/Y (G92 X0 Y0)</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
