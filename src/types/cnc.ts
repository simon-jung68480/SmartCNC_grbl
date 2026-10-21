export type MachineState =
  | 'Disconnected'
  | 'Idle'
  | 'Run'
  | 'Hold'
  | 'Hold:0'
  | 'Hold:1'
  | 'Jog'
  | 'Alarm'
  | 'Door'
  | 'Door:0'
  | 'Door:1'
  | 'Door:2'
  | 'Door:3'
  | 'Check'
  | 'Home'
  | 'Sleep';

export interface Coordinates {
  x: number;
  y: number;
  z: number;
  a?: number;
}

export interface OverrideState {
  feed: number;   // 10% - 200% (100 default)
  rapid: number;  // 25, 50, 100
  spindle: number; // 10% - 200% (100 default)
}

export interface AccessoryState {
  spindleCw: boolean;
  spindleCcw: boolean;
  floodCoolant: boolean;
  mistCoolant: boolean;
}

export interface PinState {
  xLimit: boolean;
  yLimit: boolean;
  zLimit: boolean;
  probe: boolean;
  door: boolean;
  hold: boolean;
  softReset: boolean;
  cycleStart: boolean;
}

export interface GrblStatus {
  connected: boolean;
  portPath: string;
  baudRate: number;
  isSimulator: boolean;
  state: MachineState;
  subState?: string;
  alarmCode?: number;
  alarmMessage?: string;
  lastError?: string;
  mpos: Coordinates; // Machine Position
  wpos: Coordinates; // Work Position
  wco: Coordinates;  // Work Coordinate Offset (MPos - WPos)
  activeWCS: 'G54' | 'G55' | 'G56' | 'G57' | 'G58' | 'G59';
  unit: 'mm' | 'in';
  distanceMode: 'G90' | 'G91';
  feedRate: number;
  spindleSpeed: number;
  overrides: OverrideState;
  accessories: AccessoryState;
  pins: PinState;
  buffer: {
    plannerBlocksAvailable: number;
    rxBytesAvailable: number;
  };
  lineNumber?: number;
  version?: string;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
  friendlyName: string;
  isArduino?: boolean;
}

export interface JobStatus {
  state: 'idle' | 'running' | 'paused' | 'completed' | 'aborted' | 'error';
  fileName: string;
  totalLines: number;
  sentLines: number;
  acknowledgedLines: number;
  currentLineIndex: number;
  currentCommand: string;
  progressPercent: number;
  startTime: number | null;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  rxBufferUsed: number;
  rxBufferMax: number;
  heightmapApplied: boolean;
}

export interface ConsoleEntry {
  id: string;
  timestamp: string;
  type: 'tx' | 'rx' | 'ok' | 'error' | 'alarm' | 'info' | 'status';
  text: string;
  detail?: string;
}

export interface GrblSettingItem {
  id: number;
  code: string; // e.g., "$100"
  value: number;
  unit: string;
  name: string;
  category: 'Steppers' | 'Steps/mm' | 'Max Rate' | 'Acceleration' | 'Max Travel' | 'Limits & Homing' | 'Spindle & Laser' | 'General';
  description: string;
}

export interface CustomMacro {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  gcode: string;
  confirmBeforeRun?: boolean;
}

export interface ProbeConfig {
  mode: 'Z' | 'X' | 'Y' | 'XY' | 'XYZ' | 'Center';
  directionX?: 1 | -1; // 1 = palper vers X+ (coin gauche), -1 = vers X- (coin droit)
  directionY?: 1 | -1; // 1 = palper vers Y+ (coin avant), -1 = vers Y- (coin arrière)
  plateThicknessZ: number; // mm, e.g., 19.0 or 1.6 (PCB)
  plateThicknessXY: number; // mm
  toolDiameter: number; // mm, e.g. 3.175 (1/8")
  maxSearchDistance: number; // mm, e.g. 25
  fastFeedRate: number; // mm/min, e.g. 100
  slowFeedRate: number; // mm/min, e.g. 25
  retractDistance: number; // mm, e.g. 2.0
  finalSafeZ: number; // mm, e.g. 10.0
}

export interface HeightmapGrid {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cols: number;
  rows: number;
  clearanceZ: number;
  probeDepthZ: number;
  feedRate: number;
  points: {
    row: number;
    col: number;
    x: number;
    y: number;
    z: number | null;
    probed: boolean;
  }[];
  isScanning: boolean;
  enabled: boolean;
}

export interface GCodeSegment {
  lineIndex: number;
  lineText: string;
  type: 'G0' | 'G1' | 'G2' | 'G3';
  start: Coordinates;
  end: Coordinates;
  feedRate: number;
  spindleSpeed: number;
  distance: number;
  durationSec: number;
}

export interface ParsedGCodeStats {
  fileName: string;
  totalLines: number;
  motionLines: number;
  bounds: {
    min: Coordinates;
    max: Coordinates;
    size: Coordinates;
  };
  totalDistanceMm: number;
  cuttingDistanceMm: number;
  rapidDistanceMm: number;
  estimatedTimeSec: number;
  maxFeedRate: number;
  maxSpindleSpeed: number;
  toolsUsed: number[];
}
