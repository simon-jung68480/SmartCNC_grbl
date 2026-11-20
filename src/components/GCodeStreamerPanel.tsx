import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  Upload,
  FileCode,
  CheckCircle2,
  Maximize2,
  Wand2,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  Clock,
  Layers,
  ChevronDown,
  RotateCcw,
  Download,
} from 'lucide-react';
import { JobStatus, MachineState, ParsedGCodeStats } from '../types/cnc';

export interface SampleGCodeFile {
  id: string;
  name: string;
  description: string;
  gcode: string;
}

const ROW_HEIGHT = 22;

export const BUILTIN_SAMPLE_FILES: SampleGCodeFile[] = [
  {
    id: 'calibration-target',
    name: '1. Cible de Calibrage 60x60mm (Carré + Cercle)',
    description: 'Vérifie l’équerrage X/Y, les pas/mm ($100/$101) et l’interpolation circulaire G2/G3',
    gcode: `; ==========================================
; SMARTCNC - CIBLE DE CALIBRAGE 60x60mm
; Outil: Fraise 3.175mm (1/8") | Profondeur: -1.0mm
; Origine: Coin Avant-Gauche (X0 Y0), Z0 sur surface
; ==========================================
G21 ; Unités en millimètres
G90 ; Coordonnées absolues
G17 ; Plan XY
G0 Z5.000 ; Hauteur de sécurité
M3 S10000 ; Démarrage broche 10000 RPM
G4 P1.0 ; Pause accélération broche

; --- Passe 1 : Carré extérieur 60x60mm ---
G0 X0.000 Y0.000
G1 Z-0.500 F250
G1 X60.000 Y0.000 F800
G1 X60.000 Y60.000
G1 X0.000 Y60.000
G1 X0.000 Y0.000
G1 Z-1.000 F250
G1 X60.000 Y0.000 F800
G1 X60.000 Y60.000
G1 X0.000 Y60.000
G1 X0.000 Y0.000
G0 Z5.000

; --- Passe 2 : Cercle inscrit Ø40mm (Centre X30 Y30) ---
G0 X30.000 Y10.000
G1 Z-0.800 F250
G2 X30.000 Y50.000 I0.000 J20.000 F700
G2 X30.000 Y10.000 I0.000 J-20.000 F700
G0 Z5.000

; --- Passe 3 : Croix centrale de mesure ---
G0 X15.000 Y30.000
G1 Z-0.500 F250
G1 X45.000 Y30.000 F600
G0 Z5.000
G0 X30.000 Y15.000
G1 Z-0.500 F250
G1 X30.000 Y45.000 F600
G0 Z10.000

M5 ; Arrêt broche
G0 X0.000 Y0.000 ; Retour origine
M30 ; Fin de programme`,
  },
  {
    id: 'smartcnc-badge',
    name: '2. Plaque Frontale Boîtier CNC (100x60mm)',
    description: 'Découpe de plaque avec 4 perçages M4 de fixation et rainure de ventilation',
    gcode: `; ==========================================
; SMARTCNC - PLAQUE BOITIER ELECTRONIQUE 100x60mm
; Matériau: Acrylique / Contreplaqué 3mm
; ==========================================
G21 G90 G17
G0 Z5.000
M3 S12000

; --- 4 Perçages d'angle (X8/Y8, X92/Y8, X92/Y52, X8/Y52) ---
G0 X8.000 Y8.000
G1 Z-1.500 F200
G0 Z2.000
G1 Z-3.200 F200
G0 Z5.000

G0 X92.000 Y8.000
G1 Z-1.500 F200
G0 Z2.000
G1 Z-3.200 F200
G0 Z5.000

G0 X92.000 Y52.000
G1 Z-1.500 F200
G0 Z2.000
G1 Z-3.200 F200
G0 Z5.000

G0 X8.000 Y52.000
G1 Z-1.500 F200
G0 Z2.000
G1 Z-3.200 F200
G0 Z5.000

; --- Ouverture centrale écran LCD (60x24mm) ---
G0 X20.000 Y18.000
G1 Z-1.500 F300
G1 X80.000 Y18.000 F900
G1 X80.000 Y42.000
G1 X20.000 Y42.000
G1 X20.000 Y18.000
G1 Z-3.100 F300
G1 X80.000 Y18.000 F900
G1 X80.000 Y42.000
G1 X20.000 Y42.000
G1 X20.000 Y18.000
G0 Z5.000

; --- Découpe périmètre 100x60mm ---
G0 X0.000 Y0.000
G1 Z-1.500 F300
G1 X100.000 Y0.000 F1000
G1 X100.000 Y60.000
G1 X0.000 Y60.000
G1 X0.000 Y0.000
G1 Z-3.100 F300
G1 X100.000 Y0.000 F1000
G1 X100.000 Y60.000
G1 X0.000 Y60.000
G1 X0.000 Y0.000
G0 Z10.000
M5
G0 X0.000 Y0.000
M30`,
  },
  {
    id: 'spoilboard-80x80',
    name: '3. Surfaçage Martyr Rapide 80x80mm (Z -0.5mm)',
    description: 'Balayage en zig-zag horizontal pour aplanir le plateau martyr MDF',
    gcode: `; ==========================================
; SMARTCNC - SURFACAGE MARTYR 80x80mm
; Fraise à surfacer Ø20mm | Pas latéral: 13mm | Z: -0.5mm
; ==========================================
G21 G90 G17
G0 Z5.000
M3 S10000
G0 X0.000 Y0.000
G1 Z-0.500 F300
G1 X80.000 Y0.000 F1200
G1 X80.000 Y13.000
G1 X0.000 Y13.000
G1 X0.000 Y26.000
G1 X80.000 Y26.000
G1 X80.000 Y39.000
G1 X0.000 Y39.000
G1 X0.000 Y52.000
G1 X80.000 Y52.000
G1 X80.000 Y65.000
G1 X0.000 Y65.000
G1 X0.000 Y80.000
G1 X80.000 Y80.000
; Passe de finition périmètre
G1 X80.000 Y0.000 F1000
G1 X0.000 Y0.000
G1 X0.000 Y80.000
G0 Z10.000
M5
G0 X0.000 Y0.000
M30`,
  },
  {
    id: 'pcb-isolation-test',
    name: '4. Gravure Piste PCB Test (50x35mm)',
    description: 'Pistes d’isolation fines à Z -0.1mm pour tester la compensation Heightmap Z',
    gcode: `; ==========================================
; SMARTCNC - GRAVURE ISOLATION PCB 50x35mm
; Outil: Pointe Javelot V-Bit 30° 0.1mm | Z: -0.10mm
; Idéal avec le palpage de surface Heightmap activé
; ==========================================
G21 G90 G17
G0 Z3.000
M3 S12000
; Contour pastille DIP-8 et pistes
G0 X5.000 Y5.000
G1 Z-0.100 F120
G1 X45.000 Y5.000 F450
G1 X45.000 Y30.000
G1 X5.000 Y30.000
G1 X5.000 Y5.000
G0 Z2.000
; Pistes internes
G0 X10.000 Y10.000
G1 Z-0.100 F120
G1 X25.000 Y10.000 F400
G1 X30.000 Y15.000
G1 X40.000 Y15.000
G0 Z2.000
G0 X10.000 Y20.000
G1 Z-0.100 F120
G1 X22.000 Y20.000 F400
G1 X27.000 Y25.000
G1 X40.000 Y25.000
G0 Z5.000
M5
G0 X0.000 Y0.000
M30`,
  },
];

