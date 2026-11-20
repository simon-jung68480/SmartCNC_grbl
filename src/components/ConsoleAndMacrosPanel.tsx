import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Zap,
  Send,
  Trash2,
  Download,
  Plus,
  Edit3,
  RotateCcw,
  Check,
  X,
  EyeOff,
  Eye,
  Maximize2,
  Wrench,
  Crosshair,
  Disc,
  Home,
  RefreshCw,
  Play,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { ConsoleEntry, CustomMacro, Coordinates } from '../types/cnc';

const STORAGE_KEY_MACROS = 'smartcnc_custom_macros_v1';

export const DEFAULT_GRBL_MACROS: CustomMacro[] = [
  {
    id: 'macro-framing',
    name: 'Traçage Cadre (Framing)',
    icon: 'Maximize2',
    color: 'cyan',
    description: 'Parcourt le cadre de la pièce à Z5 pour vérifier le bridage',
    gcode: `G21 G90\nG0 Z5.000\nG0 X0.000 Y0.000\nG1 X100.000 Y0.000 F1500\nG1 X100.000 Y100.000 F1500\nG1 X0.000 Y100.000 F1500\nG1 X0.000 Y0.000 F1500`,
    confirmBeforeRun: false,
  },
  {
    id: 'macro-tool-change',
    name: "Changement d'outil (Position avant + Pause)",
    icon: 'Wrench',
    color: 'amber',
    description: 'Coupe la broche, dégage Z en haut et amène le portique à l’avant en pause M0',
    gcode: `M5\nG21 G90\nG53 G0 Z0.000\nG0 X0.000 Y0.000\nM0 ; Pause changement d'outil`,
    confirmBeforeRun: true,
  },
  {
    id: 'macro-z-probe-19mm',
    name: 'Palpage Z Rapide (Cale 19mm)',
    icon: 'Crosshair',
    color: 'emerald',
    description: 'Palpage Z G38.2 avec cale 19.0mm sur pin A5 (SCL)',
    gcode: `G21 G91\nG38.2 Z-25.000 F100\nG0 Z2.000\nG38.2 Z-4.000 F25\nG10 L20 P1 Z19.000\nG0 Z10.000\nG90`,
    confirmBeforeRun: true,
  },
  {
    id: 'macro-spindle-test',
    name: 'Test Broche 5s (M3 S5000)',
    icon: 'Disc',
    color: 'purple',
    description: 'Allume la broche PWM à 5000 RPM pendant 5 secondes puis coupe',
    gcode: `M3 S5000\nG4 P5.0\nM5`,
    confirmBeforeRun: true,
  },
  {
    id: 'macro-safe-home',
    name: 'Retour Origine Pièce Sécurisé',
    icon: 'Home',
    color: 'blue',
    description: 'Remonte Z à +10mm avant de revenir à X0 Y0 pièce',
    gcode: `G21 G90\nG0 Z10.000\nG0 X0.000 Y0.000`,
    confirmBeforeRun: false,
  },
  {
    id: 'macro-reset-g92',
    name: 'Prendre Origine Pièce Ici (XYZ=0)',
    icon: 'RefreshCw',
    color: 'rose',
    description: 'Définit X=0, Y=0 et Z=0 pièce à la position actuelle (G10 L20 P1)',
    gcode: `G10 L20 P1 X0.000 Y0.000 Z0.000`,
    confirmBeforeRun: false,
  },
];

const MACRO_COLORS: Record<
  string,
  { bg: string; border: string; text: string; badge: string }
