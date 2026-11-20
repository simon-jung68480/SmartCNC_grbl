import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Cpu,
  Usb,
  RefreshCw,
  Power,
  PowerOff,
  Settings,
  AlertOctagon,
  Pause,
  Play,
  Smartphone,
  HelpCircle,
  CheckCircle2,
  X,
  Wifi,
  ShieldAlert,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  GrblStatus,
  SerialPortInfo,
  JobStatus,
  ConsoleEntry,
  GrblSettingItem,
  HeightmapGrid,
  ProbeConfig,
} from './types/cnc';
import { parseGCode, applyHeightmapToGCode } from './utils/gcodeParser';
import { Viewport3D } from './components/Viewport3D';
import { DROPanel } from './components/DROPanel';
import { JogPanel } from './components/JogPanel';
import { OverridesAndToolsTabs } from './components/OverridesAndToolsTabs';
import { GCodeStreamerPanel, BUILTIN_SAMPLE_FILES } from './components/GCodeStreamerPanel';
import { ConsoleAndMacrosPanel } from './components/ConsoleAndMacrosPanel';
import { GrblSettingsModal } from './components/GrblSettingsModal';
import { MobilePendantView } from './components/MobilePendantView';
import { SoundSettingsModal } from './components/SoundSettingsModal';
import { FramingModal } from './components/FramingModal';
import { LaserWorkshop } from './components/LaserWorkshop';
import {
  playProbeContactBeep,
  playJobCompleteMelody,
  playAlarmAlert,
  playJogClick,
  useAudioAlertSettings,
} from './utils/audioAlerts';
import { useLayoutResizer } from "./components/LayoutResizers";
import { CncLayoutDialog, CncWorkspace, useCncPanelLayout } from "./components/CncPanelLayout";
import { useAppPreferences } from './utils/appPreferences';

const INITIAL_STATUS: GrblStatus = {
  connected: false,
  portPath: 'SIMULATOR',
  baudRate: 115200,
  isSimulator: true,
  state: 'Disconnected',
  mpos: { x: 0, y: 0, z: 0 },
  wpos: { x: 0, y: 0, z: 0 },
  wco: { x: 0, y: 0, z: 0 },
  activeWCS: 'G54',
  unit: 'mm',
  distanceMode: 'G90',
  feedRate: 0,
  spindleSpeed: 0,
  overrides: { feed: 100, rapid: 100, spindle: 100 },
  accessories: {
    spindleCw: false,
    spindleCcw: false,
    floodCoolant: false,
    mistCoolant: false,
  },
  pins: {
    xLimit: false,
    yLimit: false,
    zLimit: false,
    probe: false,
    door: false,
    hold: false,
    softReset: false,
    cycleStart: false,
  },
  buffer: {
    plannerBlocksAvailable: 15,
    rxBytesAvailable: 128,
  },
  version: 'Grbl 1.1h',
};

const INITIAL_JOB: JobStatus = {
  state: 'idle',
  fileName: BUILTIN_SAMPLE_FILES[0].name,
  totalLines: 0,
  sentLines: 0,
  acknowledgedLines: 0,
  currentLineIndex: 0,
  currentCommand: '',
  progressPercent: 0,
  startTime: null,
  elapsedMs: 0,
  estimatedRemainingMs: null,
  rxBufferUsed: 0,
  rxBufferMax: 128,
  heightmapApplied: false,
};

const checkIsPendantFromUrl = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('mode') === 'pendant' ||
    params.get('pendant') === '1' ||
    params.get('pendant') === 'true'
  );
};