export interface GCodeStreamerPanelProps {
  connected: boolean;
  machineState: MachineState;
  job: JobStatus;
  gcodeText: string;
  stats?: ParsedGCodeStats | null;
  sampleFiles?: SampleGCodeFile[];
  onLoadGCode: (fileName: string, content: string) => void;
  onUpdateGCode?: (newContent: string) => void;
  onStartJob: () => void;
  onPauseJob: () => void;
  onResumeJob: () => void;
  onStopJob: () => void;
  onToggleCheckMode: () => void;
  onFrameJob?: () => void;
  onOpenFramingModal?: () => void;
  onSendCommand?: (cmd: string) => void;
}

interface SpoilboardConfig {
  mode: 'zigzag-x' | 'zigzag-y' | 'framing-only';
  widthX: number;
  lengthY: number;
  toolDiameter: number;
  stepoverPercent: number;
  totalDepth: number;
  depthPerPass: number;
  feedRate: number;
  plungeRate: number;
  spindleSpeed: number;
  safeZ: number;
  finishPerimeter: boolean;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0 || !Number.isFinite(ms)) return '--:--';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Coloration syntaxique adaptée au Mode Clair (uniquement exécutée sur les ~35 lignes visibles)
 */
function renderHighlightedGCodeLine(line: string): React.ReactNode {
  const trimmed = line.trim();
  if (!trimmed) return <span className="text-slate-400">&nbsp;</span>;

  const semiIdx = line.indexOf(';');
  const codePart = semiIdx >= 0 ? line.slice(0, semiIdx) : line;
  const commentPart = semiIdx >= 0 ? line.slice(semiIdx) : '';

  const tokens = codePart.split(/(\s+)/);

  return (
    <>
      {tokens.map((token, idx) => {
        if (!token.trim()) return <span key={idx}>{token}</span>;
        const upper = token.toUpperCase();

        if (/^G0*0(\b|$)/.test(upper)) {
          return (
            <span key={idx} className="text-amber-700 font-bold">
              {token}
            </span>
          );
        }
        if (/^G0*1(\b|$)/.test(upper)) {
          return (
            <span key={idx} className="text-blue-700 font-bold">
              {token}
            </span>
          );
        }
        if (/^G0*[23](\b|$)/.test(upper)) {
          return (
            <span key={idx} className="text-purple-700 font-bold">
              {token}
            </span>
          );
        }
        if (/^G\d+/.test(upper)) {
          return (
            <span key={idx} className="text-slate-800 font-semibold">
              {token}
            </span>
          );
        }
        if (/^M\d+/.test(upper)) {
          return (
            <span key={idx} className="text-purple-700 font-bold">
              {token}
            </span>
          );
        }
        if (/^X[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-red-600 font-medium">
              {token}
            </span>
          );
        }
        if (/^Y[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-emerald-700 font-medium">
              {token}
            </span>
          );
        }
        if (/^Z[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-blue-700 font-medium">
              {token}
            </span>
          );
        }
        if (/^[IJ][-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-slate-600">
              {token}
            </span>
          );
        }
        if (/^F[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-amber-700 font-semibold">
              {token}
            </span>
          );
        }
        if (/^S[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-amber-700 font-semibold">
              {token}
            </span>
          );
        }
        if (token.startsWith('(') && token.endsWith(')')) {
          return (
            <span key={idx} className="text-slate-400 italic">
              {token}
            </span>
          );
        }
        return (
          <span key={idx} className="text-slate-800">
            {token}
          </span>
        );
      })}
      {commentPart && <span className="text-slate-400 italic">{commentPart}</span>}
    </>
  );
}