> = {
  cyan: {
    bg: 'bg-[#0f1520] hover:bg-[#1b2436]',
    border: 'border-slate-800 hover:border-sky-500/40',
    text: 'text-sky-400',
    badge: 'bg-sky-500/15 text-sky-300 border border-sky-500/40',
  },
  amber: {
    bg: 'bg-[#0f1520] hover:bg-[#1b2436]',
    border: 'border-slate-800 hover:border-amber-500/40',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border border-amber-500/40',
  },
  emerald: {
    bg: 'bg-[#0f1520] hover:bg-[#1b2436]',
    border: 'border-slate-800 hover:border-emerald-500/40',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40',
  },
  purple: {
    bg: 'bg-[#0f1520] hover:bg-[#1b2436]',
    border: 'border-slate-800 hover:border-violet-500/40',
    text: 'text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border border-violet-500/40',
  },
  blue: {
    bg: 'bg-[#0f1520] hover:bg-[#1b2436]',
    border: 'border-slate-800 hover:border-blue-500/40',
    text: 'text-blue-400',
    badge: 'bg-blue-500/15 text-blue-300 border border-blue-500/40',
  },
  rose: {
    bg: 'bg-[#0f1520] hover:bg-[#1b2436]',
    border: 'border-slate-800 hover:border-rose-500/40',
    text: 'text-rose-400',
    badge: 'bg-rose-500/15 text-rose-300 border border-rose-500/40',
  },
};

const MACRO_ICONS: Record<string, React.FC<{ className?: string }>> = {
  Maximize2,
  Wrench,
  Crosshair,
  Disc,
  Home,
  RefreshCw,
  Zap,
  Sparkles,
};

export interface ConsoleAndMacrosPanelProps {
  connected: boolean;
  entries?: ConsoleEntry[];
  logs?: ConsoleEntry[];
  onSendCommand: (command: string) => void;
  onClearConsole?: () => void;
  macros?: CustomMacro[];
  onChangeMacros?: (macros: CustomMacro[]) => void;
  jobBounds?: {
    min: Coordinates;
    max: Coordinates;
    size: Coordinates;
  } | null;
}

