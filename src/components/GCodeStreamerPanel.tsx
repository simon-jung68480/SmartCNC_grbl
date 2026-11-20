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
  RotateCcw,
  Download,
} from 'lucide-react';
import { JobStatus, MachineState, ParsedGCodeStats } from '../types/cnc';

const ROW_HEIGHT = 22;

export interface GCodeStreamerPanelProps {
  connected: boolean;
  machineState: MachineState;
  job: JobStatus;
  gcodeText: string;
  stats?: ParsedGCodeStats | null;
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
            <span key={idx} className="text-amber-400 font-bold">
              {token}
            </span>
          );
        }
        if (/^G0*1(\b|$)/.test(upper)) {
          return (
            <span key={idx} className="text-sky-400 font-bold">
              {token}
            </span>
          );
        }
        if (/^G0*[23](\b|$)/.test(upper)) {
          return (
            <span key={idx} className="text-violet-400 font-bold">
              {token}
            </span>
          );
        }
        if (/^G\d+/.test(upper)) {
          return (
            <span key={idx} className="text-slate-100 font-semibold">
              {token}
            </span>
          );
        }
        if (/^M\d+/.test(upper)) {
          return (
            <span key={idx} className="text-fuchsia-400 font-bold">
              {token}
            </span>
          );
        }
        if (/^X[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-rose-400 font-medium">
              {token}
            </span>
          );
        }
        if (/^Y[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-emerald-400 font-medium">
              {token}
            </span>
          );
        }
        if (/^Z[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-sky-300 font-medium">
              {token}
            </span>
          );
        }
        if (/^[IJ][-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-slate-300">
              {token}
            </span>
          );
        }
        if (/^F[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-amber-300 font-semibold">
              {token}
            </span>
          );
        }
        if (/^S[-+]?\d*\.?\d+/.test(upper)) {
          return (
            <span key={idx} className="text-amber-300 font-semibold">
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
          <span key={idx} className="text-slate-200">
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
      className={`flex flex-col h-full bg-[#141b27] text-slate-100 border rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.28)] transition-colors ${
        isDragging ? 'border-sky-400 bg-sky-950/30' : 'border-slate-800'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Barre 1 : Fichier, actions fichier & édition unifiées */}
      <div className="px-3 py-2.5 bg-[#0f1520] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-[#090d14] border border-slate-800 text-sky-400 shrink-0">
            <FileCode className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-slate-50 truncate max-w-[220px]">
                {job.fileName || 'Aucun fichier G-Code chargé'}
              </h3>
              {job.heightmapApplied && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                  <Layers className="w-3 h-3" />
                  Heightmap Z
                </span>
              )}
              {isCheckMode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                  Test $C
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-300 font-mono flex items-center gap-1.5 flex-wrap">
              {hasGCode ? (
                <>
                  <span>{lines.length.toLocaleString('fr-FR')} lignes</span>
                  <span className="text-slate-600">·</span>
                  <button
                    type="button"
                    onClick={handleFrameBoundingBox}
                    className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 hover:underline cursor-pointer transition-colors"
                    title="Ouvrir l'assistant de Cadrage / Framing"
                  >
                    <span>{(computedBounds.size.x || 0).toFixed(1)} × {(computedBounds.size.y || 0).toFixed(1)} mm</span>
                    <Maximize2 className="w-3 h-3 text-sky-400" />
                  </button>
                </>
              ) : (
                <span className="text-slate-400">Glissez-déposez un fichier .nc / .gcode ou choisissez un modèle</span>
              )}
            </div>
          </div>
        </div>

        {/* Boutons fichier + éditeur regroupés */}
        <div className="flex flex-wrap items-center gap-1.5">
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
            className="inline-flex items-center gap-1.5 min-h-8 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80 transition cursor-pointer disabled:opacity-40"
            title="Charger un fichier G-Code (.nc, .gcode, .tap, .ngc, .txt)"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Ouvrir</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSpoilboardModal(true)}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 min-h-8 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80 transition cursor-pointer disabled:opacity-40"
            title="Ouvrir le générateur de surfaçage martyr (Spoilboard Wizard)"
          >
            <Wand2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Surfaçage</span>
          </button>

          <div className="h-5 w-px bg-slate-800 mx-0.5" aria-hidden="true" />

          {!isEditing ? (
            <button
              type="button"
              onClick={() => {
                setDraftGCode(gcodeText);
                setIsEditing(true);
              }}
              disabled={isRunning}
              title="Éditer le programme complet (ou double-cliquez sur une ligne)"
              className="inline-flex items-center gap-1.5 min-h-8 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80 transition cursor-pointer disabled:opacity-40"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-300" />
              <span>Éditer</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSaveFullEdit}
                className="inline-flex items-center gap-1 min-h-8 px-2.5 py-1 rounded-lg text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Appliquer</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-1 min-h-8 px-2.5 py-1 rounded-lg text-xs bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Annuler</span>
              </button>
            </div>
          )}

          {hasGCode && (
            <button
              type="button"
              onClick={handleExportGCode}
              className="min-h-8 min-w-8 flex items-center justify-center rounded-lg bg-[#1b2436] hover:bg-[#243047] text-slate-200 hover:text-white border border-slate-700/80 transition cursor-pointer"
              title="Exporter le fichier G-Code (.nc)"
              aria-label="Exporter le G-Code"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Barre 2 : Contrôles contextuels d'exécution + Progression + Ligne active */}
      <div className="px-3 py-2.5 bg-[#141b27] border-b border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Boutons contextuels selon l'état */}
          <div className="flex flex-wrap items-center gap-1.5">
            {!isRunning && !isPaused ? (
              <>
                <button
                  type="button"
                  onClick={onStartJob}
                  disabled={!connected || !hasGCode}
                  className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Lancer</span>
                </button>

                <button
                  type="button"
                  onClick={handleFrameBoundingBox}
                  disabled={!connected}
                  className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-200 transition cursor-pointer disabled:opacity-40"
                  title="Ouvrir l'assistant de Cadrage / Framing (Vérification du brut et brides de serrage)"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Cadrage</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleCheckMode}
                  disabled={!connected}
                  aria-pressed={isCheckMode}
                  className={`inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer disabled:opacity-40 ${
                    isCheckMode
                      ? 'bg-amber-500/15 border-amber-400/50 text-amber-200'
                      : 'bg-[#1b2436] hover:bg-[#243047] border-slate-700/80 text-slate-200'
                  }`}
                  title="Activer/Désactiver le mode de vérification syntaxique GRBL ($C) sans mouvement moteur"
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${isCheckMode ? 'text-amber-300' : 'text-amber-400'}`} />
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
                    className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 transition cursor-pointer disabled:opacity-40"
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
                    className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-sky-400 hover:bg-sky-300 text-slate-950 ring-2 ring-sky-400/40 transition cursor-pointer disabled:opacity-40"
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
                  className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition cursor-pointer disabled:opacity-40"
                  title="Arrêter le programme"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Arrêter</span>
                </button>
              </>
            )}
          </div>

          {/* Statut & temps */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span
              className={`px-2 py-0.5 rounded-md font-bold uppercase text-[11px] tracking-wider border ${
                isPaused
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : isRunning
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  : job.state === 'completed'
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                  : job.state === 'error' || job.state === 'aborted'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                  : 'bg-[#090d14] text-slate-300 border-slate-700/80'
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

            <span className="font-mono text-slate-50 font-bold tabular-nums">
              {displayProgress.toFixed(1)}%
            </span>

            <span className="font-mono text-slate-400 text-[11px] tabular-nums">
              <strong className="text-slate-100">{job.acknowledgedLines}</strong>/{job.totalLines || lines.length}
            </span>

            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-300 tabular-nums" title="Temps écoulé / restant estimé">
              <Clock className="w-3 h-3 text-slate-400" />
              <strong className="text-slate-100">{formatDuration(liveElapsedMs)}</strong>
              <span className="text-slate-600">/</span>
              <strong className="text-amber-300">{formatDuration(job.estimatedRemainingMs)}</strong>
            </span>
          </div>
        </div>

        {/* Barre de progression fine */}
        <div className="w-full h-2 bg-[#090d14] rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-emerald-400 transition-all duration-200"
            style={{ width: `${displayProgress}%` }}
          />
        </div>

        {/* Ligne active compacte */}
        <div className="flex items-center justify-between gap-2 bg-[#090d14] px-2.5 py-1.5 rounded-lg border border-slate-800/90 text-xs font-mono">
          <div className="flex items-center gap-2 truncate min-w-0">
            <span className="text-sky-400 font-bold shrink-0">▶</span>
            <span className="text-slate-100 font-medium truncate">
              {job.currentCommand || lines[job.currentLineIndex] || (isRunning ? `Ligne #${job.currentLineIndex + 1}` : 'En attente de lancement')}
            </span>
          </div>
          {!isRunning && hasGCode && (
            <span className="hidden sm:inline text-[11px] font-sans text-slate-400 shrink-0">
              Double-clic sur une ligne pour éditer
            </span>
          )}
        </div>
      </div>

      {/* Corps : Éditeur texte complet OU Liste virtualisée haute performance */}
      <div
        ref={scrollContainerRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 min-h-[160px] overflow-y-auto bg-[#090d14] text-slate-200 font-mono text-xs select-text"
      >
        {isEditing ? (
          <textarea
            value={draftGCode}
            onChange={(e) => setDraftGCode(e.target.value)}
            spellCheck={false}
            className="w-full h-full min-h-[220px] p-3 bg-[#090d14] text-slate-100 placeholder:text-slate-500 font-mono text-xs focus:outline-none resize-none leading-relaxed"
            placeholder="Saisissez ou collez votre programme G-Code ici..."
          />
        ) : !hasGCode ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <Upload className="w-8 h-8 text-slate-500 mb-2.5" />
            <p className="text-sm font-semibold text-slate-200">
              Aucun programme G-Code chargé
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Glissez un fichier <code className="text-sky-300 bg-[#141b27] px-1 py-0.5 rounded font-semibold">.nc</code> ou{' '}
              <code className="text-sky-300 bg-[#141b27] px-1 py-0.5 rounded font-semibold">.gcode</code> ici, cliquez sur{' '}
              <strong className="text-slate-100">Ouvrir</strong> ou lancez le{' '}
              <strong className="text-slate-100">Surfaçage Martyr</strong>.
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
                    className={`group flex items-center px-2 border-b border-slate-800/70 ${
                      isCurrent
                        ? 'bg-sky-500/20 border-l-2 border-sky-400'
                        : isDone
                        ? 'bg-emerald-950/35 text-slate-400'
                        : 'hover:bg-[#141b27]'
                    }`}
                  >
                    {/* Numéro de ligne + statut */}
                    <div className="w-16 shrink-0 flex items-center gap-1 select-none text-[11px] text-slate-400 pr-2 border-r border-slate-800">
                      <span className="w-3 text-center">
                        {isCurrent ? (
                          <span className="text-sky-400 font-bold">▶</span>
                        ) : isDone ? (
                          <span className="text-emerald-400 font-bold">✓</span>
                        ) : null}
                      </span>
                      <span className="text-right flex-1 tabular-nums">{index + 1}</span>
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
                            className="flex-1 bg-[#141b27] border border-sky-400 rounded px-2 py-0 text-xs text-slate-100 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveSingleLine(index)}
                            className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold text-[11px]"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingLineIndex(null)}
                            className="px-2 py-0.5 rounded bg-[#1b2436] text-slate-200 border border-slate-700 text-[11px]"
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
                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-1 pl-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLineIndex(index);
                            setEditingLineValue(line);
                          }}
                          className="p-1 rounded hover:bg-[#1b2436] text-slate-300 hover:text-white"
                          title="Modifier cette ligne"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInsertLineAfter(index)}
                          className="p-1 rounded hover:bg-[#1b2436] text-slate-300 hover:text-emerald-400"
                          title="Insérer une ligne en dessous"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLine(index)}
                          className="p-1 rounded hover:bg-[#1b2436] text-slate-300 hover:text-rose-400"
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

      {/* Modale Générateur de Surfaçage Martyr (Spoilboard Wizard) */}
      {showSpoilboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-[#141b27] border border-slate-700 text-slate-100 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-3.5 bg-[#0f1520] border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-400">
                  <Wand2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-50">
                    Générateur de Surfaçage Martyr & Framing
                  </h3>
                  <p className="text-xs text-slate-300">
                    Créez un programme G-Code sur mesure pour surfacer votre plateau MDF
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSpoilboardModal(false)}
                className="min-h-8 min-w-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-[#1b2436]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div>
                <label className="block text-slate-200 font-semibold mb-1.5">
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
                      className={`min-h-9 py-2 px-3 rounded-lg font-semibold border text-center transition ${
                        wizardConfig.mode === opt.id
                          ? 'bg-sky-400 border-sky-300 text-slate-950 font-bold'
                          : 'bg-[#1b2436] border-slate-700/80 text-slate-200 hover:bg-[#243047]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">
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
                    className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">
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
                    className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                  />
                </div>
              </div>

              {wizardConfig.mode !== 'framing-only' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">
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
                        className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">
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
                        className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">
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
                        className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">
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
                        className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">
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
                    className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">
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
                    className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">
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
                    className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">
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
                    className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
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
                    className="rounded border-slate-600 bg-[#090d14] text-sky-400 focus:ring-sky-400"
                  />
                  <span className="text-slate-200">
                    Ajouter une passe de finition sur le périmètre extérieur
                  </span>
                </label>
              )}

              <div className="p-3 rounded-lg bg-[#090d14] border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-300">
                <span>
                  Pas latéral:{' '}
                  <strong className="text-sky-400">
                    {(
                      wizardConfig.toolDiameter *
                      (wizardConfig.stepoverPercent / 100)
                    ).toFixed(2)}{' '}
                    mm
                  </strong>
                </span>
                <span>
                  Passes Z:{' '}
                  <strong className="text-emerald-400">
                    {Math.max(
                      1,
                      Math.ceil(wizardConfig.totalDepth / wizardConfig.depthPerPass)
                    )}
                  </strong>
                </span>
                <span>
                  Origine: <strong className="text-amber-300">Avant-Gauche (X0 Y0)</strong>
                </span>
              </div>
            </div>

            <div className="px-5 py-3 bg-[#0f1520] border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSpoilboardModal(false)}
                className="min-h-9 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={generateSpoilboardGCode}
                className="inline-flex items-center gap-1.5 min-h-9 px-4 py-2 rounded-lg text-xs font-bold bg-sky-400 hover:bg-sky-300 text-slate-950 transition"
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