export const GCodeStreamerPanel: React.FC<GCodeStreamerPanelProps> = ({
  connected,
  machineState,
  job,
  gcodeText,
  stats,
  sampleFiles = BUILTIN_SAMPLE_FILES,
  onLoadGCode,
  onUpdateGCode,
  onStartJob,
  onPauseJob,
  onResumeJob,
  onStopJob,
  onToggleCheckMode,
  onFrameJob,
  onOpenFramingModal,
  onSendCommand,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);
  const [showSpoilboardModal, setShowSpoilboardModal] = useState(false);

  // Virtual scroll state
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(260);

  // Quick editor state (draftGCode uniquement initialisé à l'ouverture de l'éditeur)
  const [isEditing, setIsEditing] = useState(false);
  const [draftGCode, setDraftGCode] = useState('');
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [editingLineValue, setEditingLineValue] = useState('');

  // États harmonisés Pause / Exécution
  const isPaused = job.state === 'paused' || machineState.startsWith('Hold');
  const isRunning = (job.state === 'running' || machineState === 'Run') && !isPaused;
  const isCheckMode = machineState === 'Check';

  // Live elapsed timer when job is running
  const [liveElapsedMs, setLiveElapsedMs] = useState(job.elapsedMs);

  useEffect(() => {
    setLiveElapsedMs(job.elapsedMs);
    if (!isRunning || !job.startTime) return;
    const interval = setInterval(() => {
      setLiveElapsedMs(Date.now() - (job.startTime || Date.now()));
    }, 250);
    return () => clearInterval(interval);
  }, [isRunning, job.startTime, job.elapsedMs]);

  const lines = useMemo(() => {
    if (!gcodeText) return [];
    return gcodeText.split(/\r?\n/);
  }, [gcodeText]);

  // Mesure de la hauteur du conteneur virtualisé
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Défilement instantané sans blocage UI pendant l'usinage
  useEffect(() => {
    if ((isRunning || isPaused) && scrollContainerRef.current) {
      const targetTop = Math.max(
        0,
        job.currentLineIndex * ROW_HEIGHT - viewportHeight / 2
      );
      scrollContainerRef.current.scrollTop = targetTop;
      setScrollTop(targetTop);
    }
  }, [job.currentLineIndex, isRunning, isPaused, viewportHeight]);

  // Remise en haut lors du chargement d'un nouveau fichier
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [job.fileName]);

  // Spoilboard Wizard configuration
  const [wizardConfig, setWizardConfig] = useState<SpoilboardConfig>({
    mode: 'zigzag-x',
    widthX: 200,
    lengthY: 150,
    toolDiameter: 20,
    stepoverPercent: 65,
    totalDepth: 0.5,
    depthPerPass: 0.5,
    feedRate: 1200,
    plungeRate: 300,
    spindleSpeed: 10000,
    safeZ: 5,
    finishPerimeter: true,
  });

  // Compute bounding box from stats (évite tout parcours regex lent sur 100k lignes)
  const computedBounds = useMemo(() => {
    if (stats?.bounds) {
      return stats.bounds;
    }
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 100, z: 0 },
      size: { x: 100, y: 100, z: 0 },
    };
  }, [stats]);

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (typeof content === 'string') {
        onLoadGCode(file.name, content);
        setIsEditing(false);
        setEditingLineIndex(null);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleFrameBoundingBox = () => {
    if (onOpenFramingModal) {
      onOpenFramingModal();
      return;
    }
    if (onFrameJob) {
      onFrameJob();
      return;
    }
    if (onSendCommand) {
      const { min, max } = computedBounds;
      const cmds = [
        'G21 G90',
        'G0 Z5.000',
        `G0 X${min.x.toFixed(3)} Y${min.y.toFixed(3)}`,
        `G1 X${max.x.toFixed(3)} Y${min.y.toFixed(3)} F1500`,
        `G1 X${max.x.toFixed(3)} Y${max.y.toFixed(3)} F1500`,
        `G1 X${min.x.toFixed(3)} Y${max.y.toFixed(3)} F1500`,
        `G1 X${min.x.toFixed(3)} Y${min.y.toFixed(3)} F1500`,
      ];
      cmds.forEach((c) => onSendCommand(c));
    }
  };

  const handleSaveFullEdit = () => {
    if (onUpdateGCode) {
      onUpdateGCode(draftGCode);
    } else {
      onLoadGCode(job.fileName || 'programme_modifie.nc', draftGCode);
    }
    setIsEditing(false);
  };

  const handleSaveSingleLine = (idx: number) => {
    const updated = [...lines];
    updated[idx] = editingLineValue;
    const joined = updated.join('\n');
    if (onUpdateGCode) {
      onUpdateGCode(joined);
    } else {
      onLoadGCode(job.fileName || 'programme_modifie.nc', joined);
    }
    setEditingLineIndex(null);
  };

  const handleInsertLineAfter = (idx: number) => {
    const updated = [...lines];
    updated.splice(idx + 1, 0, 'G0 Z5.000 ; Nouvelle ligne');
    const joined = updated.join('\n');
    if (onUpdateGCode) {
      onUpdateGCode(joined);
    } else {
      onLoadGCode(job.fileName || 'programme_modifie.nc', joined);
    }
    setEditingLineIndex(idx + 1);
    setEditingLineValue('G0 Z5.000 ; Nouvelle ligne');
  };

  const handleDeleteLine = (idx: number) => {
    if (lines.length <= 1) return;
    const updated = lines.filter((_, i) => i !== idx);
    const joined = updated.join('\n');
    if (onUpdateGCode) {
      onUpdateGCode(joined);
    } else {
      onLoadGCode(job.fileName || 'programme_modifie.nc', joined);
    }
    setEditingLineIndex(null);
  };

  const handleExportGCode = () => {
    if (!gcodeText) return;
    const blob = new Blob([gcodeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = job.fileName || 'smartcnc_programme.nc';
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateSpoilboardGCode = () => {
    const {
      mode,
      widthX,
      lengthY,
      toolDiameter,
      stepoverPercent,
      totalDepth,
      depthPerPass,
      feedRate,
      plungeRate,
      spindleSpeed,
      safeZ,
      finishPerimeter,
    } = wizardConfig;

    const stepoverMm = Math.max(0.5, +(toolDiameter * (stepoverPercent / 100)).toFixed(3));
    const numPasses = Math.max(1, Math.ceil(totalDepth / Math.max(0.05, depthPerPass)));

    const out: string[] = [
      `; ==========================================================`,
      `; SMARTCNC - GENERATEUR DE SURFACAGE MARTYR / FRAMING`,
      `; Mode: ${mode === 'framing-only' ? 'Test de Cadre (Framing)' : mode === 'zigzag-x' ? 'Surfaçage Zig-Zag X' : 'Surfaçage Zig-Zag Y'}`,
      `; Dimensions: ${widthX}mm (X) x ${lengthY}mm (Y)`,
      `; Outil: Ø${toolDiameter}mm | Recouvrement: ${stepoverPercent}% (${stepoverMm}mm)`,
      `; Profondeur totale: -${totalDepth}mm en ${numPasses} passe(s)`,
      `; Avance: ${feedRate} mm/min | Plongée: ${plungeRate} mm/min | Broche: ${spindleSpeed} RPM`,
      `; ==========================================================`,
      `G21 ; Millimètres`,
      `G90 ; Coordonnées absolues`,
      `G17 ; Plan XY`,
      `G0 Z${safeZ.toFixed(3)}`,
    ];

    if (mode === 'framing-only') {
      out.push(
        `; --- Traçage du cadre englobant à Z de sécurité ---`,
        `G0 X0.000 Y0.000`,
        `G1 X${widthX.toFixed(3)} Y0.000 F${feedRate}`,
        `G1 X${widthX.toFixed(3)} Y${lengthY.toFixed(3)} F${feedRate}`,
        `G1 X0.000 Y${lengthY.toFixed(3)} F${feedRate}`,
        `G1 X0.000 Y0.000 F${feedRate}`,
        `M30`
      );
      const fileName = `framing_${widthX}x${lengthY}mm.nc`;
      onLoadGCode(fileName, out.join('\n'));
      setShowSpoilboardModal(false);
      return;
    }

    out.push(`M3 S${spindleSpeed} ; Démarrage broche`, `G4 P1.5 ; Stabilisation RPM`);

    for (let pass = 1; pass <= numPasses; pass++) {
      const targetZ = -Math.min(totalDepth, +(pass * depthPerPass).toFixed(3));
      out.push(
        ``,
        `; --- PASSE ${pass}/${numPasses} (Z = ${targetZ.toFixed(3)} mm) ---`,
        `G0 Z${safeZ.toFixed(3)}`,
        `G0 X0.000 Y0.000`,
        `G1 Z${targetZ.toFixed(3)} F${plungeRate}`
      );

      if (mode === 'zigzag-x') {
        let currentY = 0;
        let goingRight = true;
        while (currentY <= lengthY + 0.0001) {
          const clampedY = Math.min(lengthY, +currentY.toFixed(3));
          if (currentY > 0) {
            out.push(`G1 Y${clampedY.toFixed(3)} F${feedRate}`);
          }
          const targetX = goingRight ? widthX : 0;
          out.push(`G1 X${targetX.toFixed(3)} Y${clampedY.toFixed(3)} F${feedRate}`);
          goingRight = !goingRight;
          if (clampedY >= lengthY) break;
          currentY += stepoverMm;
          if (currentY > lengthY && clampedY < lengthY) {
            currentY = lengthY;
          }
        }
      } else {
        let currentX = 0;
        let goingUp = true;
        while (currentX <= widthX + 0.0001) {
          const clampedX = Math.min(widthX, +currentX.toFixed(3));
          if (currentX > 0) {
            out.push(`G1 X${clampedX.toFixed(3)} F${feedRate}`);
          }
          const targetY = goingUp ? lengthY : 0;
          out.push(`G1 X${clampedX.toFixed(3)} Y${targetY.toFixed(3)} F${feedRate}`);
          goingUp = !goingUp;
          if (clampedX >= widthX) break;
          currentX += stepoverMm;
          if (currentX > widthX && clampedX < widthX) {
            currentX = widthX;
          }
        }
      }

      if (finishPerimeter) {
        out.push(
          `; Passe de finition du contour extérieur`,
          `G1 X0.000 Y0.000 F${feedRate}`,
          `G1 X${widthX.toFixed(3)} Y0.000 F${feedRate}`,
          `G1 X${widthX.toFixed(3)} Y${lengthY.toFixed(3)} F${feedRate}`,
          `G1 X0.000 Y${lengthY.toFixed(3)} F${feedRate}`,
          `G1 X0.000 Y0.000 F${feedRate}`
        );
      }
    }

    out.push(
      ``,
      `G0 Z${Math.max(10, safeZ).toFixed(3)} ; Dégagement final`,
      `M5 ; Arrêt broche`,
      `G0 X0.000 Y0.000 ; Retour origine X0 Y0`,
      `M30 ; Fin du programme`
    );

    const fileName = `surfacage_${widthX}x${lengthY}_Z${totalDepth}mm.nc`;
    onLoadGCode(fileName, out.join('\n'));
    setShowSpoilboardModal(false);
  };

  const hasGCode = lines.length > 0 && gcodeText.length > 0;
  const displayProgress =
    job.state === 'idle' && !isRunning && !isPaused
      ? 0
      : Math.min(100, Math.max(0, job.progressPercent || 0));

  // Calcul de la fenêtre de lignes virtualisée (Windowing)
  const totalHeight = lines.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 10);
  const endIndex = Math.min(
    lines.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 10
  );
  const visibleLines = useMemo(
    () => lines.slice(startIndex, endIndex),
    [lines, startIndex, endIndex]
  );

  return (
    <div
      className={`flex flex-col h-full bg-white text-slate-800 border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors ${
        isDragging ? 'border-sky-500 bg-sky-50/40' : 'border-slate-200/90'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Barre 1 : Fichier, actions fichier & édition unifiées */}
      <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 shrink-0">
            <FileCode className="w-4 h-4 text-sky-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-xs font-bold text-slate-900 truncate max-w-[220px]">
                {job.fileName || 'Aucun fichier G-Code chargé'}
              </h3>
              {job.heightmapApplied && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Layers className="w-2.5 h-2.5" />
                  Heightmap Z
                </span>
              )}
              {isCheckMode && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  Test $C
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
              {hasGCode ? (
                <>
                  <span>{lines.length.toLocaleString('fr-FR')} lignes</span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={handleFrameBoundingBox}
                    className="inline-flex items-center gap-1 text-slate-600 hover:text-sky-600 hover:underline cursor-pointer transition-colors"
                    title="Ouvrir l'assistant de Cadrage / Framing"
                  >
                    <span>{(computedBounds.size.x || 0).toFixed(1)} × {(computedBounds.size.y || 0).toFixed(1)} mm</span>
                    <Maximize2 className="w-2.5 h-2.5 text-sky-500" />
                  </button>
                </>
              ) : (
                'Glissez-déposez un fichier .nc / .gcode ou choisissez un modèle'
              )}
            </div>
          </div>
        </div>

        {/* Boutons fichier + éditeur regroupés */}
        <div className="flex flex-wrap items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".nc,.gcode,.tap,.ngc,.txt,.cnc"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRunning}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer disabled:opacity-50"
            title="Charger un fichier G-Code (.nc, .gcode, .tap, .ngc, .txt)"
          >
            <Upload className="w-3 h-3 text-slate-500" />
            <span>Ouvrir</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSampleDropdown((v) => !v)}
              disabled={isRunning}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer disabled:opacity-50"
              title="Charger un programme G-Code d'exemple"
            >
              <span>Exemples</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showSampleDropdown && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowSampleDropdown(false)}
                />
                <div className="absolute right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-40 py-1.5 divide-y divide-slate-100">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50">
                    Programmes G-Code prêts à l'emploi
                  </div>
                  {sampleFiles.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => {
                        onLoadGCode(`${sample.id}.nc`, sample.gcode);
                        setShowSampleDropdown(false);
                        setIsEditing(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 transition flex flex-col gap-0.5 cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-800">
                        {sample.name}
                      </span>
                      <span className="text-[11px] text-slate-500 leading-tight">
                        {sample.description}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowSpoilboardModal(true)}
            disabled={isRunning}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer disabled:opacity-50"
            title="Ouvrir le générateur de surfaçage martyr (Spoilboard Wizard)"
          >
            <Wand2 className="w-3 h-3 text-sky-600" />
            <span>Surfaçage</span>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

          {!isEditing ? (
            <button
              type="button"
              onClick={() => {
                setDraftGCode(gcodeText);
                setIsEditing(true);
              }}
              disabled={isRunning}
              title="Éditer le programme complet (ou double-cliquez sur une ligne)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer disabled:opacity-40"
            >
              <Edit3 className="w-3 h-3 text-slate-500" />
              <span>Éditer</span>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSaveFullEdit}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer"
              >
                <Save className="w-3 h-3" />
                <span>Appliquer</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Annuler</span>
              </button>
            </div>
          )}

          {hasGCode && (
            <button
              type="button"
              onClick={handleExportGCode}
              className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition cursor-pointer"
              title="Exporter le fichier G-Code (.nc)"
              aria-label="Exporter le G-Code"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Barre 2 : Contrôles contextuels d'exécution + Progression + Ligne active */}
      <div className="px-3 py-2 bg-white border-b border-slate-200 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Boutons contextuels selon l'état */}
          <div className="flex flex-wrap items-center gap-1.5">
            {!isRunning && !isPaused ? (
              <>
                <button
                  type="button"
                  onClick={onStartJob}
                  disabled={!connected || !hasGCode}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Lancer</span>
                </button>

                <button
                  type="button"
                  onClick={handleFrameBoundingBox}
                  disabled={!connected}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 transition cursor-pointer disabled:opacity-40"
                  title="Ouvrir l'assistant de Cadrage / Framing (Vérification du brut et brides de serrage)"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-sky-600" />
                  <span>Cadrage</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleCheckMode}
                  disabled={!connected}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer disabled:opacity-40 ${
                    isCheckMode
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                  title="Activer/Désactiver le mode de vérification syntaxique GRBL ($C) sans mouvement moteur"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>Test $C</span>
                </button>
              </>
            ) : (
              <>
                {isRunning ? (
                  <button
                    type="button"
                    onClick={onPauseJob}
                    disabled={!connected}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition cursor-pointer disabled:opacity-40"
                    title="Pause d'avance / Feed Hold (!)"
                  >
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause (!)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onResumeJob}
                    disabled={!connected}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white ring-2 ring-sky-400/40 transition cursor-pointer disabled:opacity-40"
                    title="Reprendre l'usinage / Cycle Start (~)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reprendre (~)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onStopJob}
                  disabled={!connected}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer disabled:opacity-40"
                  title="Arrêter le programme"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Arrêter</span>
                </button>
              </>
            )}
          </div>

          {/* Statut & temps */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            <span
              className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] tracking-wider border ${
                isPaused
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : isRunning
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : job.state === 'completed'
                  ? 'bg-sky-50 text-sky-800 border-sky-200'
                  : job.state === 'error' || job.state === 'aborted'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {isPaused
                ? 'En pause'
                : isRunning
                ? 'En cours'
                : job.state === 'completed'
                ? 'Terminé'
                : job.state === 'aborted'
                ? 'Arrêté'
                : job.state === 'error'
                ? 'Erreur'
                : 'Prêt'}
            </span>

            <span className="font-mono text-slate-900 font-bold tabular-nums">
              {displayProgress.toFixed(1)}%
            </span>

            <span className="font-mono text-slate-500 text-[11px] tabular-nums">
              <strong className="text-slate-800">{job.acknowledgedLines}</strong>/{job.totalLines || lines.length}
            </span>

            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 tabular-nums" title="Temps écoulé / restant estimé">
              <Clock className="w-3 h-3 text-slate-400" />
              <strong className="text-slate-800">{formatDuration(liveElapsedMs)}</strong>
              <span className="text-slate-300">/</span>
              <strong className="text-amber-700">{formatDuration(job.estimatedRemainingMs)}</strong>
            </span>
          </div>
        </div>

        {/* Barre de progression fine */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/80">
          <div
            className="h-full bg-emerald-600 transition-all duration-200"
            style={{ width: `${displayProgress}%` }}
          />
        </div>

        {/* Ligne active compacte */}
        <div className="flex items-center justify-between gap-2 bg-slate-50/80 px-2.5 py-1 rounded-lg border border-slate-200/80 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <span className="text-sky-600 font-bold shrink-0">▶</span>
            <span className="text-slate-800 font-medium truncate">
              {job.currentCommand || lines[job.currentLineIndex] || (isRunning ? `Ligne #${job.currentLineIndex + 1}` : 'En attente de lancement')}
            </span>
          </div>
          {!isRunning && hasGCode && (
            <span className="hidden sm:inline text-[10px] font-sans text-slate-400 shrink-0">
              Double-clic sur une ligne pour éditer
            </span>
          )}
        </div>
      </div>

      {/* Corps : Éditeur texte complet OU Liste virtualisée haute performance */}
      <div
        ref={scrollContainerRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 min-h-[160px] overflow-y-auto bg-slate-50/60 text-slate-800 font-mono text-xs select-text"
      >
        {isEditing ? (
          <textarea
            value={draftGCode}
            onChange={(e) => setDraftGCode(e.target.value)}
            spellCheck={false}
            className="w-full h-full min-h-[220px] p-3 bg-white text-slate-900 font-mono text-xs focus:outline-none resize-none leading-relaxed"
            placeholder="Saisissez ou collez votre programme G-Code ici..."
          />
        ) : !hasGCode ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
            <Upload className="w-7 h-7 text-slate-400 mb-2" />
            <p className="text-xs font-semibold text-slate-700">
              Aucun programme G-Code chargé
            </p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
              Glissez un fichier <code className="text-slate-800 font-semibold">.nc</code> ou{' '}
              <code className="text-slate-800 font-semibold">.gcode</code> ici, utilisez le menu{' '}
              <strong className="text-slate-800">Exemples</strong> ou lancez le{' '}
              <strong className="text-slate-800">Surfaçage Martyr</strong>.
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${totalHeight}px`,
              position: 'relative',
            }}
          >
            <div
              style={{
                transform: `translateY(${startIndex * ROW_HEIGHT}px)`,
              }}
            >
              {visibleLines.map((line, localIdx) => {
                const index = startIndex + localIdx;
                const isCurrent =
                  (isRunning || isPaused) && index === job.currentLineIndex;
                const isDone =
                  (isRunning || isPaused || job.state === 'completed') &&
                  index < job.acknowledgedLines;
                const isLineEditing = editingLineIndex === index;

                return (
                  <div
                    key={index}
                    style={{ height: `${ROW_HEIGHT}px` }}
                    onDoubleClick={() => {
                      if (!isRunning) {
                        setEditingLineIndex(index);
                        setEditingLineValue(line);
                      }
                    }}
                    className={`group flex items-center px-2 border-b border-slate-200/70 ${
                      isCurrent
                        ? 'bg-sky-100 border-l-2 border-sky-600'
                        : isDone
                        ? 'bg-emerald-50/70 text-slate-500'
                        : 'hover:bg-slate-100'
                    }`}
                  >
                    {/* Numéro de ligne + statut */}
                    <div className="w-16 shrink-0 flex items-center gap-1 select-none text-[10px] text-slate-400 pr-2 border-r border-slate-200">
                      <span className="w-3 text-center">
                        {isCurrent ? (
                          <span className="text-sky-600 font-bold">▶</span>
                        ) : isDone ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : null}
                      </span>
                      <span className="text-right flex-1">{index + 1}</span>
                    </div>

                    {/* Contenu ou champ d'édition rapide */}
                    <div className="flex-1 pl-2.5 min-w-0 truncate">
                      {isLineEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingLineValue}
                            onChange={(e) => setEditingLineValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveSingleLine(index);
                              if (e.key === 'Escape') setEditingLineIndex(null);
                            }}
                            autoFocus
                            className="flex-1 bg-white border border-sky-500 rounded px-2 py-0 text-xs text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveSingleLine(index)}
                            className="px-1.5 py-0 rounded bg-emerald-600 text-white text-[10px]"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingLineIndex(null)}
                            className="px-1.5 py-0 rounded bg-slate-200 text-slate-700 text-[10px]"
                          >
                            ESC
                          </button>
                        </div>
                      ) : (
                        <div className="truncate leading-5">
                          {renderHighlightedGCodeLine(line)}
                        </div>
                      )}
                    </div>

                    {/* Actions rapides par ligne au survol */}
                    {!isRunning && !isLineEditing && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 pl-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLineIndex(index);
                            setEditingLineValue(line);
                          }}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800"
                          title="Modifier cette ligne"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInsertLineAfter(index)}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-emerald-700"
                          title="Insérer une ligne en dessous"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLine(index)}
                          className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-rose-600"
                          title="Supprimer cette ligne"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modale Générateur de Surfaçage Martyr (Spoilboard Wizard) en Mode Clair */}
      {showSpoilboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4">
          <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded bg-sky-50 border border-sky-200 text-sky-600">
                  <Wand2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Générateur de Surfaçage Martyr & Framing
                  </h3>
                  <p className="text-xs text-slate-500">
                    Créez un programme G-Code sur mesure pour surfacer votre plateau MDF
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSpoilboardModal(false)}
                className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">
                  Stratégie d'usinage
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'zigzag-x', label: 'Surfaçage Zig-Zag X' },
                    { id: 'zigzag-y', label: 'Surfaçage Zig-Zag Y' },
                    { id: 'framing-only', label: 'Test de Cadre (Framing)' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setWizardConfig((prev) => ({
                          ...prev,
                          mode: opt.id as SpoilboardConfig['mode'],
                        }))
                      }
                      className={`py-2 px-3 rounded font-semibold border text-center transition ${
                        wizardConfig.mode === opt.id
                          ? 'bg-sky-600 border-sky-600 text-white'
                          : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">
                    Largeur X à surfacer (mm)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={2000}
                    step={5}
                    value={wizardConfig.widthX}
                    onChange={(e) =>
                      setWizardConfig((p) => ({
                        ...p,
                        widthX: Math.max(1, Number(e.target.value)),
                      }))
                    }
                    className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">
                    Profondeur Y à surfacer (mm)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={2000}
                    step={5}
                    value={wizardConfig.lengthY}
                    onChange={(e) =>
                      setWizardConfig((p) => ({
                        ...p,
                        lengthY: Math.max(1, Number(e.target.value)),
                      }))
                    }
                    className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
              </div>

              {wizardConfig.mode !== 'framing-only' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Diamètre Fraise (mm)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={0.5}
                        value={wizardConfig.toolDiameter}
                        onChange={(e) =>
                          setWizardConfig((p) => ({
                            ...p,
                            toolDiameter: Math.max(0.5, Number(e.target.value)),
                          }))
                        }
                        className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Recouvrement (% du diamètre)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={95}
                        step={5}
                        value={wizardConfig.stepoverPercent}
                        onChange={(e) =>
                          setWizardConfig((p) => ({
                            ...p,
                            stepoverPercent: Math.min(
                              95,
                              Math.max(10, Number(e.target.value))
                            ),
                          }))
                        }
                        className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Profondeur Totale Z (mm)
                      </label>
                      <input
                        type="number"
                        min={0.1}
                        max={10}
                        step={0.1}
                        value={wizardConfig.totalDepth}
                        onChange={(e) =>
                          setWizardConfig((p) => ({
                            ...p,
                            totalDepth: Math.max(0.05, Number(e.target.value)),
                          }))
                        }
                        className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 mb-1">
                        Profondeur par passe (mm)
                      </label>
                      <input
                        type="number"
                        min={0.1}
                        max={5}
                        step={0.1}
                        value={wizardConfig.depthPerPass}
                        onChange={(e) =>
                          setWizardConfig((p) => ({
                            ...p,
                            depthPerPass: Math.max(0.05, Number(e.target.value)),
                          }))
                        }
                        className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">
                    Avance F (mm/min)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={wizardConfig.feedRate}
                    onChange={(e) =>
                      setWizardConfig((p) => ({
                        ...p,
                        feedRate: Math.max(50, Number(e.target.value)),
                      }))
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">
                    Plongée Z (mm/min)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={2000}
                    step={25}
                    value={wizardConfig.plungeRate}
                    onChange={(e) =>
                      setWizardConfig((p) => ({
                        ...p,
                        plungeRate: Math.max(10, Number(e.target.value)),
                      }))
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">
                    Broche S (RPM)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    max={24000}
                    step={500}
                    value={wizardConfig.spindleSpeed}
                    onChange={(e) =>
                      setWizardConfig((p) => ({
                        ...p,
                        spindleSpeed: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">
                    Z Sécurité (mm)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={wizardConfig.safeZ}
                    onChange={(e) =>
                      setWizardConfig((p) => ({
                        ...p,
                        safeZ: Math.max(1, Number(e.target.value)),
                      }))
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              {wizardConfig.mode !== 'framing-only' && (
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={wizardConfig.finishPerimeter}
                    onChange={(e) =>
                      setWizardConfig((p) => ({
                        ...p,
                        finishPerimeter: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 bg-white text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-slate-700">
                    Ajouter une passe de finition sur le périmètre extérieur
                  </span>
                </label>
              )}

              <div className="p-3 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-700">
                <span>
                  Pas latéral:{' '}
                  <strong className="text-blue-700">
                    {(
                      wizardConfig.toolDiameter *
                      (wizardConfig.stepoverPercent / 100)
                    ).toFixed(2)}{' '}
                    mm
                  </strong>
                </span>
                <span>
                  Passes Z:{' '}
                  <strong className="text-emerald-700">
                    {Math.max(
                      1,
                      Math.ceil(wizardConfig.totalDepth / wizardConfig.depthPerPass)
                    )}
                  </strong>
                </span>
                <span>
                  Origine: <strong className="text-amber-700">Avant-Gauche (X0 Y0)</strong>
                </span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSpoilboardModal(false)}
                className="px-3.5 py-2 rounded text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={generateSpoilboardGCode}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Générer et Charger le G-Code</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GCodeStreamerPanel;