export const ConsoleAndMacrosPanel: React.FC<ConsoleAndMacrosPanelProps> = ({
  connected,
  entries,
  logs,
  onSendCommand,
  onClearConsole,
  macros: externalMacros,
  onChangeMacros,
  jobBounds,
}) => {
  const consoleEntries = entries ?? logs ?? [];

  const [activeTab, setActiveTab] = useState<'console' | 'macros'>('console');
  const [mdiInput, setMdiInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([
    '$$',
    '$#',
    '$G',
    '$I',
    'G0 X0 Y0',
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [hideStatusReports, setHideStatusReports] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const [localMacros, setLocalMacros] = useState<CustomMacro[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MACROS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_GRBL_MACROS;
  });

  const activeMacros = externalMacros ?? localMacros;

  const updateMacros = (updated: CustomMacro[]) => {
    setLocalMacros(updated);
    try {
      localStorage.setItem(STORAGE_KEY_MACROS, JSON.stringify(updated));
    } catch {
      // ignore
    }
    onChangeMacros?.(updated);
  };

  const [editingMacro, setEditingMacro] = useState<CustomMacro | null>(null);
  const [isCreatingMacro, setIsCreatingMacro] = useState(false);
  const [confirmingMacro, setConfirmingMacro] = useState<CustomMacro | null>(null);

  const filteredEntries = useMemo(() => {
    if (!hideStatusReports) return consoleEntries;
    return consoleEntries.filter(
      (item) =>
        item.type !== 'status' &&
        !item.text.trim().startsWith('<') &&
        item.text.trim() !== '?'
    );
  }, [consoleEntries, hideStatusReports]);

  useEffect(() => {
    if (autoScroll && activeTab === 'console') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredEntries.length, autoScroll, activeTab]);

  const handleSendMdi = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = mdiInput.trim();
    if (!cmd) return;
    onSendCommand(cmd);
    setCommandHistory((prev) => {
      const filtered = prev.filter((c) => c !== cmd);
      return [cmd, ...filtered].slice(0, 50);
    });
    setHistoryIndex(-1);
    setMdiInput('');
  };

  const handleMdiKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = Math.min(commandHistory.length - 1, historyIndex + 1);
      setHistoryIndex(nextIdx);
      setMdiInput(commandHistory[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setMdiInput('');
      } else {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setMdiInput(commandHistory[nextIdx]);
      }
    }
  };

  const handleExportLogs = () => {
    const content = filteredEntries
      .map(
        (e) =>
          `[${e.timestamp}] [${e.type.toUpperCase()}] ${e.text}${
            e.detail ? ` (${e.detail})` : ''
          }`
      )
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartcnc_console_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const executeMacroLines = (macro: CustomMacro) => {
    if (macro.id === 'macro-framing' && jobBounds && jobBounds.size.x > 0) {
      const { min, max } = jobBounds;
      const dynamicFraming = [
        'G21 G90',
        'G0 Z5.000',
        `G0 X${min.x.toFixed(3)} Y${min.y.toFixed(3)}`,
        `G1 X${max.x.toFixed(3)} Y${min.y.toFixed(3)} F1500`,
        `G1 X${max.x.toFixed(3)} Y${max.y.toFixed(3)} F1500`,
        `G1 X${min.x.toFixed(3)} Y${max.y.toFixed(3)} F1500`,
        `G1 X${min.x.toFixed(3)} Y${min.y.toFixed(3)} F1500`,
      ];
      dynamicFraming.forEach((line) => onSendCommand(line));
      setConfirmingMacro(null);
      return;
    }

    const lines = macro.gcode
      .split(/\r?\n/)
      .map((l) => l.split(';')[0].trim())
      .filter(Boolean);

    lines.forEach((line) => onSendCommand(line));
    setConfirmingMacro(null);
  };

  const handleTriggerMacro = (macro: CustomMacro) => {
    if (!connected) return;
    if (macro.confirmBeforeRun) {
      setConfirmingMacro(macro);
    } else {
      executeMacroLines(macro);
    }
  };

  const handleSaveMacro = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMacro || !editingMacro.name.trim() || !editingMacro.gcode.trim()) return;

    if (isCreatingMacro) {
      updateMacros([...activeMacros, editingMacro]);
    } else {
      updateMacros(
        activeMacros.map((m) => (m.id === editingMacro.id ? editingMacro : m))
      );
    }
    setEditingMacro(null);
    setIsCreatingMacro(false);
  };

  const handleDeleteMacro = (id: string) => {
    updateMacros(activeMacros.filter((m) => m.id !== id));
    if (editingMacro?.id === id) {
      setEditingMacro(null);
    }
  };

  const handleResetDefaultMacros = () => {
    updateMacros(DEFAULT_GRBL_MACROS);
  };

  const getBadgeStyle = (type: ConsoleEntry['type']) => {
    switch (type) {
      case 'tx':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
      case 'ok':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
      case 'rx':
        return 'bg-slate-800 text-slate-200 border-slate-700';
      case 'error':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
      case 'alarm':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
      case 'info':
      default:
        return 'bg-[#1b2436] text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#141b27] border border-slate-800 text-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.28)] rounded-xl overflow-hidden">
      {/* Barre d'onglets Console / Macros */}
      <div className="px-3 py-2 bg-[#0f1520] border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-[#090d14] p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('console')}
            aria-pressed={activeTab === 'console'}
            className={`inline-flex items-center gap-1.5 min-h-8 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'console'
                ? 'bg-[#1b2436] text-slate-50 border border-slate-700 shadow-xs'
                : 'text-slate-300 hover:text-white border border-transparent'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>Console</span>
            <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-[#090d14] text-slate-200 tabular-nums border border-slate-800">
              {filteredEntries.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('macros')}
            aria-pressed={activeTab === 'macros'}
            className={`inline-flex items-center gap-1.5 min-h-8 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'macros'
                ? 'bg-[#1b2436] text-slate-50 border border-slate-700 shadow-xs'
                : 'text-slate-300 hover:text-white border border-transparent'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Macros</span>
            <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-[#090d14] text-slate-200 tabular-nums border border-slate-800">
              {activeMacros.length}
            </span>
          </button>
        </div>

        {/* Actions contextuelles selon l'onglet */}
        {activeTab === 'console' ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHideStatusReports((v) => !v)}
              aria-pressed={!hideStatusReports}
              className={`inline-flex items-center gap-1.5 min-h-8 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                hideStatusReports
                  ? 'bg-[#1b2436] border-slate-700/80 text-slate-200 hover:bg-[#243047]'
                  : 'bg-sky-500/15 border-sky-400/50 text-sky-200'
              }`}
              title="Masquer/Afficher les trames de statut périodiques (? / <Idle|...>)"
            >
              {hideStatusReports ? (
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span className="hidden sm:inline">Masquer ?</span>
            </button>

            <button
              type="button"
              onClick={handleExportLogs}
              disabled={filteredEntries.length === 0}
              className="min-h-8 min-w-8 flex items-center justify-center rounded-lg bg-[#1b2436] hover:bg-[#243047] text-slate-200 hover:text-white border border-slate-700/80 transition-colors cursor-pointer disabled:opacity-40"
              title="Exporter l'historique de la console (.log)"
              aria-label="Exporter l'historique de la console"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {onClearConsole && (
              <button
                type="button"
                onClick={onClearConsole}
                className="min-h-8 min-w-8 flex items-center justify-center rounded-lg bg-[#1b2436] hover:bg-rose-950/60 text-slate-200 hover:text-rose-300 border border-slate-700/80 hover:border-rose-500/50 transition-colors cursor-pointer"
                title="Vider la console"
                aria-label="Vider la console"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setIsCreatingMacro(true);
                setEditingMacro({
                  id: `macro-${Date.now()}`,
                  name: 'Nouvelle Macro CNC',
                  icon: 'Zap',
                  color: 'cyan',
                  description: 'Description de la macro personnalisée',
                  gcode: 'G21 G90\nG0 Z5.000',
                  confirmBeforeRun: false,
                });
              }}
              className="inline-flex items-center gap-1 min-h-8 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Macro</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefaultMacros}
              className="inline-flex items-center gap-1.5 min-h-8 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80 transition-colors cursor-pointer"
              title="Réinitialiser les macros d'usine"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Défaut</span>
            </button>
          </div>
        )}
      </div>

      {/* CONTENU ONGLET 1 : CONSOLE SERIE GRBL */}
      {activeTab === 'console' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Barre de commandes système GRBL sur 1 ligne */}
          <div className="px-3 py-2 bg-[#141b27] border-b border-slate-800 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              GRBL :
            </span>
            {[
              { cmd: '$$', title: '$$ — Afficher tous les paramètres EEPROM GRBL' },
              { cmd: '$#', title: '$# — Afficher les décalages G54..G59, G28, G92' },
              { cmd: '$G', title: '$G — Afficher l’état du parseur G-Code' },
              { cmd: '$I', title: '$I — Afficher les informations de build GRBL' },
              { cmd: '$C', title: '$C — Activer / désactiver le mode test sans mouvement' },
              { cmd: '$X', title: '$X — Déverrouiller GRBL après alarme' },
            ].map((q) => (
              <button
                key={q.cmd}
                type="button"
                disabled={!connected}
                onClick={() => onSendCommand(q.cmd)}
                title={q.title}
                className="min-h-8 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-[#1b2436] hover:bg-[#243047] text-slate-100 border border-slate-700/80 transition-colors cursor-pointer disabled:opacity-40"
              >
                {q.cmd}
              </button>
            ))}
          </div>

          {/* Terminal temps réel */}
          <div
            className="flex-1 min-h-[150px] overflow-y-auto p-3 bg-[#090d14] border-b border-slate-800 text-slate-100 font-mono text-xs space-y-1 select-text"
            onScroll={(e) => {
              const el = e.currentTarget;
              const isNearBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight < 40;
              setAutoScroll(isNearBottom);
            }}
          >
            {filteredEntries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center px-4">
                En attente de communication série avec l'Arduino Uno (115200 bauds)...
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 leading-relaxed hover:bg-[#141b27]/80 px-2 py-0.5 rounded-md"
                >
                  <span className="text-[11px] text-slate-400 shrink-0 select-none pt-0.5 tabular-nums">
                    {entry.timestamp}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0 select-none ${getBadgeStyle(
                      entry.type
                    )}`}
                  >
                    {entry.type}
                  </span>
                  <div className="flex-1 min-w-0 break-all">
                    <span
                      className={
                        entry.type === 'error'
                          ? 'text-rose-300 font-semibold'
                          : entry.type === 'alarm'
                          ? 'text-amber-300 font-semibold'
                          : entry.type === 'tx'
                          ? 'text-sky-300 font-medium'
                          : entry.type === 'ok'
                          ? 'text-emerald-300 font-medium'
                          : 'text-slate-100'
                      }
                    >
                      {entry.text}
                    </span>
                    {entry.detail && (
                      <span className="ml-2 text-[11px] text-slate-300 italic">
                        — {entry.detail}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>

          {/* Champ de commande manuelle MDI */}
          <form
            onSubmit={handleSendMdi}
            className="p-2.5 bg-[#0f1520] flex items-center gap-2"
          >
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-sky-400 pointer-events-none">
                &gt;
              </span>
              <input
                type="text"
                value={mdiInput}
                onChange={(e) => setMdiInput(e.target.value)}
                onKeyDown={handleMdiKeyDown}
                disabled={!connected}
                placeholder={
                  connected
                    ? 'Commande MDI (G0 X10, $$, M3 S10000...)'
                    : 'Connectez la CNC pour envoyer des commandes MDI...'
                }
                className="w-full min-h-9 bg-[#090d14] focus:bg-[#0b1019] border border-slate-700 focus:border-sky-400 rounded-lg pl-7 pr-16 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-400 focus:outline-none disabled:opacity-50"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400 pointer-events-none">
                ↑/↓ Hist.
              </span>
            </div>
            <button
              type="submit"
              disabled={!connected || !mdiInput.trim()}
              className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-sky-400 hover:bg-sky-300 text-slate-950 transition-colors cursor-pointer disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Envoyer</span>
            </button>
          </form>
        </div>
      )}

      {/* CONTENU ONGLET 2 : MACROS PERSONNALISEES */}
      {activeTab === 'macros' && (
        <div className="flex-1 p-3 overflow-y-auto bg-[#090d14]/40">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
            {activeMacros.map((macro) => {
              const style = MACRO_COLORS[macro.color] || MACRO_COLORS.cyan;
              const IconComponent = MACRO_ICONS[macro.icon] || Zap;

              return (
                <div
                  key={macro.id}
                  className={`group relative flex flex-col justify-between p-3 rounded-xl border ${style.border} bg-[#0f1520] transition-colors text-slate-100 shadow-sm`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${style.badge}`}>
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-50 leading-snug truncate">
                          {macro.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingMacro(false);
                            setEditingMacro({ ...macro });
                          }}
                          className="min-h-7 min-w-7 flex items-center justify-center rounded-md hover:bg-[#1b2436] text-slate-300 hover:text-white cursor-pointer"
                          title="Modifier cette macro"
                          aria-label={`Modifier ${macro.name}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMacro(macro.id)}
                          className="min-h-7 min-w-7 flex items-center justify-center rounded-md hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 cursor-pointer"
                          title="Supprimer cette macro"
                          aria-label={`Supprimer ${macro.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300 mb-2 line-clamp-2 leading-snug">
                      {macro.description}
                    </p>

                    <div
                      title={macro.gcode}
                      className="px-2.5 py-1.5 rounded-lg bg-[#090d14] border border-slate-800 text-[11px] font-mono text-slate-300 line-clamp-2 mb-2.5 whitespace-pre-wrap"
                    >
                      {macro.gcode}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!connected}
                    onClick={() => handleTriggerMacro(macro)}
                    className="w-full min-h-9 py-1.5 px-3 rounded-lg bg-[#1b2436] hover:bg-[#243047] text-xs font-bold text-slate-100 border border-slate-700/80 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Play className={`w-3.5 h-3.5 ${style.text} fill-current`} />
                    <span>Exécuter</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modale de confirmation avant exécution de macro sensible */}
      {confirmingMacro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-[#141b27] border border-slate-700 shadow-2xl rounded-2xl max-w-md w-full p-5 space-y-4 text-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/40">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-50">
                  Confirmer l'exécution de la macro
                </h4>
                <p className="text-xs text-slate-300">{confirmingMacro.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-200">{confirmingMacro.description}</p>

            <pre className="p-3 rounded-xl bg-[#090d14] border border-slate-800 text-xs font-mono text-sky-300 overflow-x-auto">
              {confirmingMacro.gcode}
            </pre>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingMacro(null)}
                className="min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] border border-slate-700/80 text-slate-100 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => executeMacroLines(confirmingMacro)}
                className="inline-flex items-center gap-1.5 min-h-9 px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirmer et Exécuter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de Création / Édition de Macro */}
      {editingMacro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <form
            onSubmit={handleSaveMacro}
            className="bg-[#141b27] border border-slate-700 shadow-2xl rounded-2xl max-w-lg w-full overflow-hidden text-slate-100"
          >
            <div className="px-5 py-3.5 bg-[#0f1520] border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-50">
                {isCreatingMacro ? 'Créer une Macro CNC' : 'Modifier la Macro CNC'}
              </h4>
              <button
                type="button"
                onClick={() => setEditingMacro(null)}
                className="min-h-8 min-w-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-[#1b2436] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-200 font-semibold mb-1">
                  Nom de la macro
                </label>
                <input
                  type="text"
                  required
                  value={editingMacro.name}
                  onChange={(e) =>
                    setEditingMacro({ ...editingMacro, name: e.target.value })
                  }
                  className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    Couleur du bouton
                  </label>
                  <select
                    value={editingMacro.color}
                    onChange={(e) =>
                      setEditingMacro({ ...editingMacro, color: e.target.value })
                    }
                    className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  >
                    <option value="cyan">Bleu Ciel</option>
                    <option value="amber">Ambre Attention</option>
                    <option value="emerald">Vert Palpage</option>
                    <option value="purple">Violet Broche</option>
                    <option value="blue">Bleu Origine</option>
                    <option value="rose">Rose Reset</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    Icône
                  </label>
                  <select
                    value={editingMacro.icon}
                    onChange={(e) =>
                      setEditingMacro({ ...editingMacro, icon: e.target.value })
                    }
                    className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  >
                    <option value="Maximize2">Cadre (Maximize2)</option>
                    <option value="Wrench">Clé Outil (Wrench)</option>
                    <option value="Crosshair">Cible Palpeur (Crosshair)</option>
                    <option value="Disc">Broche (Disc)</option>
                    <option value="Home">Origine (Home)</option>
                    <option value="RefreshCw">Reset (RefreshCw)</option>
                    <option value="Zap">Éclair (Zap)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-200 font-semibold mb-1">
                  Description courte
                </label>
                <input
                  type="text"
                  value={editingMacro.description}
                  onChange={(e) =>
                    setEditingMacro({ ...editingMacro, description: e.target.value })
                  }
                  className="w-full min-h-9 bg-[#090d14] border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-200 font-semibold mb-1">
                  Script G-Code multi-lignes
                </label>
                <textarea
                  rows={5}
                  required
                  value={editingMacro.gcode}
                  onChange={(e) =>
                    setEditingMacro({ ...editingMacro, gcode: e.target.value })
                  }
                  className="w-full bg-[#090d14] border border-slate-700 rounded-lg p-3 font-mono text-xs text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(editingMacro.confirmBeforeRun)}
                  onChange={(e) =>
                    setEditingMacro({
                      ...editingMacro,
                      confirmBeforeRun: e.target.checked,
                    })
                  }
                  className="rounded border-slate-600 bg-[#090d14] text-sky-400"
                />
                <span className="text-slate-200">
                  Demander une confirmation avant d'exécuter cette macro
                </span>
              </label>
            </div>

            <div className="px-5 py-3 bg-[#0f1520] border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingMacro(null)}
                className="min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] border border-slate-700/80 text-slate-100 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 min-h-9 px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Enregistrer</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ConsoleAndMacrosPanel;