export const App: React.FC = () => {
  const [isPendantMode, setIsPendantMode] = useState<boolean>(() => checkIsPendantFromUrl());
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);

  const [status, setStatus] = useState<GrblStatus>(INITIAL_STATUS);
  const [ports, setPorts] = useState<SerialPortInfo[]>([
    {
      path: 'SIMULATOR',
      friendlyName: 'Simulateur GRBL 1.1 (Sans Arduino)',
      isArduino: true,
    },
  ]);
  const [selectedPort, setSelectedPort] = useState<string>('SIMULATOR');
  const [selectedBaud, setSelectedBaud] = useState<number>(115200);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  const [job, setJob] = useState<JobStatus>(INITIAL_JOB);
  const [fileName, setFileName] = useState<string>(BUILTIN_SAMPLE_FILES[0].name);
  const [rawGCode, setRawGCode] = useState<string>(BUILTIN_SAMPLE_FILES[0].gcode);

  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [grblSettings, setGrblSettings] = useState<GrblSettingItem[]>([]);
  const [heightmap, setHeightmap] = useState<HeightmapGrid | undefined>(undefined);
  const [probeConfig, setProbeConfig] = useState<ProbeConfig>({
    mode: 'Z',
    directionX: 1,
    directionY: 1,
    plateThicknessZ: 19.0,
    plateThicknessXY: 10.0,
    toolDiameter: 3.175,
    maxSearchDistance: 25,
    fastFeedRate: 120,
    slowFeedRate: 30,
    retractDistance: 2.0,
    finalSafeZ: 10.0,
  });

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isPinoutModalOpen, setIsPinoutModalOpen] = useState<boolean>(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState<boolean>(false);
  const [isSoundModalOpen, setIsSoundModalOpen] = useState<boolean>(false);
  const [isFramingModalOpen, setIsFramingModalOpen] = useState<boolean>(false);
  const { settings: audioSettings } = useAudioAlertSettings();
  const [networkInfo, setNetworkInfo] = useState<{
    hostname: string;
    port: number;
    ips: string[];
    urls: string[];
    primaryUrl: string;
  } | null>(null);

  const [workshop, setWorkshop] = useState<'cnc' | 'laser'>('cnc');


  const setPendantModeWithUrl = useCallback((active: boolean) => {
    setIsPendantMode(active);
    if (typeof window !== 'undefined' && window.history) {
      const url = new URL(window.location.href);
      if (active) {
        url.searchParams.set('mode', 'pendant');
      } else {
        url.searchParams.delete('mode');
        url.searchParams.delete('pendant');
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setIsPendantMode(checkIsPendantFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Redimensionnement fluide des colonnes et panneaux (enregistré dans localStorage)
  const workspaceContainerRef = useRef<HTMLElement | null>(null);
  const layoutSizes = useLayoutResizer(workspaceContainerRef);
  const { panelLayout, setPanelLayout, resetPanels } = useCncPanelLayout();
  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  const resetLayout = () => { layoutSizes.resetAll(); resetPanels(); };

  // Préférences utilisateur (Zoom, Hauteur grille 3D, Sécurité, Sons, etc.)
  const { preferences } = useAppPreferences();

  // If heightmap compensation is enabled and has probed points, compute compensated G-code
  const effectiveGCode = useMemo(() => {
    if (
      heightmap &&
      heightmap.enabled &&
      heightmap.points.length >= 4 &&
      heightmap.points.every((p) => p.z !== null)
    ) {
      return applyHeightmapToGCode(rawGCode, heightmap);
    }
    return rawGCode;
  }, [rawGCode, heightmap]);

  // Parse G-code for 3D Viewport and statistics
  const parsedGCode = useMemo(() => {
    return parseGCode(effectiveGCode, fileName);
  }, [effectiveGCode, fileName]);

  // Machine work envelope extracted from GRBL settings ($130, $131, $132)
  const machineEnvelope = useMemo(() => {
    const s130 = grblSettings.find((s) => s.id === 130)?.value || 300;
    const s131 = grblSettings.find((s) => s.id === 131)?.value || 300;
    const s132 = grblSettings.find((s) => s.id === 132)?.value || 80;
    return { x: s130, y: s131, z: s132 };
  }, [grblSettings]);

  // Connect Socket.IO to backend
  useEffect(() => {
    const s = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });
    setSocket(s);

    s.on('connect', () => {
      setSocketConnected(true);
      s.emit('cnc:ports:list');
    });

    s.on('disconnect', () => {
      setGrblSettings([]);
      setSocketConnected(false);
    });

    s.on('cnc:status', (newStatus: GrblStatus) => {
      setStatus(newStatus);
      if (!newStatus.connected) setGrblSettings([]);
      if (newStatus.connected && newStatus.portPath) {
        setSelectedPort(newStatus.portPath);
      }
    });

    s.on('cnc:ports', (portList: SerialPortInfo[]) => {
      if (Array.isArray(portList) && portList.length > 0) {
        setPorts(portList);
        const realArduino = portList.find((p) => p.isArduino && p.path !== 'SIMULATOR');
        if (realArduino && !status.connected) {
          setSelectedPort(realArduino.path);
        }
      }
    });

    s.on('cnc:job', (newJob: JobStatus) => {
      setJob(newJob);
    });

    s.on('cnc:console', (entry: ConsoleEntry) => {
      setConsoleLogs((prev) => {
        const next = [...prev, entry];
        return next.length > 400 ? next.slice(next.length - 400) : next;
      });
    });

    s.on('cnc:settings', (settingsList: GrblSettingItem[]) => {
      if (Array.isArray(settingsList)) {
        setGrblSettings(settingsList);
      }
    });

    s.on('cnc:heightmap', (grid: HeightmapGrid) => {
      if (grid) {
        setHeightmap(grid);
      }
    });

    fetch('/api/network-info')
      .then((r) => r.json())
      .then((info) => setNetworkInfo(info))
      .catch(() => {});

    return () => {
      s.disconnect();
    };
  }, []);

  // =========================================================================
  // SURVEILLANCE & DÉCLENCHEMENT DES SIGNAUX SONORES D'ATELIER (Web Audio API)
  // =========================================================================
  const prevProbePinRef = useRef<boolean>(false);
  const prevJobRunningRef = useRef<boolean>(false);
  const prevJobCompletedRef = useRef<boolean>(false);
  const prevAlarmStateRef = useRef<boolean>(false);
  const prevLimitSwitchRef = useRef<boolean>(false);

  // 1. Contact de sonde (Touch Plate Z) : Bip aigu instantané dès que status.pins.probe passe à true
  useEffect(() => {
    const isProbeActive = Boolean(status.pins?.probe);
    if (isProbeActive && !prevProbePinRef.current) {
      playProbeContactBeep();
    }
    prevProbePinRef.current = isProbeActive;
  }, [status.pins?.probe]);

  // 2. Fin d'usinage (Job Completed) : Carillon de succès 3 notes quand le travail arrive à 100%
  useEffect(() => {
    const isJobRunning = job.state === 'running';
    const isCompletedState = job.state === 'completed';
    const isAllLinesAcked = job.totalLines > 0 && job.acknowledgedLines >= job.totalLines;

    // Réinitialisation si un nouveau travail commence
    if (job.state === 'idle' || job.acknowledgedLines === 0) {
      prevJobCompletedRef.current = false;
    }

    if (
      !prevJobCompletedRef.current &&
      (isCompletedState || (isAllLinesAcked && (prevJobRunningRef.current || isJobRunning)))
    ) {
      playJobCompleteMelody();
      prevJobCompletedRef.current = true;
    }

    prevJobRunningRef.current = isJobRunning;
  }, [job.state, job.acknowledgedLines, job.totalLines]);

  // 3. Alarme GRBL / Fin de course percuté : Tonalité d'alerte d'urgence
  useEffect(() => {
    const isAlarm = status.state === 'Alarm';
    const isLimitHit = Boolean(
      status.pins?.xLimit || status.pins?.yLimit || status.pins?.zLimit
    );

    if ((isAlarm && !prevAlarmStateRef.current) || (isLimitHit && !prevLimitSwitchRef.current)) {
      playAlarmAlert();
    }

    prevAlarmStateRef.current = isAlarm;
    prevLimitSwitchRef.current = isLimitHit;
  }, [
    status.state,
    status.pins?.xLimit,
    status.pins?.yLimit,
    status.pins?.zLimit,
  ]);

  const refreshPorts = useCallback(() => {
    socket?.emit('cnc:ports:list');
  }, [socket]);

  const handleConnectToggle = useCallback(() => {
    if (!socket) return;
    if (status.connected) {
      socket.emit('cnc:disconnect');
    } else {
      setIsConnecting(true);
      socket.emit(
        'cnc:connect',
        { portPath: selectedPort, baudRate: selectedBaud },
        () => {
          setIsConnecting(false);
        }
      );
    }
  }, [socket, status.connected, selectedPort, selectedBaud]);

  const handleSendCommand = useCallback(
    (command: string) => {
      if (!socket || !command.trim()) return;
      const lines = command
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      for (const line of lines) {
        socket.emit('cnc:command', line);
      }
    },
    [socket]
  );

  const handleSendRealtime = useCallback(
    (byteOrChar: number | string) => {
      if (!socket) return;
      socket.emit('cnc:realtime', byteOrChar);
    },
    [socket]
  );

  const handleZeroWorkAxis = useCallback(
    (axis: 'X' | 'Y' | 'Z' | 'XY' | 'ALL') => {
      socket?.emit('cnc:zero', axis);
    },
    [socket]
  );

  const handleSetMachineZero = useCallback(() => {
    socket?.emit('cnc:setMachineZero');
  }, [socket]);

  const handleSoftReset = useCallback(() => {
    socket?.emit('cnc:reset');
  }, [socket]);

  const handleJog = useCallback(
    (axes: { x?: number; y?: number; z?: number }, feedRate: number) => {
      playJogClick();
      socket?.emit('cnc:jog', {
        ...axes,
        feedRate,
        distanceMode: 'G91',
      });
    },
    [socket]
  );

  const handleCancelJog = useCallback(() => {
    socket?.emit('cnc:jogCancel');
  }, [socket]);

  const handleLoadGCode = useCallback((name: string, content: string) => {
    setFileName(name);
    setRawGCode(content);
    setJob((prev) => ({
      ...prev,
      state: 'idle',
      fileName: name,
      sentLines: 0,
      acknowledgedLines: 0,
      currentLineIndex: 0,
      progressPercent: 0,
      elapsedMs: 0,
      estimatedRemainingMs: null,
    }));
  }, []);

  const handleStartJob = useCallback(() => {
    if (!socket) return;
    socket.emit('cnc:job:start', {
      fileName,
      gcode: effectiveGCode,
      applyHeightmap: Boolean(heightmap?.enabled),
    });
  }, [socket, fileName, effectiveGCode, heightmap]);

  const handlePauseJob = useCallback(() => {
    socket?.emit('cnc:job:pause');
  }, [socket]);

  const handleResumeJob = useCallback(() => {
    socket?.emit('cnc:job:resume');
  }, [socket]);

  const handleStopJob = useCallback(() => {
    socket?.emit('cnc:job:stop');
  }, [socket]);

  const handleToggleCheckMode = useCallback(() => {
    handleSendCommand('$C');
  }, [handleSendCommand]);

  const handleOpenFraming = useCallback(() => {
    setIsFramingModalOpen(true);
  }, []);

  const handleFrameJob = useCallback(() => {
    setIsFramingModalOpen(true);
  }, []);

  const handleStartProbe = useCallback(
    (cfg: ProbeConfig) => {
      setProbeConfig(cfg);
      socket?.emit('cnc:probe:run', cfg);
    },
    [socket]
  );

  const handleHeightmapChange = useCallback(
    (grid: HeightmapGrid) => {
      setHeightmap(grid);
      socket?.emit('cnc:heightmap:set', grid);
    },
    [socket]
  );

  const handleStartHeightmapScan = useCallback(
    (grid: HeightmapGrid) => {
      setHeightmap(grid);
      socket?.emit('cnc:heightmap:scan', grid);
    },
    [socket]
  );

  const handleGenerateDemoHeightmap = useCallback(() => {
    const minX = parsedGCode.stats ? Math.floor(parsedGCode.stats.bounds.min.x) : 0;
    const maxX = parsedGCode.stats ? Math.ceil(parsedGCode.stats.bounds.max.x) || 100 : 100;
    const minY = parsedGCode.stats ? Math.floor(parsedGCode.stats.bounds.min.y) : 0;
    const maxY = parsedGCode.stats ? Math.ceil(parsedGCode.stats.bounds.max.y) || 80 : 80;
    const cols = 5;
    const rows = 5;
    const points: HeightmapGrid['points'] = [];

    for (let r = 0; r < rows; r++) {
      const y = minY + (r / (rows - 1)) * (maxY - minY);
      for (let c = 0; c < cols; c++) {
        const x = minX + (c / (cols - 1)) * (maxX - minX);
        const nx = (c / (cols - 1)) * 2 - 1;
        const ny = (r / (rows - 1)) * 2 - 1;
        const z = Number(
          (0.28 * Math.sin(nx * 1.6) + 0.18 * Math.cos(ny * 1.5) - 0.12 * nx * ny).toFixed(3)
        );
        points.push({
          row: r,
          col: c,
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          z,
          probed: true,
        });
      }
    }

    const demoGrid: HeightmapGrid = {
      minX,
      maxX,
      minY,
      maxY,
      cols,
      rows,
      clearanceZ: 5,
      probeDepthZ: -10,
      feedRate: 80,
      points,
      isScanning: false,
      enabled: true,
    };
    setHeightmap(demoGrid);
    socket?.emit('cnc:heightmap:set', demoGrid);
  }, [parsedGCode.stats, socket]);

  const handleSaveGrblSettings = useCallback(
    (changes: { id: number; code: string; value: number }[]) => {
      if (!socket) return;
      socket.emit('cnc:settings:set', {
        settings: changes.map((c) => ({ id: c.id, value: c.value })),
      });
    },
    [socket]
  );

  const isPaused = job.state === 'paused' || status.state.startsWith('Hold');
  const isRunning = (job.state === 'running' || status.state === 'Run') && !isPaused;

  if (isPendantMode) {
    return (
      <MobilePendantView
        status={status}
        onSendCommand={handleSendCommand}
        onSendRealtime={handleSendRealtime}
        onSoftReset={handleSoftReset}
        onZeroWorkAxis={handleZeroWorkAxis}
        onSetMachineZero={handleSetMachineZero}
        onJog={handleJog}
        onCancelJog={handleCancelJog}
        onPauseJob={handlePauseJob}
        onResumeJob={handleResumeJob}
        probeConfig={probeConfig}
        onProbeConfigChange={setProbeConfig}
        onStartProbe={handleStartProbe}
        onExitPendant={() => setPendantModeWithUrl(false)}
        useHoming={preferences.useHoming}
      />
    );
  }

  return (
    <div className="smartcnc-shell flex flex-col bg-slate-100 text-slate-900 overflow-hidden select-none">
      {/* =====================================================================
          TOP HEADER BAR — MODE CLAIR SOBRE & UTILITAIRE
      ===================================================================== */}
      <header className="shrink-0 bg-white border-b border-slate-300 px-2 py-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 z-30 shadow-xs">
        {/* Left: Brand & USB Connection */}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm text-slate-900">SmartCNC</span>
            <span className="app-toolbar-wide text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300">
              GRBL 1.1
            </span>
          </div>

          {/* Connection Controls */}
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
            <Usb className="app-toolbar-wide w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedPort}
              aria-label="Port série"
              onChange={(e) => setSelectedPort(e.target.value)}
              disabled={status.connected}
              className="min-w-0 w-40 max-w-full bg-slate-50 text-xs font-mono text-slate-800 rounded px-2 py-1 border border-slate-300 focus:outline-none focus:border-slate-500 disabled:opacity-60"
            >
              {ports.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path === 'SIMULATOR'
                    ? 'Simulateur GRBL 1.1 (Sans Arduino)'
                    : `${p.path} — ${p.friendlyName}`}
                </option>
              ))}
            </select>

            <select
              value={selectedBaud}
              aria-label="Débit du port série"
              onChange={(e) => setSelectedBaud(Number(e.target.value))}
              disabled={status.connected}
              className="bg-slate-50 text-xs font-mono text-slate-700 rounded px-1.5 py-1 border border-slate-300 focus:outline-none disabled:opacity-60"
            >
              <option value={115200}>115200</option>
              <option value={250000}>250000</option>
              <option value={57600}>57600</option>
              <option value={9600}>9600</option>
            </select>

            <button
              onClick={refreshPorts}
              disabled={status.connected}
              className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 disabled:opacity-40 cursor-pointer"
              title="Rafraîchir les ports USB"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleConnectToggle}
              disabled={isConnecting || !socketConnected}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-semibold text-xs border cursor-pointer ${
                status.connected
                  ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600'
              }`}
            >
              {status.connected ? (
                <>
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>Déconnecter</span>
                </>
              ) : (
                <>
                  <Power className="w-3.5 h-3.5" />
                  <span>{isConnecting ? 'Connexion...' : 'Connecter'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Center: Unified Pause / Resume / Emergency Stop */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={handlePauseJob}
            disabled={!status.connected || (!isRunning && status.state !== 'Jog')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
            title="Mettre en pause l'usinage ou le mouvement (Feed Hold !)"
            aria-label="Mettre en pause"
          >
            <Pause className="w-3.5 h-3.5" />
            <span className="app-toolbar-wide">Pause (!)</span>
          </button>

          <button
            onClick={handleResumeJob}
            disabled={!status.connected || !isPaused}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
            title="Reprendre l'usinage après une pause (Cycle Start ~)"
            aria-label="Reprendre"
          >
            <Play className="w-3.5 h-3.5" />
            <span className="app-toolbar-wide">Reprendre (~)</span>
          </button>

          <button
            onClick={handleSoftReset}
            disabled={!status.connected}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-bold text-xs border border-red-700 disabled:opacity-40 cursor-pointer"
            title="Arrêt d'urgence immédiat (Soft Reset 0x18)"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>STOP URGENCE</span>
          </button>
        </div>

        {/* Right: Settings $$, Pinout & Tablet Info */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Bouton Télécommande Mobile d'Atelier */}
          <button
            onClick={() => setPendantModeWithUrl(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            title="Passer en mode Télécommande Mobile / Pendant d'Atelier (optimisé smartphone tactile)"
            aria-label="Télécommande mobile"
          >
            <Smartphone className="w-3.5 h-3.5 text-sky-600" />
            <span className="app-toolbar-wide">Télécommande</span>
          </button>

          {workshop === 'cnc' && <button
            onClick={() => setLayoutDialogOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-medium cursor-pointer"
            title="Personnaliser la disposition CNC"
            aria-label="Personnaliser la disposition CNC"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-600" />
            <span className="app-toolbar-wide">Disposition</span>
          </button>}

          <button
            onClick={() => {
              if (status.connected) {
                socket?.emit('cnc:settings:get');
              }
              setIsSettingsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-medium cursor-pointer"
            title="Paramètres de l'application & Configuration GRBL ($$)"
            aria-label="Paramètres"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
            <span className="app-toolbar-wide font-semibold">Paramètres</span>
          </button>

          <button
            onClick={() => setIsPinoutModalOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-medium cursor-pointer"
            title="Mémo câblage CNC Shield V3.0"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-600" />
            <span className="app-toolbar-wide">Câblage</span>
          </button>

          <button
            onClick={() => setIsNetworkModalOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-medium cursor-pointer"
            title="Accès Wi-Fi Tablette / Smartphone"
          >
            <Wifi className="w-3.5 h-3.5 text-slate-600" />
            <span className="app-toolbar-wide">Wi-Fi</span>
          </button>

          <button
            onClick={() => setIsSoundModalOpen(true)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-medium cursor-pointer transition-colors ${
              audioSettings.enabled && audioSettings.masterVolume > 0
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
            }`}
            title="Alertes & signaux sonores d'atelier"
          >
            {audioSettings.enabled && audioSettings.masterVolume > 0 ? (
              <Volume2 className="w-3.5 h-3.5 text-slate-600" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-red-500" />
            )}
            <span className="app-toolbar-wide">Son</span>
          </button>
        </div>
      </header>

      <nav aria-label="Ateliers" className="flex flex-wrap shrink-0 bg-white border-b border-slate-300 px-3">
        {(['cnc', 'laser'] as const).map(mode => <button key={mode} type="button" disabled={isRunning || isPaused || status.state === 'Jog'} onClick={() => { setWorkshop(mode); if (mode === 'laser' && status.connected) socket?.emit('cnc:settings:get'); }} className={`px-5 py-2 text-sm font-bold border-b-2 disabled:opacity-50 ${workshop === mode ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-600'}`} aria-current={workshop === mode ? 'page' : undefined}>Atelier {mode === 'cnc' ? 'CNC' : 'laser'}</button>)}
      </nav>
      <div className={workshop === 'laser' ? 'flex flex-1 min-h-0' : 'hidden'}>
        <LaserWorkshop
          status={status} job={job} settings={grblSettings}
          machineEnvelope={machineEnvelope} preferences={preferences} active={workshop === 'laser'}
          onRefreshSettings={() => socket?.emit('cnc:settings:get')}
          onStart={(name, gcode) => socket?.emit('cnc:job:start', { fileName: name, gcode, applyHeightmap: false })}
          onSimulate={(fileName, gcode, maxPower) => new Promise<void>((resolve, reject) => {
            if (!socket?.connected) { reject(new Error('Le serveur est déconnecté.')); return; }
            socket.timeout(10000).emit('cnc:laser:simulate', { fileName, gcode, maxPower },
              (timeout: Error | null, result: { ok: boolean; error?: string }) => {
                if (timeout) reject(new Error('Le simulateur ne répond pas. Relancez le serveur SmartCNC.'));
                else if (!result?.ok) reject(new Error(result?.error || 'Simulation impossible.'));
                else resolve();
              });
          })}
          onPause={handlePauseJob} onResume={handleResumeJob} onStop={handleStopJob}
          onJog={handleJog} onZero={handleZeroWorkAxis} onLaserOff={() => handleSendCommand('M5')}
        />
      </div>
      {workshop === 'cnc' && <CncWorkspace
        containerRef={workspaceContainerRef}
        panelLayout={panelLayout}
        sizes={layoutSizes}
        onConfigure={() => setLayoutDialogOpen(true)}
        panels={{
          dro: (
            <DROPanel
              status={status}
              onSendCommand={handleSendCommand}
              onSendRealtime={handleSendRealtime}
              onSoftReset={handleSoftReset}
              onZeroWorkAxis={handleZeroWorkAxis}
              onSetMachineZero={handleSetMachineZero}
              largeFont={preferences.largeDroFont}
              safeRetractZBeforeOrigin={preferences.safeRetractZBeforeOrigin}
              safeRetractZHeight={preferences.safeRetractZHeight}
              confirmZeroAll={preferences.confirmZeroAll}
              useHoming={preferences.useHoming}
            />
          ),
          jog: (
            <JogPanel
              status={status}
              onSendCommand={handleSendCommand}
              onSendRealtime={handleSendRealtime}
              onJog={handleJog}
              onCancelJog={handleCancelJog}
            />
          ),
          viewport: (
            <Viewport3D
                status={status}
                segments={parsedGCode.segments}
                stats={parsedGCode.stats}
                currentLineIndex={job.currentLineIndex}
                heightmap={heightmap}
                machineEnvelope={machineEnvelope}
                gridZOffset={preferences.gridZOffset}
                gridMajorStep={preferences.gridMajorStep}
                customBedDimensions={
                  preferences.useCustomBedDimensions
                    ? { x: preferences.customBedWidth, y: preferences.customBedLength }
                    : null
                }
                onOpenFraming={handleOpenFraming}
              />
          ),
          gcode: (
            <GCodeStreamerPanel
                connected={status.connected}
                machineState={status.state}
                job={job}
                gcodeText={rawGCode}
                stats={parsedGCode.stats}
                onLoadGCode={handleLoadGCode}
                onUpdateGCode={(updated) => setRawGCode(updated)}
                onStartJob={handleStartJob}
                onPauseJob={handlePauseJob}
                onResumeJob={handleResumeJob}
                onStopJob={handleStopJob}
                onToggleCheckMode={handleToggleCheckMode}
                onFrameJob={handleFrameJob}
                onOpenFramingModal={handleOpenFraming}
                onSendCommand={handleSendCommand}
              />
          ),
          tools: (
            <OverridesAndToolsTabs
                status={status}
                onSendCommand={handleSendCommand}
                onSendRealtime={handleSendRealtime}
                gcodeStats={parsedGCode.stats}
                heightmap={heightmap}
                onHeightmapChange={handleHeightmapChange}
                onStartHeightmapScan={handleStartHeightmapScan}
                onGenerateDemoHeightmap={handleGenerateDemoHeightmap}
                probeConfig={probeConfig}
                onProbeConfigChange={setProbeConfig}
                onStartProbe={handleStartProbe}
              />
          ),
          console: (
            <ConsoleAndMacrosPanel
                connected={status.connected}
                entries={consoleLogs}
                onSendCommand={handleSendCommand}
                onClearConsole={() => setConsoleLogs([])}
                jobBounds={parsedGCode.stats?.bounds}
              />
          ),
        }}
      />}
      {layoutDialogOpen && <CncLayoutDialog layout={panelLayout} onChange={setPanelLayout}
        onReset={resetLayout} onClose={() => setLayoutDialogOpen(false)} />}

      {/* =====================================================================
          MODAL 1 : ÉDITEUR DE CONFIGURATION GRBL ($$)
      ===================================================================== */}
      {isSettingsModalOpen && (
        <GrblSettingsModal
          status={status}
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          connected={status.connected}
          settings={grblSettings.length > 0 ? grblSettings : undefined}
          onSendCommand={handleSendCommand}
          onReadSettings={() => socket?.emit('cnc:settings:get')}
          onSaveSettings={handleSaveGrblSettings}
          initialTab="app"
          onResetLayout={resetLayout}
        />
      )}

      {/* =====================================================================
          MODAL 2 : MÉMO CÂBLAGE ARDUINO UNO + CNC SHIELD V3.0 (GRBL 1.1)
      ===================================================================== */}
      {isPinoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <Cpu className="w-5 h-5 text-slate-700" />
                <h2 className="text-base font-bold text-slate-900">
                  Mémo Câblage : Arduino Uno + CNC Shield V3.0 (GRBL 1.1)
                </h2>
              </div>
              <button
                onClick={() => setIsPinoutModalOpen(false)}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 flex gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-800 space-y-1">
                <p className="font-bold text-amber-900">
                  Inversion des broches Z+ et SpnEn sur CNC Shield V3.0 avec GRBL 1.1 :
                </p>
                <ul className="list-disc list-inside space-y-1 pt-1 font-mono text-slate-700">
                  <li>Fin de course Z (Z-Limit) ➔ Broche marquée SpnEn (Pin D12)</li>
                  <li>Broche PWM / Laser (0-5V) ➔ Broche marquée Z+ / Z- (Pin D11)</li>
                  <li>Palpeur XY / Z-Probe (G38.2) ➔ Broche marquée SCL (Pin A5) + GND</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setIsPinoutModalOpen(false)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3 : ACCÈS WI-FI TABLETTE / SMARTPHONE
      ===================================================================== */}
      {isNetworkModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Accès Tablette / Téléphone en Wi-Fi
                </h2>
              </div>
              <button
                onClick={() => setIsNetworkModalOpen(false)}
                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Ouvre l’une de ces adresses sur ton téléphone ou ta tablette connectée au même Wi-Fi :
            </p>

            <div className="space-y-2">
              {networkInfo && networkInfo.urls.length > 0 ? (
                networkInfo.urls.map((url) => (
                  <div
                    key={url}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between font-mono text-xs text-emerald-800 font-bold">
                      <span>{url}</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[11px]">
                      <span className="text-slate-600 font-medium">Lien direct Télécommande :</span>
                      <a
                        href={`${url}?mode=pendant`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-sky-700 hover:text-sky-900 font-bold underline"
                      >
                        {url}?mode=pendant
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-700">
                  http://localhost:3000
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-start gap-2">
              <Smartphone className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Favori Télécommande Smartphone :</strong>
                <span>
                  Ajoute l'adresse avec <code className="bg-white px-1 py-0.5 rounded border border-sky-300 font-mono text-[11px] font-bold">?mode=pendant</code> sur l'écran d'accueil de ton smartphone pour lancer directement la télécommande tactile d'atelier !
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setIsNetworkModalOpen(false)}
                className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4 : ALERTES & SIGNAUX SONORES D'ATELIER
      ===================================================================== */}
      <SoundSettingsModal
        isOpen={isSoundModalOpen}
        onClose={() => setIsSoundModalOpen(false)}
      />

      {/* =====================================================================
          MODAL 5 : ASSISTANT DE CADRAGE & BOUNDING BOX (FRAMING)
      ===================================================================== */}
      {isFramingModalOpen && (
        <FramingModal
          isOpen={isFramingModalOpen}
          onClose={() => setIsFramingModalOpen(false)}
          status={status}
          bounds={parsedGCode.stats?.bounds}
          fileName={fileName || undefined}
          onSendCommand={handleSendCommand}
          onSendRealtime={handleSendRealtime}
          onZeroWorkAxis={handleZeroWorkAxis}
        />
      )}
    </div>
  );
};

export default App;
