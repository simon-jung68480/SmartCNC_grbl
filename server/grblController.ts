import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import type {
  Coordinates,
  GrblStatus,
  SerialPortInfo,
  JobStatus,
  ConsoleEntry,
  GrblSettingItem,
  ProbeConfig,
  HeightmapGrid,
  MachineState
} from '../src/types/cnc';
import {
  GRBL_ERRORS,
  GRBL_ALARMS,
  GRBL_SETTINGS_META,
  DEFAULT_SIMULATOR_SETTINGS
} from './grblCodes';

const ARDUINO_VENDOR_IDS = ['2341', '2a03', '1a86', '0403', '10c4'];
const RX_BUFFER_MAX = 128;
const RX_BUFFER_SAFE_LIMIT = 127;

interface SimMotionSegment {
  targetMpos: Coordinates;
  feedRate: number; // mm/min
  isRapid: boolean;
  isJog?: boolean;
  isHoming?: boolean;
  isProbe?: boolean;
  probeSurfaceZ?: number;
  lineByteLength: number;
  origLineIndex?: number;
  origCommand?: string;
  onComplete?: () => void;
}

export class GrblController extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private statusPollTimer: NodeJS.Timeout | null = null;
  private simTickTimer: NodeJS.Timeout | null = null;
  private lastJobEmitTime = 0;

  private status: GrblStatus = this.createInitialStatus();
  private settingsMap: Map<number, number> = new Map(
    Object.entries(DEFAULT_SIMULATOR_SETTINGS).map(([k, v]) => [Number(k), v])
  );
  private wcsOffsets: Record<'G54' | 'G55' | 'G56' | 'G57' | 'G58' | 'G59', Coordinates> = {
    G54: { x: 0, y: 0, z: 0 },
    G55: { x: 0, y: 0, z: 0 },
    G56: { x: 0, y: 0, z: 0 },
    G57: { x: 0, y: 0, z: 0 },
    G58: { x: 0, y: 0, z: 0 },
    G59: { x: 0, y: 0, z: 0 }
  };

  // Character-counting protocol state
  private jobStatus: JobStatus = this.createInitialJobStatus();
  private jobItems: { cmd: string; origLineIndex: number }[] = [];
  private inFlightQueue: { length: number; lineIndex: number; isJobLine: boolean }[] = [];
  private rxBytesUsed = 0;

  // Simulator queue
  private simMotionQueue: SimMotionSegment[] = [];
  private currentSimMotion: SimMotionSegment | null = null;
  private simModalMotion: 'G0' | 'G1' | 'G2' | 'G3' = 'G0';

  // Heightmap & Probe state
  private activeHeightmap: HeightmapGrid | null = null;
  private heightmapAbort = false;
  private pendingProbeWaiters: Array<(prbPos: Coordinates, success: boolean) => void> = [];

  constructor() {
    super();
  }

  private createInitialStatus(): GrblStatus {
    return {
      connected: false,
      portPath: '',
      baudRate: 115200,
      isSimulator: false,
      state: 'Disconnected',
      mpos: { x: 0, y: 0, z: 0 },
      wpos: { x: 0, y: 0, z: 0 },
      wco: { x: 0, y: 0, z: 0 },
      activeWCS: 'G54',
      unit: 'mm',
      distanceMode: 'G90',
      feedRate: 0,
      spindleSpeed: 0,
      overrides: {
        feed: 100,
        rapid: 100,
        spindle: 100
      },
      accessories: {
        spindleCw: false,
        spindleCcw: false,
        floodCoolant: false,
        mistCoolant: false
      },
      pins: {
        xLimit: false,
        yLimit: false,
        zLimit: false,
        probe: false,
        door: false,
        hold: false,
        softReset: false,
        cycleStart: false
      },
      buffer: {
        plannerBlocksAvailable: 15,
        rxBytesAvailable: RX_BUFFER_MAX
      },
      version: 'Grbl 1.1h'
    };
  }

  private createInitialJobStatus(): JobStatus {
    return {
      state: 'idle',
      fileName: '',
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
      rxBufferMax: RX_BUFFER_MAX,
      heightmapApplied: false
    };
  }

  public getStatus(): GrblStatus {
    return this.status;
  }

  public getJobStatus(): JobStatus {
    this.updateJobTiming();
    return this.jobStatus;
  }

  public getSettingsList(): GrblSettingItem[] {
    const items: GrblSettingItem[] = [];
    const allIds = Array.from(
      new Set([...Object.keys(GRBL_SETTINGS_META).map(Number), ...this.settingsMap.keys()])
    ).sort((a, b) => a - b);

    for (const id of allIds) {
      const meta = GRBL_SETTINGS_META[id];
      const value = this.settingsMap.get(id) ?? DEFAULT_SIMULATOR_SETTINGS[id] ?? 0;
      if (meta) {
        items.push({
          ...meta,
          value
        });
      } else {
        items.push({
          id,
          code: `$${id}`,
          value,
          unit: '',
          name: `Paramètre GRBL $${id}`,
          category: 'General',
          description: `Paramètre interne GRBL $${id}.`
        });
      }
    }
    return items;
  }

  public getHeightmap(): HeightmapGrid | null {
    return this.activeHeightmap;
  }

  public setHeightmap(grid: HeightmapGrid | null): void {
    this.activeHeightmap = grid;
    if (grid) {
      this.emit('heightmap', grid);
    }
  }

  public async listPorts(): Promise<SerialPortInfo[]> {
    const ports: SerialPortInfo[] = [];
    try {
      const rawPorts = await SerialPort.list();
      for (const p of rawPorts) {
        const vid = (p.vendorId || '').toLowerCase();
        const isArduino =
          ARDUINO_VENDOR_IDS.includes(vid) ||
          /arduino|ch340|cp210|ftdi|usb-serial|usb serial/i.test(
            `${p.manufacturer || ''} ${(p as unknown as { friendlyName?: string }).friendlyName || ''}`
          );
        const label =
          (p as unknown as { friendlyName?: string }).friendlyName ||
          p.manufacturer ||
          (isArduino ? 'Arduino Uno / CNC Shield' : 'Port Série USB');
        ports.push({
          path: p.path,
          manufacturer: p.manufacturer,
          serialNumber: p.serialNumber,
          vendorId: p.vendorId,
          productId: p.productId,
          friendlyName: `${p.path} — ${label}`,
          isArduino
        });
      }
    } catch (err) {
      this.emitConsole('error', `Erreur lors du scan USB: ${(err as Error).message}`);
    }

    // Always append the built-in high-fidelity simulator port
    ports.push({
      path: 'SIMULATOR',
      manufacturer: 'SmartCNC Virtual Hardware',
      vendorId: '2341',
      productId: '0043',
      friendlyName: 'Simulateur GRBL 1.1 (Arduino Uno + CNC Shield V3.0)',
      isArduino: true
    });

    return ports;
  }

  public async connect(portPath: string, baudRate = 115200): Promise<void> {
    await this.disconnect();

    const isSim = portPath === 'SIMULATOR';
    this.status = {
      ...this.createInitialStatus(),
      connected: true,
      portPath,
      baudRate,
      isSimulator: isSim,
      state: 'Idle',
      version: isSim ? 'Grbl 1.1h [Simulateur CNC Shield V3.0]' : 'Grbl 1.1'
    };

    this.inFlightQueue = [];
    this.rxBytesUsed = 0;

    if (isSim) {
      this.startSimulator();
      this.emitConsole(
        'info',
        `Connecté au Simulateur GRBL 1.1 (Arduino Uno + CNC Shield V3.0 @ ${baudRate} bauds)`
      );
      this.emitConsole('rx', "Grbl 1.1h ['$' for help]");
      this.emitStatus();
      this.emit('settings', this.getSettingsList());
      return;
    }

    return new Promise((resolve, reject) => {
      const serial = new SerialPort({
        path: portPath,
        baudRate,
        autoOpen: false
      });

      const parser = serial.pipe(new ReadlineParser({ delimiter: '\n' }));
      this.port = serial;
      this.parser = parser;

      parser.on('data', (rawLine: string) => {
        this.handleIncomingLine(rawLine.replace(/\r$/, '').trim());
      });

      serial.on('error', (err) => {
        this.emitConsole('error', `Erreur Port Série (${portPath}): ${err.message}`);
        this.status.lastError = err.message;
        this.emitStatus();
      });

      serial.on('close', () => {
        if (this.status.connected) {
          this.emitConsole('info', `Port série ${portPath} fermé.`);
          this.cleanupConnection();
        }
      });

      serial.open((err) => {
        if (err) {
          this.cleanupConnection();
          this.emitConsole('error', `Impossible d'ouvrir ${portPath}: ${err.message}`);
          reject(err);
          return;
        }

        this.emitConsole('info', `Connecté à ${portPath} @ ${baudRate} bauds`);
        this.startStatusPolling();
        // Request initial status & settings after Arduino boot
        setTimeout(() => {
          if (this.status.connected && !this.status.isSimulator) {
            this.sendRealtime('?');
            this.sendCommand('$$');
          }
        }, 1200);
        this.emitStatus();
        resolve();
      });
    });
  }

  public async disconnect(): Promise<void> {
    this.heightmapAbort = true;
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
    if (this.simTickTimer) {
      clearInterval(this.simTickTimer);
      this.simTickTimer = null;
    }
    this.simMotionQueue = [];
    this.currentSimMotion = null;

    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve) => {
        this.port!.close(() => resolve());
      });
    }
    this.cleanupConnection();
  }

  private cleanupConnection(): void {
    this.port = null;
    this.parser = null;
    this.inFlightQueue = [];
    this.rxBytesUsed = 0;
    this.status = this.createInitialStatus();
    this.emitStatus();
  }

  private startStatusPolling(): void {
    if (this.statusPollTimer) clearInterval(this.statusPollTimer);
    this.statusPollTimer = setInterval(() => {
      if (this.status.connected) {
        this.sendRealtime('?');
      }
    }, 150);
  }

  // ============================================================================
  // REAL-TIME COMMANDS & OVERRIDES
  // ============================================================================

  public sendRealtime(charOrByte: string | number): void {
    if (!this.status.connected) return;

    const byteVal = typeof charOrByte === 'number' ? charOrByte : charOrByte.charCodeAt(0);

    // Keep jobStatus synchronized if user sends '!' (Feed Hold) or '~' (Cycle Start) directly
    if (byteVal === 0x21 && this.jobStatus.state === 'running') {
      this.jobStatus.state = 'paused';
      this.emitJobStatus(true);
    } else if (byteVal === 0x7e && this.jobStatus.state === 'paused') {
      this.jobStatus.state = 'running';
      this.emitJobStatus(true);
      setTimeout(() => this.pumpJobStreamer(), 10);
    }

    if (this.status.isSimulator) {
      this.handleSimulatorRealtime(byteVal);
      return;
    }

    if (this.port && this.port.isOpen) {
      const buf = Buffer.from([byteVal]);
      this.port.write(buf);
    }
  }

  public setOverride(
    type: 'feed' | 'rapid' | 'spindle' | 'spindleToggle' | 'floodToggle' | 'mistToggle',
    action: 'reset' | 'plus10' | 'minus10' | 'plus1' | 'minus1' | '100' | '50' | '25' | 'toggle'
  ): void {
    const byteMap: Record<string, number> = {
      'feed:reset': 0x90,
      'feed:100': 0x90,
      'feed:plus10': 0x91,
      'feed:minus10': 0x92,
      'feed:plus1': 0x93,
      'feed:minus1': 0x94,
      'rapid:reset': 0x95,
      'rapid:100': 0x95,
      'rapid:50': 0x96,
      'rapid:25': 0x97,
      'spindle:reset': 0x99,
      'spindle:100': 0x99,
      'spindle:plus10': 0x9a,
      'spindle:minus10': 0x9b,
      'spindle:plus1': 0x9c,
      'spindle:minus1': 0x9d,
      'spindleToggle:toggle': 0x9e,
      'floodToggle:toggle': 0xa0,
      'mistToggle:toggle': 0xa1
    };

    const code = byteMap[`${type}:${action}`];
    if (code !== undefined) {
      this.sendRealtime(code);
    }
  }

  public softReset(): void {
    this.heightmapAbort = true;
    if (this.jobStatus.state === 'running' || this.jobStatus.state === 'paused') {
      this.jobStatus.state = 'aborted';
      this.emitJobStatus(true);
    }
    this.inFlightQueue = [];
    this.rxBytesUsed = 0;
    this.jobStatus.rxBufferUsed = 0;
    this.sendRealtime(0x18);
    this.emitConsole('info', 'Soft Reset (0x18) envoyé au contrôleur GRBL');
  }

  public unlock(): void {
    this.sendCommand('$X');
  }

  public home(): void {
    this.sendCommand('$H');
  }

  /**
   * Définit le 0;0;0 Machine (MPos = 0,0,0) à la position actuelle sans capteurs de Homing ($H)
   */
  public setMachineZero(): void {
    if (!this.status.connected) return;

    if (this.status.isSimulator) {
      this.simMotionQueue = [];
      this.currentSimMotion = null;
      this.status.mpos = { x: 0, y: 0, z: 0 };
      this.status.wco = { x: 0, y: 0, z: 0 };
      this.status.wpos = { x: 0, y: 0, z: 0 };
      this.wcsOffsets[this.status.activeWCS] = { x: 0, y: 0, z: 0 };
      this.status.state = 'Idle';
      this.status.alarmCode = undefined;
      this.status.alarmMessage = undefined;
      this.emitConsole('info', 'Zéro Machine (0;0;0) défini à la position actuelle.');
      this.emitStatus();
      return;
    }

    // Sur un vrai Arduino Uno GRBL 1.1 à l'arrêt, un Soft Reset (0x18) réinitialise les compteurs MPos à 0,0,0 sur place
    this.inFlightQueue = [];
    this.rxBytesUsed = 0;
    this.sendRealtime(0x18);
    setTimeout(() => {
      if (!this.status.connected) return;
      this.sendCommand('$X');
      this.sendCommand('G10 L20 P1 X0 Y0 Z0');
      this.status.mpos = { x: 0, y: 0, z: 0 };
      this.status.wco = { x: 0, y: 0, z: 0 };
      this.status.wpos = { x: 0, y: 0, z: 0 };
      this.emitConsole('info', 'Zéro Machine (0;0;0) défini à la position actuelle.');
      this.emitStatus();
    }, 400);
  }

  public jog(params: { x?: number; y?: number; z?: number; feedRate: number; distanceMode?: 'G90' | 'G91' }): void {
    const mode = params.distanceMode || 'G91';
    const parts: string[] = [`$J=${mode} G21`];
    if (typeof params.x === 'number' && !Number.isNaN(params.x)) {
      parts.push(`X${params.x.toFixed(3)}`);
    }
    if (typeof params.y === 'number' && !Number.isNaN(params.y)) {
      parts.push(`Y${params.y.toFixed(3)}`);
    }
    if (typeof params.z === 'number' && !Number.isNaN(params.z)) {
      parts.push(`Z${params.z.toFixed(3)}`);
    }
    parts.push(`F${Math.max(10, Math.round(params.feedRate || 500))}`);
    this.sendCommand(parts.join(' '));
  }

  public jogCancel(): void {
    this.sendRealtime(0x85);
  }

  public zeroAxes(axes: ('X' | 'Y' | 'Z' | 'XY' | 'ALL')[] | 'X' | 'Y' | 'Z' | 'XY' | 'ALL'): void {
    const list = Array.isArray(axes) ? axes : [axes];
    if (list.includes('ALL')) {
      this.sendCommand('G10 L20 P1 X0 Y0 Z0');
      return;
    }
    if (list.includes('XY')) {
      this.sendCommand('G10 L20 P1 X0 Y0');
      return;
    }
    const coords = list
      .filter((a) => a === 'X' || a === 'Y' || a === 'Z')
      .map((a) => `${a}0`)
      .join(' ');
    if (coords) {
      this.sendCommand(`G10 L20 P1 ${coords}`);
    }
  }

  public gotoPosition(target: { x?: number; y?: number; z?: number; isMachineCoords?: boolean; safeZFirst?: boolean }): void {
    if (target.safeZFirst && typeof target.z !== 'number') {
      this.sendCommand('G90 G0 Z5.000');
    }
    const prefix = target.isMachineCoords ? 'G53 G90 G0' : 'G90 G0';
    const axes: string[] = [];
    if (typeof target.x === 'number') axes.push(`X${target.x.toFixed(3)}`);
    if (typeof target.y === 'number') axes.push(`Y${target.y.toFixed(3)}`);
    if (typeof target.z === 'number') axes.push(`Z${target.z.toFixed(3)}`);
    if (axes.length > 0) {
      this.sendCommand(`${prefix} ${axes.join(' ')}`);
    }
  }

  // ============================================================================
  // COMMAND SENDING & PARSING
  // ============================================================================

  public sendCommand(rawCommand: string, options?: { silent?: boolean; isJobLine?: boolean; lineIndex?: number }): void {
    if (!this.status.connected) {
      this.emitConsole('error', 'Impossible d’envoyer la commande : CNC non connectée.');
      return;
    }

    const lines = rawCommand
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    for (const cmd of lines) {
      const byteLength = cmd.length + 1; // +1 for '\n'
      this.inFlightQueue.push({
        length: byteLength,
        lineIndex: options?.lineIndex ?? -1,
        isJobLine: Boolean(options?.isJobLine)
      });
      this.rxBytesUsed = Math.min(RX_BUFFER_MAX, this.rxBytesUsed + byteLength);
      this.status.buffer.rxBytesAvailable = Math.max(0, RX_BUFFER_MAX - this.rxBytesUsed);
      this.jobStatus.rxBufferUsed = this.rxBytesUsed;

      if (!options?.silent) {
        this.emitConsole('tx', cmd);
      }

      // Immediately update local WCO & WPos when G10 L20 or G92 is sent on real GRBL
      // (because real GRBL 1.1 only sends WCO: every 10-30 status reports)
      if (!this.status.isSimulator) {
        const upper = cmd.toUpperCase();
        if ((/\bG10\b/.test(upper) && /\bL20\b/.test(upper)) || (/\bG92\b/.test(upper) && !/\bG92\.1\b/.test(upper))) {
          const xVal = this.extractWord(upper, 'X');
          const yVal = this.extractWord(upper, 'Y');
          const zVal = this.extractWord(upper, 'Z');
          if (xVal !== null) this.status.wco.x = Number((this.status.mpos.x - xVal).toFixed(3));
          if (yVal !== null) this.status.wco.y = Number((this.status.mpos.y - yVal).toFixed(3));
          if (zVal !== null) this.status.wco.z = Number((this.status.mpos.z - zVal).toFixed(3));
          this.recomputeSimWpos();
          this.emitStatus();
        }
      }

      if (this.status.isSimulator) {
        this.processSimulatorCommand(cmd, byteLength, options?.lineIndex);
      } else if (this.port && this.port.isOpen) {
        this.port.write(`${cmd}\n`);
      }
    }
  }

  public requestSettings(): void {
    if (!this.status.connected) return;
    if (this.status.isSimulator) {
      this.processSimulatorCommand('$$', 3);
    } else {
      this.sendCommand('$$');
    }
  }

  public updateSetting(id: number, value: number): void {
    this.sendCommand(`$${id}=${value}`);
  }

  private handleIncomingLine(line: string): void {
    if (!line) return;

    // 1. Status Report Frame: <Idle|MPos:0.000,0.000,0.000|...>
    if (line.startsWith('<') && line.endsWith('>')) {
      this.parseGrblStatusFrame(line);
      return;
    }

    // 2. Acknowledge 'ok'
    if (line === 'ok') {
      const acked = this.inFlightQueue.shift();
      if (acked) {
        this.rxBytesUsed = Math.max(0, this.rxBytesUsed - acked.length);
        this.status.buffer.rxBytesAvailable = Math.max(0, RX_BUFFER_MAX - this.rxBytesUsed);
        this.jobStatus.rxBufferUsed = this.rxBytesUsed;

        if (acked.isJobLine) {
          this.jobStatus.acknowledgedLines++;
          this.updateJobProgress();
          this.pumpJobStreamer();
        }
      }
      if (this.jobStatus.state !== 'running') {
        this.emitConsole('ok', 'ok');
      }
      return;
    }

    // 3. Error response: error:X
    if (line.toLowerCase().startsWith('error:')) {
      const code = parseInt(line.split(':')[1], 10);
      const errMeta = GRBL_ERRORS[code];
      const detail = errMeta
        ? `${errMeta.title} — ${errMeta.description}`
        : `Erreur GRBL code ${code}`;

      const acked = this.inFlightQueue.shift();
      if (acked) {
        this.rxBytesUsed = Math.max(0, this.rxBytesUsed - acked.length);
        this.jobStatus.rxBufferUsed = this.rxBytesUsed;
      }

      this.status.lastError = `error:${code} (${errMeta?.title || 'Erreur'})`;
      this.emitConsole('error', line, detail);
      this.emitStatus();

      if (this.jobStatus.state === 'running') {
        this.pumpJobStreamer();
      }
      return;
    }

    // 4. Alarm response: ALARM:X
    if (line.toUpperCase().startsWith('ALARM:')) {
      const code = parseInt(line.split(':')[1], 10);
      const alarmMeta = GRBL_ALARMS[code];
      const detail = alarmMeta
        ? `${alarmMeta.title} — ${alarmMeta.description}`
        : `Alarme GRBL code ${code}`;

      this.status.state = 'Alarm';
      this.status.alarmCode = code;
      this.status.alarmMessage = alarmMeta ? `${alarmMeta.title}: ${alarmMeta.description}` : detail;
      this.emitConsole('alarm', line, detail);

      if (this.jobStatus.state === 'running' || this.jobStatus.state === 'paused') {
        this.jobStatus.state = 'error';
        this.emitJobStatus();
      }
      this.resolveProbeWaiters({ ...this.status.wpos }, false);
      this.emitStatus();
      return;
    }

    // 5. Probe report: [PRB:0.000,0.000,-12.345:1]
    if (line.startsWith('[PRB:')) {
      this.emitConsole('rx', line, 'Contact palpeur détecté');
      const match = line.match(/\[PRB:([-\d.]+),([-\d.]+),([-\d.]+):(\d)\]/);
      if (match) {
        const prbMpos: Coordinates = {
          x: parseFloat(match[1]),
          y: parseFloat(match[2]),
          z: parseFloat(match[3])
        };
        const success = match[4] === '1';
        const prbWpos: Coordinates = {
          x: Number((prbMpos.x - this.status.wco.x).toFixed(3)),
          y: Number((prbMpos.y - this.status.wco.y).toFixed(3)),
          z: Number((prbMpos.z - this.status.wco.z).toFixed(3))
        };
        this.resolveProbeWaiters(prbWpos, success);
      }
      return;
    }

    // 6. Settings line: $100=800.000
    const settingMatch = line.match(/^\$(\d+)=([-\d.]+)/);
    if (settingMatch) {
      const id = parseInt(settingMatch[1], 10);
      const val = parseFloat(settingMatch[2]);
      this.settingsMap.set(id, val);
      const meta = GRBL_SETTINGS_META[id];
      this.emitConsole('rx', line, meta ? `${meta.name} (${meta.unit})` : undefined);
      this.emit('settings', this.getSettingsList());
      return;
    }

    // 7. Parser state: [GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]
    if (line.startsWith('[GC:')) {
      if (line.includes('G90')) this.status.distanceMode = 'G90';
      if (line.includes('G91')) this.status.distanceMode = 'G91';
      if (line.includes('G20')) this.status.unit = 'in';
      if (line.includes('G21')) this.status.unit = 'mm';
      const wcsMatch = line.match(/G5[4-9]/);
      if (wcsMatch) {
        this.status.activeWCS = wcsMatch[0] as GrblStatus['activeWCS'];
      }
      this.emitConsole('rx', line);
      this.emitStatus();
      return;
    }

    // 8. Welcome banner: Grbl 1.1h ['$' for help]
    if (line.toLowerCase().startsWith('grbl ')) {
      this.status.version = line.split('[')[0].trim();
      this.emitConsole('info', line);
      this.emitStatus();
      return;
    }

    this.emitConsole('rx', line);
  }

  /**
   * Parses a real GRBL 1.1 status frame:
   * <Idle|MPos:0.000,0.000,0.000|Bf:15,128|FS:0,0|WCO:0.000,0.000,0.000|Ov:100,100,100|A:SFM|Pn:XYZP>
   */
  public parseGrblStatusFrame(frame: string): void {
    const inner = frame.slice(1, -1);
    const fields = inner.split('|');
    if (fields.length === 0) return;

    const rawState = fields[0];
    const [baseState, subState] = rawState.split(':');
    this.status.state = (rawState as MachineState) || (baseState as MachineState) || 'Idle';
    this.status.subState = subState;

    if (baseState !== 'Alarm') {
      this.status.alarmCode = undefined;
      this.status.alarmMessage = undefined;
    }

    let hasMpos = false;
    let hasWpos = false;

    // Reset transient pin/accessory flags if not present in frame
    let hasPins = false;
    let hasAccessories = false;

    for (let i = 1; i < fields.length; i++) {
      const field = fields[i];
      const colonIdx = field.indexOf(':');
      if (colonIdx === -1) continue;

      const key = field.slice(0, colonIdx);
      const val = field.slice(colonIdx + 1);

      switch (key) {
        case 'MPos': {
          const parts = val.split(',').map( parseFloat );
          if (parts.length >= 3) {
            this.status.mpos = {
              x: parts[0] || 0,
              y: parts[1] || 0,
              z: parts[2] || 0,
              ...(parts[3] !== undefined ? { a: parts[3] } : {})
            };
            hasMpos = true;
          }
          break;
        }
        case 'WPos': {
          const parts = val.split(',').map( parseFloat );
          if (parts.length >= 3) {
            this.status.wpos = {
              x: parts[0] || 0,
              y: parts[1] || 0,
              z: parts[2] || 0,
              ...(parts[3] !== undefined ? { a: parts[3] } : {})
            };
            hasWpos = true;
          }
          break;
        }
        case 'WCO': {
          const parts = val.split(',').map( parseFloat );
          if (parts.length >= 3) {
            this.status.wco = {
              x: parts[0] || 0,
              y: parts[1] || 0,
              z: parts[2] || 0,
              ...(parts[3] !== undefined ? { a: parts[3] } : {})
            };
          }
          break;
        }
        case 'Bf': {
          const [planner, rx] = val.split(',').map((n) => parseInt(n, 10));
          if (!Number.isNaN(planner) && !Number.isNaN(rx)) {
            this.status.buffer = {
              plannerBlocksAvailable: planner,
              rxBytesAvailable: rx
            };
          }
          break;
        }
        case 'FS': {
          const [feed, spindle] = val.split(',').map( parseFloat );
          this.status.feedRate = feed || 0;
          this.status.spindleSpeed = spindle || 0;
          break;
        }
        case 'F': {
          this.status.feedRate = parseFloat(val) || 0;
          break;
        }
        case 'Ov': {
          const [fOv, rOv, sOv] = val.split(',').map((n) => parseInt(n, 10));
          if (!Number.isNaN(fOv)) {
            this.status.overrides = {
              feed: fOv,
              rapid: rOv || 100,
              spindle: sOv || 100
            };
          }
          break;
        }
        case 'A': {
          hasAccessories = true;
          this.status.accessories = {
            spindleCw: val.includes('S'),
            spindleCcw: val.includes('C'),
            floodCoolant: val.includes('F'),
            mistCoolant: val.includes('M')
          };
          break;
        }
        case 'Pn': {
          hasPins = true;
          this.status.pins = {
            xLimit: val.includes('X'),
            yLimit: val.includes('Y'),
            zLimit: val.includes('Z'),
            probe: val.includes('P'),
            door: val.includes('D'),
            hold: val.includes('H'),
            softReset: val.includes('R'),
            cycleStart: val.includes('S')
          };
          break;
        }
        case 'Ln': {
          this.status.lineNumber = parseInt(val, 10);
          break;
        }
      }
    }

    if (!hasPins) {
      this.status.pins = {
        xLimit: false,
        yLimit: false,
        zLimit: false,
        probe: false,
        door: false,
        hold: false,
        softReset: false,
        cycleStart: false
      };
    }

    if (!hasAccessories && this.status.spindleSpeed === 0) {
      this.status.accessories = {
        spindleCw: false,
        spindleCcw: false,
        floodCoolant: false,
        mistCoolant: false
      };
    }

    // Recompute WPos or MPos using memorized WCO
    if (hasMpos && !hasWpos) {
      this.status.wpos = {
        x: Number((this.status.mpos.x - this.status.wco.x).toFixed(3)),
        y: Number((this.status.mpos.y - this.status.wco.y).toFixed(3)),
        z: Number((this.status.mpos.z - this.status.wco.z).toFixed(3))
      };
    } else if (hasWpos && !hasMpos) {
      this.status.mpos = {
        x: Number((this.status.wpos.x + this.status.wco.x).toFixed(3)),
        y: Number((this.status.wpos.y + this.status.wco.y).toFixed(3)),
        z: Number((this.status.wpos.z + this.status.wco.z).toFixed(3))
      };
    }

    this.emitStatus();
  }

  // ============================================================================
  // CHARACTER-COUNTING G-CODE STREAMER (128-BYTE ARDUINO UNO RX BUFFER)
  // ============================================================================

  public startJob(fileName: string, gcodeLinesOrContent: string[] | string, applyHeightmap = false): void {
    if (!this.status.connected) {
      this.emitConsole('error', 'Impossible de démarrer le job : machine non connectée.');
      return;
    }

    const rawLines = Array.isArray(gcodeLinesOrContent)
      ? gcodeLinesOrContent
      : gcodeLinesOrContent.split(/\r?\n/);

    const items: { cmd: string; origLineIndex: number }[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const cleaned = this.stripGCodeComments(rawLines[i]);
      if (cleaned.length > 0) {
        items.push({ cmd: cleaned, origLineIndex: i });
      }
    }

    const shouldApplyHeightmap =
      (applyHeightmap || Boolean(this.activeHeightmap?.enabled)) &&
      Boolean(this.activeHeightmap && this.activeHeightmap.points.some((p) => p.probed));

    if (items.length === 0) {
      this.emitConsole('error', 'Le fichier G-Code ne contient aucune instruction exécutable.');
      return;
    }

    this.jobItems = items;
    this.jobStatus = {
      state: 'running',
      fileName: fileName || 'programme.nc',
      totalLines: items.length,
      sentLines: 0,
      acknowledgedLines: 0,
      currentLineIndex: 0,
      currentCommand: items[0]?.cmd || '',
      progressPercent: 0,
      startTime: Date.now(),
      elapsedMs: 0,
      estimatedRemainingMs: null,
      rxBufferUsed: this.rxBytesUsed,
      rxBufferMax: RX_BUFFER_MAX,
      heightmapApplied: shouldApplyHeightmap
    };

    this.emitConsole(
      'info',
      `Démarrage de l'usinage "${this.jobStatus.fileName}" (${this.jobStatus.totalLines} instructions)`
    );
    this.emitJobStatus(true);
    this.pumpJobStreamer();
  }

  public pauseJob(): void {
    if (this.jobStatus.state === 'running') {
      this.jobStatus.state = 'paused';
    }
    this.sendRealtime('!');
    this.emitConsole('info', 'Usinage mis en pause (Feed Hold !)');
    this.emitJobStatus(true);
  }

  public resumeJob(): void {
    if (this.jobStatus.state === 'paused') {
      this.jobStatus.state = 'running';
    }
    this.sendRealtime('~');
    this.emitConsole('info', 'Reprise de l’usinage (Cycle Start ~)');
    this.emitJobStatus(true);
    this.pumpJobStreamer();
  }

  public stopJob(): void {
    this.sendRealtime('!');
    setTimeout(() => {
      this.softReset();
      this.jobItems = [];
      this.jobStatus = {
        ...this.jobStatus,
        state: 'aborted',
        rxBufferUsed: 0
      };
      this.emitJobStatus(true);
    }, 60);
  }

  private pumpJobStreamer(): void {
    if (this.jobStatus.state !== 'running') return;

    while (this.jobStatus.sentLines < this.jobStatus.totalLines) {
      const nextIdx = this.jobStatus.sentLines;
      const item = this.jobItems[nextIdx];
      const line = item.cmd;
      const lineLength = line.length + 1; // +1 for '\n'

      // Character-counting protocol check: never exceed 127 bytes in Arduino Uno RX buffer
      if (this.rxBytesUsed + lineLength > RX_BUFFER_SAFE_LIMIT) {
        break;
      }

      this.jobStatus.sentLines++;
      if (!this.status.isSimulator) {
        this.jobStatus.currentLineIndex = item.origLineIndex;
        this.jobStatus.currentCommand = line;
      }

      this.sendCommand(line, {
        silent: true,
        isJobLine: true,
        lineIndex: item.origLineIndex
      });
    }

    if (
      this.jobStatus.acknowledgedLines >= this.jobStatus.totalLines &&
      this.jobStatus.totalLines > 0
    ) {
      this.jobStatus.state = 'completed';
      this.jobStatus.progressPercent = 100;
      this.updateJobTiming();
      this.emitConsole('info', `Usinage "${this.jobStatus.fileName}" terminé avec succès !`);
      this.emitJobStatus(true);
      return;
    }

    this.emitJobStatus();
  }

  private updateJobProgress(): void {
    if (this.jobStatus.totalLines > 0) {
      const pct = (this.jobStatus.acknowledgedLines / this.jobStatus.totalLines) * 100;
      this.jobStatus.progressPercent = Number(Math.min(100, Math.max(0, pct)).toFixed(1));
    }
    this.updateJobTiming();
  }

  private updateJobTiming(): void {
    if (!this.jobStatus.startTime) return;
    if (this.jobStatus.state === 'running' || this.jobStatus.state === 'paused') {
      this.jobStatus.elapsedMs = Date.now() - this.jobStatus.startTime;
      if (this.jobStatus.acknowledgedLines > 2 && this.jobStatus.totalLines > 0) {
        const rate = this.jobStatus.elapsedMs / this.jobStatus.acknowledgedLines;
        const remainingLines = this.jobStatus.totalLines - this.jobStatus.acknowledgedLines;
        this.jobStatus.estimatedRemainingMs = Math.max(0, Math.round(rate * remainingLines));
      }
    }
  }

  private stripGCodeComments(line: string): string {
    return line
      .replace(/\(.*?\)/g, '')
      .replace(/;.*$/g, '')
      .trim()
      .toUpperCase();
  }

  // ============================================================================
  // HEIGHTMAP BILINEAR INTERPOLATION & G-CODE WARPING
  // ============================================================================

  public interpolateHeightmapZ(grid: HeightmapGrid, x: number, y: number): number {
    if (!grid || grid.cols < 2 || grid.rows < 2) return 0;

    const clampedX = Math.max(grid.minX, Math.min(grid.maxX, x));
    const clampedY = Math.max(grid.minY, Math.min(grid.maxY, y));

    const cellW = (grid.maxX - grid.minX) / (grid.cols - 1) || 1;
    const cellH = (grid.maxY - grid.minY) / (grid.rows - 1) || 1;

    const gx = (clampedX - grid.minX) / cellW;
    const gy = (clampedY - grid.minY) / cellH;

    const col0 = Math.min(grid.cols - 2, Math.max(0, Math.floor(gx)));
    const row0 = Math.min(grid.rows - 2, Math.max(0, Math.floor(gy)));
    const col1 = col0 + 1;
    const row1 = row0 + 1;

    const tx = Math.max(0, Math.min(1, gx - col0));
    const ty = Math.max(0, Math.min(1, gy - row0));

    const getZ = (r: number, c: number): number => {
      const pt = grid.points.find((p) => p.row === r && p.col === c);
      return pt && typeof pt.z === 'number' ? pt.z : 0;
    };

    const z00 = getZ(row0, col0);
    const z10 = getZ(row0, col1);
    const z01 = getZ(row1, col0);
    const z11 = getZ(row1, col1);

    const zTop = z00 * (1 - tx) + z10 * tx;
    const zBottom = z01 * (1 - tx) + z11 * tx;
    return zTop * (1 - ty) + zBottom * ty;
  }

  private applyHeightmapToGCode(lines: string[], grid: HeightmapGrid): string[] {
    const out: string[] = [];
    let curX = this.status.wpos.x;
    let curY = this.status.wpos.y;
    let curZ = this.status.wpos.z;
    let curF = 500;
    let isAbsolute = true;
    let currentMotion: 'G0' | 'G1' | 'G2' | 'G3' = 'G0';
    const maxSegLen = 5.0; // subdivide G1 segments > 5mm for accurate surface following

    for (const line of lines) {
      if (line.includes('G90')) isAbsolute = true;
      if (line.includes('G91')) isAbsolute = false;
      if (/\bG0?0\b/.test(line)) currentMotion = 'G0';
      else if (/\bG0?1\b/.test(line)) currentMotion = 'G1';
      else if (/\bG0?2\b/.test(line)) currentMotion = 'G2';
      else if (/\bG0?3\b/.test(line)) currentMotion = 'G3';

      const xMatch = line.match(/X([-\d.]+)/);
      const yMatch = line.match(/Y([-\d.]+)/);
      const zMatch = line.match(/Z([-\d.]+)/);
      const fMatch = line.match(/F([-\d.]+)/);
      if (fMatch) curF = parseFloat(fMatch[1]);

      if (!xMatch && !yMatch && !zMatch) {
        out.push(line);
        continue;
      }

      const targetX = xMatch
        ? isAbsolute
          ? parseFloat(xMatch[1])
          : curX + parseFloat(xMatch[1])
        : curX;
      const targetY = yMatch
        ? isAbsolute
          ? parseFloat(yMatch[1])
          : curY + parseFloat(yMatch[1])
        : curY;
      const targetZ = zMatch
        ? isAbsolute
          ? parseFloat(zMatch[1])
          : curZ + parseFloat(zMatch[1])
        : curZ;

      if (isAbsolute && currentMotion === 'G1') {
        const distXY = Math.hypot(targetX - curX, targetY - curY);
        const steps = Math.max(1, Math.ceil(distXY / maxSegLen));

        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const ix = curX + (targetX - curX) * t;
          const iy = curY + (targetY - curY) * t;
          const iz = curZ + (targetZ - curZ) * t;
          const zOffset = this.interpolateHeightmapZ(grid, ix, iy);
          const compensatedZ = iz + zOffset;
          out.push(
            `G1 X${ix.toFixed(3)} Y${iy.toFixed(3)} Z${compensatedZ.toFixed(3)} F${Math.round(curF)}`
          );
        }
      } else if (isAbsolute && currentMotion === 'G0') {
        const zOffset = this.interpolateHeightmapZ(grid, targetX, targetY);
        const compensatedZ = targetZ + zOffset;
        out.push(`G0 X${targetX.toFixed(3)} Y${targetY.toFixed(3)} Z${compensatedZ.toFixed(3)}`);
      } else {
        out.push(line);
      }

      curX = targetX;
      curY = targetY;
      curZ = targetZ;
    }

    return out;
  }

  // ============================================================================
  // Z-PROBE / XYZ PROBE ASSISTANT & AUTOMATIC HEIGHTMAP SCANNER
  // ============================================================================

  public async runProbe(config: ProbeConfig): Promise<{ success: boolean; point?: Coordinates }> {
    if (!this.status.connected) {
      throw new Error('CNC non connectée.');
    }

    const mode = config.mode || 'Z';
    const dirX = config.directionX === -1 ? -1 : 1;
    const dirY = config.directionY === -1 ? -1 : 1;
    const maxDist = Math.abs(config.maxSearchDistance || 25);
    const fastFeed = Math.max(10, config.fastFeedRate || 100);
    const slowFeed = Math.max(5, config.slowFeedRate || 25);
    const retract = Math.abs(config.retractDistance || 2);
    const safeZ = Math.abs(config.finalSafeZ || 10);
    const toolRadius = (config.toolDiameter || 3.175) / 2;
    const xyOffset = (config.plateThicknessXY || 0) + toolRadius;

    this.emitConsole(
      'info',
      `Démarrage cycle de palpage (${mode}) — Fraise Ø${config.toolDiameter || 3.175}mm`
    );

    try {
      // 1. Palpage Z (si mode Z ou XYZ)
      if (mode === 'Z' || mode === 'XYZ') {
        this.sendCommand(`G91 G38.2 Z-${maxDist.toFixed(3)} F${fastFeed}`);
        const firstHit = await this.waitForProbeResult(25000);
        if (!firstHit.success) {
          throw new Error('Palpeur Z non déclenché sur la course de recherche.');
        }

        this.sendCommand(`G91 G0 Z${retract.toFixed(3)}`);
        if (slowFeed > 0 && slowFeed < fastFeed) {
          this.sendCommand(`G91 G38.2 Z-${(retract + 2).toFixed(3)} F${slowFeed}`);
          const fineHit = await this.waitForProbeResult(15000);
          if (!fineHit.success) {
            throw new Error('Échec de la seconde touche lente du palpeur Z.');
          }
        }

        this.sendCommand(`G10 L20 P1 Z${(config.plateThicknessZ || 0).toFixed(3)}`);
        this.sendCommand(`G91 G0 Z${retract.toFixed(3)}`);
        this.sendCommand('G90');
      }

      // 2. Palpage X (si mode X, XY ou XYZ)
      if (mode === 'X' || mode === 'XY' || mode === 'XYZ') {
        const searchX = (dirX * maxDist).toFixed(3);
        const retractX = (-dirX * retract).toFixed(3);
        const fineSearchX = (dirX * (retract + 2)).toFixed(3);
        // Si on palpe vers X+ (bord gauche), le centre outil est à X = -xyOffset au contact
        const zeroOffsetX = (-dirX * xyOffset).toFixed(3);

        this.sendCommand(`G91 G38.2 X${searchX} F${fastFeed}`);
        const hitX = await this.waitForProbeResult(20000);
        if (!hitX.success) {
          throw new Error('Palpeur X non déclenché sur la course de recherche.');
        }

        this.sendCommand(`G91 G0 X${retractX}`);
        if (slowFeed > 0 && slowFeed < fastFeed) {
          this.sendCommand(`G91 G38.2 X${fineSearchX} F${slowFeed}`);
          await this.waitForProbeResult(15000);
        }

        this.sendCommand(`G10 L20 P1 X${zeroOffsetX}`);
        this.sendCommand(`G91 G0 X${retractX}`);
        this.sendCommand('G90');
      }

      // 3. Palpage Y (si mode Y, XY ou XYZ)
      if (mode === 'Y' || mode === 'XY' || mode === 'XYZ') {
        const searchY = (dirY * maxDist).toFixed(3);
        const retractY = (-dirY * retract).toFixed(3);
        const fineSearchY = (dirY * (retract + 2)).toFixed(3);
        const zeroOffsetY = (-dirY * xyOffset).toFixed(3);

        this.sendCommand(`G91 G38.2 Y${searchY} F${fastFeed}`);
        const hitY = await this.waitForProbeResult(20000);
        if (!hitY.success) {
          throw new Error('Palpeur Y non déclenché sur la course de recherche.');
        }

        this.sendCommand(`G91 G0 Y${retractY}`);
        if (slowFeed > 0 && slowFeed < fastFeed) {
          this.sendCommand(`G91 G38.2 Y${fineSearchY} F${slowFeed}`);
          await this.waitForProbeResult(15000);
        }

        this.sendCommand(`G10 L20 P1 Y${zeroOffsetY}`);
        this.sendCommand(`G91 G0 Y${retractY}`);
        this.sendCommand('G90');
      }

      // 4. Palpage Centre d'alésage (Center)
      if (mode === 'Center') {
        this.sendCommand(`G91 G38.2 X-${maxDist.toFixed(3)} F${fastFeed}`);
        const xLeft = await this.waitForProbeResult(20000);
        this.sendCommand(`G91 G0 X${retract.toFixed(3)}`);
        this.sendCommand(`G91 G38.2 X${(maxDist * 2).toFixed(3)} F${fastFeed}`);
        const xRight = await this.waitForProbeResult(20000);
        if (xLeft.success && xRight.success) {
          const midX = (xLeft.point.x + xRight.point.x) / 2;
          this.sendCommand(`G90 G0 X${midX.toFixed(3)}`);
          this.sendCommand('G10 L20 P1 X0');
        }

        this.sendCommand(`G91 G38.2 Y-${maxDist.toFixed(3)} F${fastFeed}`);
        const yFront = await this.waitForProbeResult(20000);
        this.sendCommand(`G91 G0 Y${retract.toFixed(3)}`);
        this.sendCommand(`G91 G38.2 Y${(maxDist * 2).toFixed(3)} F${fastFeed}`);
        const yBack = await this.waitForProbeResult(20000);
        if (yFront.success && yBack.success) {
          const midY = (yFront.point.y + yBack.point.y) / 2;
          this.sendCommand(`G90 G0 Y${midY.toFixed(3)}`);
          this.sendCommand('G10 L20 P1 Y0');
        }
        this.sendCommand('G90');
      }

      if (mode === 'Z' || mode === 'XYZ') {
        this.sendCommand(`G90 G0 Z${safeZ.toFixed(3)}`);
      }

      this.emitConsole('info', `Palpage ${mode} terminé avec succès.`);
      this.emit('probeResult', { success: true, point: { ...this.status.wpos } });
      return { success: true, point: { ...this.status.wpos } };
    } catch (err) {
      this.sendCommand('G90');
      const msg = (err as Error).message;
      this.emitConsole('error', `Échec du palpage: ${msg}`);
      this.emit('probeResult', { success: false, error: msg });
      return { success: false };
    }
  }

  public async scanHeightmap(gridInput: HeightmapGrid): Promise<HeightmapGrid> {
    if (!this.status.connected) {
      throw new Error('CNC non connectée.');
    }

    this.heightmapAbort = false;
    const cols = Math.max(2, gridInput.cols || 3);
    const rows = Math.max(2, gridInput.rows || 3);
    const stepX = (gridInput.maxX - gridInput.minX) / (cols - 1);
    const stepY = (gridInput.maxY - gridInput.minY) / (rows - 1);

    const points: HeightmapGrid['points'] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        points.push({
          row: r,
          col: c,
          x: Number((gridInput.minX + c * stepX).toFixed(3)),
          y: Number((gridInput.minY + r * stepY).toFixed(3)),
          z: null,
          probed: false
        });
      }
    }

    const grid: HeightmapGrid = {
      ...gridInput,
      cols,
      rows,
      points,
      isScanning: true,
      enabled: true
    };

    this.activeHeightmap = grid;
    this.emit('heightmap', grid);
    this.emitConsole(
      'info',
      `Démarrage du scan Heightmap (${cols}×${rows} = ${points.length} points)...`
    );

    const clearanceZ = Math.max(1, grid.clearanceZ || 5);
    const probeDepth = Math.abs(grid.probeDepthZ || 5);
    const feedRate = Math.max(20, grid.feedRate || 100);

    try {
      this.sendCommand(`G90 G0 Z${clearanceZ.toFixed(3)}`);

      // Serpentine scan for faster physical probing
      let baselineZ: number | null = null;

      for (let r = 0; r < rows; r++) {
        const colOrder =
          r % 2 === 0
            ? Array.from({ length: cols }, (_, i) => i)
            : Array.from({ length: cols }, (_, i) => cols - 1 - i);

        for (const c of colOrder) {
          if (this.heightmapAbort || !this.status.connected) {
            throw new Error('Scan Heightmap interrompu par l’utilisateur.');
          }

          const pt = grid.points.find((p) => p.row === r && p.col === c)!;

          // Move to XY above point
          this.sendCommand(`G90 G0 Z${clearanceZ.toFixed(3)}`);
          this.sendCommand(`G90 G0 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)}`);

          // Probe down
          this.sendCommand(`G90 G38.2 Z-${probeDepth.toFixed(3)} F${feedRate}`);
          const prb = await this.waitForProbeResult(25000);
          if (!prb.success) {
            throw new Error(`Absence de contact palpeur au point X=${pt.x} Y=${pt.y}`);
          }

          if (baselineZ === null) {
            baselineZ = prb.point.z;
          }
          // Record relative Z surface deviation (or absolute Z around 0)
          pt.z = Number((prb.point.z - baselineZ).toFixed(3));
          pt.probed = true;

          // Retract to clearance Z
          this.sendCommand(`G90 G0 Z${clearanceZ.toFixed(3)}`);
          this.emit('heightmap', { ...grid, points: [...grid.points] });
        }
      }

      grid.isScanning = false;
      this.activeHeightmap = grid;
      this.emit('heightmap', grid);
      this.emitConsole(
        'info',
        `Scan Heightmap terminé (${points.length} points mesurés). Compensation Z activée.`
      );
      return grid;
    } catch (err) {
      grid.isScanning = false;
      this.activeHeightmap = grid;
      this.emit('heightmap', grid);
      this.emitConsole('error', (err as Error).message);
      return grid;
    }
  }

  public stopHeightmapScan(): void {
    this.heightmapAbort = true;
    this.resolveProbeWaiters({ ...this.status.wpos }, false);
    if (this.activeHeightmap) {
      this.activeHeightmap.isScanning = false;
      this.emit('heightmap', this.activeHeightmap);
    }
  }

  private waitForProbeResult(timeoutMs = 20000): Promise<{ point: Coordinates; success: boolean }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.pendingProbeWaiters.indexOf(handler);
        if (idx !== -1) this.pendingProbeWaiters.splice(idx, 1);
        resolve({ point: { ...this.status.wpos }, success: false });
      }, timeoutMs);

      const handler = (point: Coordinates, success: boolean) => {
        clearTimeout(timer);
        resolve({ point, success });
      };

      this.pendingProbeWaiters.push(handler);
    });
  }

  private resolveProbeWaiters(point: Coordinates, success: boolean): void {
    const waiters = this.pendingProbeWaiters.splice(0, this.pendingProbeWaiters.length);
    for (const w of waiters) {
      w(point, success);
    }
  }

  // ============================================================================
  // HIGH-FIDELITY GRBL 1.1 SIMULATOR (ARDUINO UNO + CNC SHIELD V3.0)
  // ============================================================================

  private startSimulator(): void {
    if (this.simTickTimer) clearInterval(this.simTickTimer);
    // 40ms (25 Hz) smooth kinematics & status tick
    this.simTickTimer = setInterval(() => {
      this.tickSimulator(0.04);
    }, 40);
  }

  private handleSimulatorRealtime(byteVal: number): void {
    switch (byteVal) {
      case 0x3f: // '?' Status Report
        this.emitStatus();
        break;
      case 0x21: // '!' Feed Hold
        if (this.status.state === 'Run' || this.status.state === 'Jog') {
          this.status.state = 'Hold:0';
          this.status.feedRate = 0;
          this.emitStatus();
        }
        break;
      case 0x7e: // '~' Cycle Start / Resume
        if (this.status.state.startsWith('Hold')) {
          this.status.state = this.currentSimMotion || this.simMotionQueue.length > 0 ? 'Run' : 'Idle';
          this.emitStatus();
        }
        break;
      case 0x18: { // Ctrl-X Soft Reset
        const wasMoving =
          this.status.state === 'Run' ||
          this.status.state === 'Jog' ||
          this.status.state === 'Home';
        this.simMotionQueue = [];
        this.currentSimMotion = null;
        this.inFlightQueue = [];
        this.rxBytesUsed = 0;
        this.status.buffer.plannerBlocksAvailable = 15;
        this.status.buffer.rxBytesAvailable = RX_BUFFER_MAX;
        this.status.feedRate = 0;
        this.status.spindleSpeed = 0;
        this.status.accessories = {
          spindleCw: false,
          spindleCcw: false,
          floodCoolant: false,
          mistCoolant: false
        };
        this.status.overrides = { feed: 100, rapid: 100, spindle: 100 };

        if (wasMoving) {
          this.handleIncomingLine('ALARM:3');
        } else {
          this.status.state = 'Idle';
          this.status.alarmCode = undefined;
          this.status.alarmMessage = undefined;
        }
        this.handleIncomingLine("Grbl 1.1h ['$' for help]");
        this.emitStatus();
        break;
      }
      case 0x85: // Jog Cancel
        if (this.status.state === 'Jog' || this.currentSimMotion?.isJog) {
          this.simMotionQueue = this.simMotionQueue.filter((m) => !m.isJog);
          if (this.currentSimMotion?.isJog) {
            this.currentSimMotion = null;
          }
          this.status.state = 'Idle';
          this.status.feedRate = 0;
          this.emitStatus();
        }
        break;
      // Feed Overrides
      case 0x90:
        this.status.overrides.feed = 100;
        this.emitStatus();
        break;
      case 0x91:
        this.status.overrides.feed = Math.min(200, this.status.overrides.feed + 10);
        this.emitStatus();
        break;
      case 0x92:
        this.status.overrides.feed = Math.max(10, this.status.overrides.feed - 10);
        this.emitStatus();
        break;
      case 0x93:
        this.status.overrides.feed = Math.min(200, this.status.overrides.feed + 1);
        this.emitStatus();
        break;
      case 0x94:
        this.status.overrides.feed = Math.max(10, this.status.overrides.feed - 1);
        this.emitStatus();
        break;
      // Rapid Overrides
      case 0x95:
        this.status.overrides.rapid = 100;
        this.emitStatus();
        break;
      case 0x96:
        this.status.overrides.rapid = 50;
        this.emitStatus();
        break;
      case 0x97:
        this.status.overrides.rapid = 25;
        this.emitStatus();
        break;
      // Spindle Overrides
      case 0x99:
        this.status.overrides.spindle = 100;
        this.emitStatus();
        break;
      case 0x9a:
        this.status.overrides.spindle = Math.min(200, this.status.overrides.spindle + 10);
        this.emitStatus();
        break;
      case 0x9b:
        this.status.overrides.spindle = Math.max(10, this.status.overrides.spindle - 10);
        this.emitStatus();
        break;
      case 0x9c:
        this.status.overrides.spindle = Math.min(200, this.status.overrides.spindle + 1);
        this.emitStatus();
        break;
      case 0x9d:
        this.status.overrides.spindle = Math.max(10, this.status.overrides.spindle - 1);
        this.emitStatus();
        break;
      case 0x9e:
        this.status.accessories.spindleCw = !this.status.accessories.spindleCw;
        this.emitStatus();
        break;
      case 0xa0:
        this.status.accessories.floodCoolant = !this.status.accessories.floodCoolant;
        this.emitStatus();
        break;
      case 0xa1:
        this.status.accessories.mistCoolant = !this.status.accessories.mistCoolant;
        this.emitStatus();
        break;
    }
  }

  private processSimulatorCommand(rawCmd: string, byteLength: number, origLineIndex?: number): void {
    const cmd = this.stripGCodeComments(rawCmd);
    if (!cmd) {
      this.handleIncomingLine('ok');
      return;
    }

    // System commands ($)
    if (cmd === '$$') {
      const sortedIds = Array.from(this.settingsMap.keys()).sort((a, b) => a - b);
      for (const id of sortedIds) {
        const val = this.settingsMap.get(id)!;
        const formatted = Number.isInteger(val) && id < 100 && id !== 11 && id !== 12 && id !== 27
          ? `${val}`
          : val.toFixed(3);
        this.handleIncomingLine(`$${id}=${formatted}`);
      }
      this.handleIncomingLine('ok');
      return;
    }

    if (cmd === '$X') {
      this.status.state = 'Idle';
      this.status.alarmCode = undefined;
      this.status.alarmMessage = undefined;
      this.handleIncomingLine('[MSG:Caution: Unlocked]');
      this.handleIncomingLine('ok');
      this.emitStatus();
      return;
    }

    if (cmd === '$I') {
      this.handleIncomingLine('[VER:1.1h.20190825:SmartCNC-Uno-ShieldV3]');
      this.handleIncomingLine('[OPT:V,15,128]');
      this.handleIncomingLine('ok');
      return;
    }

    if (cmd === '$G') {
      const sp = this.status.accessories.spindleCw
        ? 'M3'
        : this.status.accessories.spindleCcw
          ? 'M4'
          : 'M5';
      const cl = this.status.accessories.floodCoolant
        ? 'M8'
        : this.status.accessories.mistCoolant
          ? 'M7'
          : 'M9';
      const unitCode = this.status.unit === 'mm' ? 'G21' : 'G20';
      this.handleIncomingLine(
        `[GC:${this.simModalMotion} ${this.status.activeWCS} G17 ${unitCode} ${this.status.distanceMode} G94 ${sp} ${cl} T0 F${Math.round(this.status.feedRate || 500)} S${Math.round(this.status.spindleSpeed)}]`
      );
      this.handleIncomingLine('ok');
      return;
    }

    if (cmd === '$H') {
      const plannedEnd = this.getPlannedEndMpos();
      this.status.state = 'Home';
      this.simMotionQueue.push({
        targetMpos: { x: plannedEnd.x, y: plannedEnd.y, z: 0 },
        feedRate: (this.settingsMap.get(25) || 500) * 1.5,
        isRapid: false,
        isHoming: true,
        lineByteLength: 0
      });
      this.simMotionQueue.push({
        targetMpos: { x: 0, y: 0, z: 0 },
        feedRate: (this.settingsMap.get(25) || 500) * 2,
        isRapid: false,
        isHoming: true,
        lineByteLength: byteLength,
        onComplete: () => {
          this.handleIncomingLine('ok');
        }
      });
      this.emitStatus();
      return;
    }

    // Setting assignment: $100=800
    const setMatch = cmd.match(/^\$(\d+)=([-\d.]+)$/);
    if (setMatch) {
      const id = parseInt(setMatch[1], 10);
      const val = parseFloat(setMatch[2]);
      if (Number.isNaN(val) || val < 0) {
        this.handleIncomingLine('error:4');
        return;
      }
      this.settingsMap.set(id, val);
      this.emit('settings', this.getSettingsList());
      this.handleIncomingLine('ok');
      return;
    }

    // Block G-code if in Alarm
    if (this.status.state === 'Alarm') {
      this.handleIncomingLine('error:9');
      return;
    }

    // Jog command: $J=G91 G21 X10 F1000
    if (cmd.startsWith('$J=')) {
      const jogBody = cmd.slice(3);
      const isRel = jogBody.includes('G91') || (!jogBody.includes('G90') && this.status.distanceMode === 'G91');
      const scale = jogBody.includes('G20') ? 25.4 : 1;
      const base = this.getPlannedEndMpos();
      const xVal = this.extractWord(jogBody, 'X');
      const yVal = this.extractWord(jogBody, 'Y');
      const zVal = this.extractWord(jogBody, 'Z');
      const fVal = this.extractWord(jogBody, 'F') ?? 1000;

      const targetMpos: Coordinates = {
        x: xVal !== null ? (isRel ? base.x + xVal * scale : xVal * scale + this.status.wco.x) : base.x,
        y: yVal !== null ? (isRel ? base.y + yVal * scale : yVal * scale + this.status.wco.y) : base.y,
        z: zVal !== null ? (isRel ? base.z + zVal * scale : zVal * scale + this.status.wco.z) : base.z
      };

      this.simMotionQueue.push({
        targetMpos,
        feedRate: Math.max(20, fVal),
        isRapid: false,
        isJog: true,
        lineByteLength: byteLength,
        onComplete: () => {
          this.handleIncomingLine('ok');
        }
      });
      return;
    }

    if (cmd === '$C') {
      this.status.state = this.status.state === 'Check' ? 'Idle' : 'Check';
      this.handleIncomingLine('ok');
      this.emitStatus();
      return;
    }

    if (cmd.startsWith('$')) {
      this.handleIncomingLine('error:3');
      return;
    }

    // Parse standard G-code block
    if (/\bG90\b/.test(cmd)) this.status.distanceMode = 'G90';
    if (/\bG91\b/.test(cmd)) this.status.distanceMode = 'G91';
    if (/\bG20\b/.test(cmd)) this.status.unit = 'in';
    if (/\bG21\b/.test(cmd)) this.status.unit = 'mm';

    const wcsMatch = cmd.match(/\b(G5[4-9])\b/);
    if (wcsMatch) {
      const wcs = wcsMatch[1] as GrblStatus['activeWCS'];
      this.status.activeWCS = wcs;
      this.status.wco = { ...this.wcsOffsets[wcs] };
      this.recomputeSimWpos();
    }

    // Spindle & Coolant M-codes
    const sWord = this.extractWord(cmd, 'S');
    if (sWord !== null) {
      this.status.spindleSpeed = Math.max(0, sWord);
    }
    if (/\bM0?3\b/.test(cmd)) {
      this.status.accessories.spindleCw = true;
      this.status.accessories.spindleCcw = false;
      if (this.status.spindleSpeed === 0) {
        this.status.spindleSpeed = this.settingsMap.get(30) || 10000;
      }
    }
    if (/\bM0?4\b/.test(cmd)) {
      this.status.accessories.spindleCcw = true;
      this.status.accessories.spindleCw = false;
      if (this.status.spindleSpeed === 0) {
        this.status.spindleSpeed = this.settingsMap.get(30) || 10000;
      }
    }
    if (/\bM0?5\b/.test(cmd)) {
      this.status.accessories.spindleCw = false;
      this.status.accessories.spindleCcw = false;
      this.status.spindleSpeed = 0;
    }
    if (/\bM0?7\b/.test(cmd)) this.status.accessories.mistCoolant = true;
    if (/\bM0?8\b/.test(cmd)) this.status.accessories.floodCoolant = true;
    if (/\bM0?9\b/.test(cmd)) {
      this.status.accessories.floodCoolant = false;
      this.status.accessories.mistCoolant = false;
    }

    // G10 L20 P1..6 or G92 work coordinate offset
    if (/\bG10\b/.test(cmd) && /\bL20\b/.test(cmd)) {
      const xVal = this.extractWord(cmd, 'X');
      const yVal = this.extractWord(cmd, 'Y');
      const zVal = this.extractWord(cmd, 'Z');
      const base = this.getPlannedEndMpos();

      if (xVal !== null) this.status.wco.x = Number((base.x - xVal).toFixed(3));
      if (yVal !== null) this.status.wco.y = Number((base.y - yVal).toFixed(3));
      if (zVal !== null) this.status.wco.z = Number((base.z - zVal).toFixed(3));

      this.wcsOffsets[this.status.activeWCS] = { ...this.status.wco };
      this.recomputeSimWpos();
      this.emitStatus();
      this.handleIncomingLine('ok');
      return;
    }

    if (/\bG92\.1\b/.test(cmd)) {
      this.status.wco = { x: 0, y: 0, z: 0 };
      this.recomputeSimWpos();
      this.emitStatus();
      this.handleIncomingLine('ok');
      return;
    }

    if (/\bG92\b/.test(cmd)) {
      const xVal = this.extractWord(cmd, 'X');
      const yVal = this.extractWord(cmd, 'Y');
      const zVal = this.extractWord(cmd, 'Z');
      const base = this.getPlannedEndMpos();

      if (xVal !== null) this.status.wco.x = Number((base.x - xVal).toFixed(3));
      if (yVal !== null) this.status.wco.y = Number((base.y - yVal).toFixed(3));
      if (zVal !== null) this.status.wco.z = Number((base.z - zVal).toFixed(3));

      this.recomputeSimWpos();
      this.emitStatus();
      this.handleIncomingLine('ok');
      return;
    }

    // Probing G38.2 / G38.3
    if (/\bG38\.[23]\b/.test(cmd)) {
      const base = this.getPlannedEndMpos();
      const isRel = this.status.distanceMode === 'G91';
      const xVal = this.extractWord(cmd, 'X');
      const yVal = this.extractWord(cmd, 'Y');
      const zVal = this.extractWord(cmd, 'Z');
      const fVal = this.extractWord(cmd, 'F') || 100;

      const simWposX = base.x - this.status.wco.x;
      const simWposY = base.y - this.status.wco.y;
      const warpZ =
        0.18 * Math.sin(simWposX / 35) * Math.cos(simWposY / 35) +
        0.0012 * simWposX -
        0.0008 * simWposY;

      let targetMpos: Coordinates;
      if (zVal !== null) {
        const requestedTargetZ = isRel ? base.z + zVal : zVal + this.status.wco.z;
        const surfaceMposZ = this.status.wco.z + warpZ;
        const contactMposZ =
          requestedTargetZ < base.z
            ? Math.max(requestedTargetZ + 0.5, Math.min(base.z - 0.8, surfaceMposZ))
            : requestedTargetZ;
        targetMpos = { x: base.x, y: base.y, z: Number(contactMposZ.toFixed(3)) };
      } else {
        targetMpos = {
          x: xVal !== null ? (isRel ? base.x + xVal * 0.4 : xVal + this.status.wco.x) : base.x,
          y: yVal !== null ? (isRel ? base.y + yVal * 0.4 : yVal + this.status.wco.y) : base.y,
          z: base.z
        };
      }

      this.simMotionQueue.push({
        targetMpos,
        feedRate: Math.max(25, fVal),
        isRapid: false,
        isProbe: true,
        lineByteLength: byteLength,
        onComplete: () => {
          this.status.pins.probe = true;
          this.handleIncomingLine(
            `[PRB:${this.status.mpos.x.toFixed(3)},${this.status.mpos.y.toFixed(3)},${this.status.mpos.z.toFixed(3)}:1]`
          );
          this.handleIncomingLine('ok');
          setTimeout(() => {
            this.status.pins.probe = false;
          }, 250);
        }
      });
      return;
    }

    // Motion G0 / G1 / G2 / G3
    if (/\bG0*0\b/.test(cmd)) this.simModalMotion = 'G0';
    else if (/\bG0*1\b/.test(cmd)) this.simModalMotion = 'G1';
    else if (/\bG0*2\b/.test(cmd)) this.simModalMotion = 'G2';
    else if (/\bG0*3\b/.test(cmd)) this.simModalMotion = 'G3';

    const fVal = this.extractWord(cmd, 'F');
    if (fVal !== null && fVal > 0) {
      this.status.feedRate = fVal;
    }

    const xVal = this.extractWord(cmd, 'X');
    const yVal = this.extractWord(cmd, 'Y');
    const zVal = this.extractWord(cmd, 'Z');
    const iVal = this.extractWord(cmd, 'I');
    const jVal = this.extractWord(cmd, 'J');
    const rVal = this.extractWord(cmd, 'R');

    if (
      xVal !== null ||
      yVal !== null ||
      zVal !== null ||
      iVal !== null ||
      jVal !== null ||
      rVal !== null
    ) {
      const isMachineCoords = /\bG53\b/.test(cmd);
      const isRel = !isMachineCoords && this.status.distanceMode === 'G91';
      const scale = this.status.unit === 'in' ? 25.4 : 1;
      const base = this.getPlannedEndMpos();

      const targetMpos: Coordinates = {
        x:
          xVal !== null
            ? isMachineCoords
              ? xVal * scale
              : isRel
                ? base.x + xVal * scale
                : xVal * scale + this.status.wco.x
            : base.x,
        y:
          yVal !== null
            ? isMachineCoords
              ? yVal * scale
              : isRel
                ? base.y + yVal * scale
                : yVal * scale + this.status.wco.y
            : base.y,
        z:
          zVal !== null
            ? isMachineCoords
              ? zVal * scale
              : isRel
                ? base.z + zVal * scale
                : zVal * scale + this.status.wco.z
            : base.z
      };

      const isRapid = this.simModalMotion === 'G0';
      const rapidRate = Math.max(
        this.settingsMap.get(110) || 2000,
        this.settingsMap.get(111) || 2000
      );
      const moveFeed = isRapid ? rapidRate : Math.max(50, this.status.feedRate || 600);

      // Interpolate G2 / G3 arcs in the simulator so the 3D cutter follows the exact arc!
      if ((this.simModalMotion === 'G2' || this.simModalMotion === 'G3') && !isMachineCoords) {
        const arcPts = this.interpolateSimArc(
          base,
          targetMpos,
          (iVal ?? 0) * scale,
          (jVal ?? 0) * scale,
          rVal !== null ? rVal * scale : undefined,
          this.simModalMotion === 'G2'
        );

        for (let k = 0; k < arcPts.length; k++) {
          const isLast = k === arcPts.length - 1;
          this.simMotionQueue.push({
            targetMpos: arcPts[k],
            feedRate: moveFeed,
            isRapid: false,
            lineByteLength: isLast ? byteLength : 0,
            origLineIndex,
            origCommand: rawCmd,
            onComplete: isLast
              ? () => {
                  this.handleIncomingLine('ok');
                }
              : undefined
          });
        }
        return;
      }

      this.simMotionQueue.push({
        targetMpos,
        feedRate: moveFeed,
        isRapid,
        lineByteLength: byteLength,
        origLineIndex,
        origCommand: rawCmd,
        onComplete: () => {
          this.handleIncomingLine('ok');
        }
      });
      return;
    }

    // Non-motion command
    this.handleIncomingLine('ok');
  }

  private interpolateSimArc(
    start: Coordinates,
    end: Coordinates,
    iOffset: number,
    jOffset: number,
    rValue: number | undefined,
    clockwise: boolean
  ): Coordinates[] {
    let cx = start.x + iOffset;
    let cy = start.y + jOffset;

    if (rValue !== undefined && iOffset === 0 && jOffset === 0) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        const r = Math.abs(rValue);
        const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4));
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;
        const sign = clockwise !== (rValue < 0) ? -1 : 1;
        cx = mx + (sign * h * dy) / d;
        cy = my - (sign * h * dx) / d;
      }
    }

    const radius = Math.hypot(start.x - cx, start.y - cy);
    if (radius < 1e-5) return [end];

    const startAngle = Math.atan2(start.y - cy, start.x - cx);
    const endAngle = Math.atan2(end.y - cy, end.x - cx);
    const isFullCircle =
      Math.abs(start.x - end.x) < 1e-5 &&
      Math.abs(start.y - end.y) < 1e-5 &&
      (Math.abs(iOffset) > 1e-5 || Math.abs(jOffset) > 1e-5);

    let sweepAngle = endAngle - startAngle;
    if (clockwise) {
      if (isFullCircle) sweepAngle = -Math.PI * 2;
      else if (sweepAngle >= -1e-6) sweepAngle -= Math.PI * 2;
    } else {
      if (isFullCircle) sweepAngle = Math.PI * 2;
      else if (sweepAngle <= 1e-6) sweepAngle += Math.PI * 2;
    }

    const arcLength = Math.abs(sweepAngle) * radius;
    const steps = Math.max(6, Math.min(36, Math.ceil(arcLength / 1.5)));
    const endRadius = Math.hypot(end.x - cx, end.y - cy);
    const pts: Coordinates[] = [];

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const angle = startAngle + sweepAngle * t;
      const curR = radius + (endRadius - radius) * t;
      pts.push({
        x: s === steps ? end.x : Number((cx + Math.cos(angle) * curR).toFixed(3)),
        y: s === steps ? end.y : Number((cy + Math.sin(angle) * curR).toFixed(3)),
        z: Number((start.z + (end.z - start.z) * t).toFixed(3))
      });
    }
    return pts;
  }

  private tickSimulator(dtSec: number): void {
    if (!this.status.connected || !this.status.isSimulator) return;

    if (this.status.state.startsWith('Hold') || this.status.state === 'Alarm') {
      return;
    }

    const ovFactor =
      this.currentSimMotion?.isRapid
        ? this.status.overrides.rapid / 100
        : this.status.overrides.feed / 100;

    // Allow consuming multiple micro-segments within a single 40ms tick if the G-code has tiny segments
    let remainingTimeSec = dtSec * (this.jobStatus.state === 'running' ? 1.8 : 1.0);
    let moved = false;

    while (remainingTimeSec > 0.0001) {
      if (!this.currentSimMotion) {
        if (this.simMotionQueue.length === 0) break;
        this.currentSimMotion = this.simMotionQueue.shift()!;
        if (
          this.jobStatus.state === 'running' &&
          this.currentSimMotion.origLineIndex !== undefined &&
          this.currentSimMotion.origLineIndex >= 0
        ) {
          this.jobStatus.currentLineIndex = this.currentSimMotion.origLineIndex;
          if (this.currentSimMotion.origCommand) {
            this.jobStatus.currentCommand = this.currentSimMotion.origCommand;
          }
        }
      }

      const seg = this.currentSimMotion;
      if (seg.isHoming) {
        this.status.state = 'Home';
      } else if (seg.isJog) {
        this.status.state = 'Jog';
      } else {
        this.status.state = 'Run';
      }

      const dx = seg.targetMpos.x - this.status.mpos.x;
      const dy = seg.targetMpos.y - this.status.mpos.y;
      const dz = seg.targetMpos.z - this.status.mpos.z;
      const dist = Math.hypot(dx, dy, dz);

      const segOv = seg.isRapid
        ? this.status.overrides.rapid / 100
        : this.status.overrides.feed / 100;
      const effectiveFeedMmMin = Math.max(10, seg.feedRate * segOv);
      this.status.feedRate = Math.round(effectiveFeedMmMin);
      const speedMmSec = effectiveFeedMmMin / 60;
      const maxDistThisStep = speedMmSec * remainingTimeSec;

      if (dist <= maxDistThisStep || dist < 0.001) {
        const timeUsed = speedMmSec > 0 ? dist / speedMmSec : 0;
        remainingTimeSec = Math.max(0, remainingTimeSec - timeUsed);
        this.status.mpos = { ...seg.targetMpos };
        this.recomputeSimWpos();
        moved = true;
        const completed = this.currentSimMotion;
        this.currentSimMotion = null;
        if (completed.onComplete) {
          completed.onComplete();
        }
      } else {
        const ratio = maxDistThisStep / dist;
        this.status.mpos = {
          x: Number((this.status.mpos.x + dx * ratio).toFixed(3)),
          y: Number((this.status.mpos.y + dy * ratio).toFixed(3)),
          z: Number((this.status.mpos.z + dz * ratio).toFixed(3))
        };
        this.recomputeSimWpos();
        moved = true;
        remainingTimeSec = 0;
      }
    }

    this.status.buffer.plannerBlocksAvailable = Math.max(0, 15 - this.simMotionQueue.length);

    if (!this.currentSimMotion && this.simMotionQueue.length === 0) {
      if (this.status.state !== 'Idle') {
        this.status.state = 'Idle';
        this.status.feedRate = 0;
        this.emitStatus();
      } else if (moved) {
        this.emitStatus();
      }
    } else if (moved) {
      this.emitStatus();
    }
  }

  private getPlannedEndMpos(): Coordinates {
    if (this.simMotionQueue.length > 0) {
      return { ...this.simMotionQueue[this.simMotionQueue.length - 1].targetMpos };
    }
    if (this.currentSimMotion) {
      return { ...this.currentSimMotion.targetMpos };
    }
    return { ...this.status.mpos };
  }

  private recomputeSimWpos(): void {
    this.status.wpos = {
      x: Number((this.status.mpos.x - this.status.wco.x).toFixed(3)),
      y: Number((this.status.mpos.y - this.status.wco.y).toFixed(3)),
      z: Number((this.status.mpos.z - this.status.wco.z).toFixed(3))
    };
  }

  private extractWord(line: string, letter: string): number | null {
    const regex = new RegExp(`${letter}([-+]?\\d*\\.?\\d+)`, 'i');
    const match = line.match(regex);
    return match ? parseFloat(match[1]) : null;
  }

  // ============================================================================
  // EVENT EMITTERS
  // ============================================================================

  private emitStatus(): void {
    this.emit('status', this.status);
  }

  private emitJobStatus(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastJobEmitTime < 65) {
      return;
    }
    this.lastJobEmitTime = now;
    this.updateJobTiming();
    this.emit('job', this.jobStatus);
  }

  private emitConsole(
    type: ConsoleEntry['type'],
    text: string,
    detail?: string
  ): void {
    const entry: ConsoleEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      type,
      text,
      ...(detail ? { detail } : {})
    };
    this.emit('console', entry);
  }
}

