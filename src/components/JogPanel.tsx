import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  OctagonX,
  Keyboard,
  Gamepad2,
  Fan,
  Droplets,
  Wind,
  PowerOff,
  Gauge,
  Move,
  Hand,
} from 'lucide-react';
import { GrblStatus } from '../types/cnc';

export interface JogPanelProps {
  status: GrblStatus;
  onSendCommand: (command: string) => void;
  onSendRealtime?: (byte: number | string) => void;
  onJog?: (axes: { x?: number; y?: number; z?: number }, feedRate: number) => void;
  onCancelJog?: () => void;
}

const STEP_PRESETS = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100];
const XY_FEED_PRESETS = [300, 1000, 2000, 3000, 5000];
const Z_FEED_PRESETS = [100, 300, 500, 1000];

export const JogPanel: React.FC<JogPanelProps> = ({
  status,
  onSendCommand,
  onSendRealtime,
  onJog,
  onCancelJog,
}) => {
  const [activeTab, setActiveTab] = useState<'jog' | 'spindle'>('jog');
  const [jogMode, setJogMode] = useState<'step' | 'continuous'>('step');
  const [stepSize, setStepSize] = useState<number>(1);
  const [customStepInput, setCustomStepInput] = useState<string>('1');
  const [xyFeedRate, setXyFeedRate] = useState<number>(2000);
  const [zFeedRate, setZFeedRate] = useState<number>(500);
  const [spindleRpm, setSpindleRpm] = useState<number>(status.spindleSpeed || 12000);
  const [keyboardEnabled, setKeyboardEnabled] = useState<boolean>(true);
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false);
  const [gamepadName, setGamepadName] = useState<string>('');
  const [gamepadActiveAxis, setGamepadActiveAxis] = useState<string | null>(null);
  const [isHoldingContinuous, setIsHoldingContinuous] = useState<boolean>(false);

  const continuousActiveRef = useRef<boolean>(false);
  const gamepadWasJoggingRef = useRef<boolean>(false);
  const lastDpadTimeRef = useRef<number>(0);
  const lastAnalogSendRef = useRef<number>(0);

  useEffect(() => () => {
    if (!continuousActiveRef.current && !gamepadWasJoggingRef.current) return;
    if (onCancelJog) onCancelJog();
    else onSendRealtime?.(0x85);
  }, [onCancelJog, onSendRealtime]);

  const canJog =
    status.connected && (status.state === 'Idle' || status.state === 'Jog' || status.state === 'Check');

  const sendCancelJog = useCallback(() => {
    continuousActiveRef.current = false;
    setIsHoldingContinuous(false);
    if (onCancelJog) {
      onCancelJog();
    } else if (onSendRealtime) {
      onSendRealtime(0x85);
    } else {
      onSendCommand('\x85');
    }
  }, [onCancelJog, onSendRealtime, onSendCommand]);

  const sendFeedHold = useCallback(() => {
    if (onSendRealtime) {
      onSendRealtime('!');
    } else {
      onSendCommand('!');
    }
  }, [onSendRealtime, onSendCommand]);

  const executeJogMove = useCallback(
    (dx: number, dy: number, dz: number, customFeed?: number) => {
      if (!canJog) return;
      const isZOnly = dx === 0 && dy === 0 && dz !== 0;
      const feed = customFeed ?? (isZOnly ? zFeedRate : xyFeedRate);

      if (onJog) {
        const axes: { x?: number; y?: number; z?: number } = {};
        if (dx !== 0) axes.x = dx;
        if (dy !== 0) axes.y = dy;
        if (dz !== 0) axes.z = dz;
        onJog(axes, feed);
        return;
      }

      const unitCode = status.unit === 'in' ? 'G20' : 'G21';
      const parts: string[] = [];
      if (dx !== 0) parts.push(`X${dx.toFixed(3)}`);
      if (dy !== 0) parts.push(`Y${dy.toFixed(3)}`);
      if (dz !== 0) parts.push(`Z${dz.toFixed(3)}`);
      if (parts.length === 0) return;

      onSendCommand(`$J=${unitCode}G91 ${parts.join(' ')} F${Math.round(feed)}`);
    },
    [canJog, xyFeedRate, zFeedRate, onJog, status.unit, onSendCommand]
  );

  const handleDirectionPointerDown = (dirX: number, dirY: number, dirZ: number) => {
    if (!canJog) return;
    if (jogMode === 'step') {
      executeJogMove(dirX * stepSize, dirY * stepSize, dirZ * stepSize);
    } else {
      continuousActiveRef.current = true;
      setIsHoldingContinuous(true);
      const travel = dirZ !== 0 ? 100 : 300;
      executeJogMove(dirX * travel, dirY * travel, dirZ * travel);
    }
  };

  const handleDirectionPointerUp = () => {
    if (jogMode === 'continuous' && continuousActiveRef.current) {
      sendCancelJog();
    }
  };

  const selectStep = (val: number) => {
    setStepSize(val);
    setCustomStepInput(String(val));
  };

  // Raccourcis Clavier sécurisés
  useEffect(() => {
    if (!keyboardEnabled) return;

    const isInputFocused = (el: EventTarget | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        el.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.activeElement?.closest('dialog[open]')) return;
      if (isInputFocused(e.target) || isInputFocused(document.activeElement)) return;
      if (e.repeat && jogMode === 'step') return;

      if (e.code === 'Space') {
        e.preventDefault();
        sendFeedHold();
        return;
      }

      if (e.key === '[' || e.code === 'BracketLeft') {
        e.preventDefault();
        const idx = STEP_PRESETS.indexOf(stepSize);
        const nextIdx = idx > 0 ? idx - 1 : 0;
        selectStep(STEP_PRESETS[nextIdx]);
        return;
      }

      if (e.key === ']' || e.code === 'BracketRight') {
        e.preventDefault();
        const idx = STEP_PRESETS.indexOf(stepSize);
        const nextIdx = idx >= 0 && idx < STEP_PRESETS.length - 1 ? idx + 1 : STEP_PRESETS.length - 1;
        selectStep(STEP_PRESETS[nextIdx]);
        return;
      }

      if (e.key === 'Escape') {
        sendCancelJog();
        return;
      }

      let dx = 0;
      let dy = 0;
      let dz = 0;

      switch (e.code) {
        case 'ArrowUp':
        case 'Numpad8':
          dy = 1;
          break;
        case 'ArrowDown':
        case 'Numpad2':
          dy = -1;
          break;
        case 'ArrowLeft':
        case 'Numpad4':
          dx = -1;
          break;
        case 'ArrowRight':
        case 'Numpad6':
          dx = 1;
          break;
        case 'Numpad7':
          dx = -1;
          dy = 1;
          break;
        case 'Numpad9':
          dx = 1;
          dy = 1;
          break;
        case 'Numpad1':
          dx = -1;
          dy = -1;
          break;
        case 'Numpad3':
          dx = 1;
          dy = -1;
          break;
        case 'PageUp':
        case 'NumpadAdd':
          dz = 1;
          break;
        case 'PageDown':
        case 'NumpadSubtract':
          dz = -1;
          break;
        case 'Numpad5':
          e.preventDefault();
          sendCancelJog();
          return;
        default:
          return;
      }

      e.preventDefault();
      if (jogMode === 'step') {
        executeJogMove(dx * stepSize, dy * stepSize, dz * stepSize);
      } else if (!continuousActiveRef.current) {
        continuousActiveRef.current = true;
        setIsHoldingContinuous(true);
        const travel = dz !== 0 ? 100 : 300;
        executeJogMove(dx * travel, dy * travel, dz * travel);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (jogMode === 'continuous' && continuousActiveRef.current) {
        const navKeys = [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'PageUp',
          'PageDown',
          'Numpad8',
          'Numpad2',
          'Numpad4',
          'Numpad6',
          'Numpad7',
          'Numpad9',
          'Numpad1',
          'Numpad3',
          'NumpadAdd',
          'NumpadSubtract',
        ];
        if (navKeys.includes(e.code)) {
          sendCancelJog();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [keyboardEnabled, jogMode, stepSize, executeJogMove, sendCancelJog, sendFeedHold]);

  // Intégration native Web Gamepad API
  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      setGamepadConnected(true);
      setGamepadName(e.gamepad.id.split('(')[0].trim() || 'Manette USB');
    };
    const onDisconnect = () => {
      setGamepadConnected(false);
      setGamepadName('');
      setGamepadActiveAxis(null);
    };

    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    let rafId: number;
    const DEADZONE = 0.18;

    const pollGamepad = () => {
      if (typeof navigator.getGamepads === 'function') {
        const pads = navigator.getGamepads();
        const pad = pads ? pads[0] || pads[1] || pads[2] || pads[3] : null;

        if (pad && pad.connected) {
          if (!gamepadConnected) {
            setGamepadConnected(true);
            setGamepadName(pad.id.split('(')[0].trim() || 'Manette CNC');
          }

          const now = performance.now();
          if (pad.buttons[1]?.pressed || pad.buttons[2]?.pressed) {
            sendCancelJog();
            gamepadWasJoggingRef.current = false;
            setGamepadActiveAxis('STOP (0x85)');
          } else {
            const dpadUp = pad.buttons[12]?.pressed;
            const dpadDown = pad.buttons[13]?.pressed;
            const dpadLeft = pad.buttons[14]?.pressed;
            const dpadRight = pad.buttons[15]?.pressed;
            const lbPressed = pad.buttons[4]?.pressed;
            const rbPressed = pad.buttons[5]?.pressed;

            if (
              (dpadUp || dpadDown || dpadLeft || dpadRight || lbPressed || rbPressed) &&
              now - lastDpadTimeRef.current > 240
            ) {
              lastDpadTimeRef.current = now;
              const dx = (dpadRight ? 1 : 0) - (dpadLeft ? 1 : 0);
              const dy = (dpadUp ? 1 : 0) - (dpadDown ? 1 : 0);
              const dz = (rbPressed ? 1 : 0) - (lbPressed ? 1 : 0);
              executeJogMove(dx * stepSize, dy * stepSize, dz * stepSize);
              setGamepadActiveAxis(`D-Pad (${stepSize}mm)`);
            } else {
              const rawX = pad.axes[0] || 0;
              const rawY = -(pad.axes[1] || 0);
              const rawRightZ = -(pad.axes[3] || 0);
              const ltVal = pad.buttons[6]?.value || 0;
              const rtVal = pad.buttons[7]?.value || 0;
              const rawZ = Math.abs(rawRightZ) > DEADZONE ? rawRightZ : rtVal - ltVal;

              const ax = Math.abs(rawX) > DEADZONE ? rawX : 0;
              const ay = Math.abs(rawY) > DEADZONE ? rawY : 0;
              const az = Math.abs(rawZ) > DEADZONE ? rawZ : 0;

              if (ax !== 0 || ay !== 0 || az !== 0) {
                gamepadWasJoggingRef.current = true;
                const mag = Math.min(1, Math.hypot(ax, ay, az));
                setGamepadActiveAxis(
                  `Analog ${ax !== 0 ? 'X ' : ''}${ay !== 0 ? 'Y ' : ''}${az !== 0 ? 'Z ' : ''}(${Math.round(
                    mag * 100
                  )}%)`
                );

                if (now - lastAnalogSendRef.current > 120) {
                  lastAnalogSendRef.current = now;
                  const baseFeed = az !== 0 && ax === 0 && ay === 0 ? zFeedRate : xyFeedRate;
                  const scaledFeed = Math.max(60, Math.round(baseFeed * mag));
                  const deltaSec = 0.14;
                  const distFactor = (scaledFeed / 60) * deltaSec;
                  executeJogMove(ax * distFactor, ay * distFactor, az * distFactor, scaledFeed);
                }
              } else if (gamepadWasJoggingRef.current) {
                gamepadWasJoggingRef.current = false;
                setGamepadActiveAxis(null);
                sendCancelJog();
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(pollGamepad);
    };

    rafId = requestAnimationFrame(pollGamepad);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, [gamepadConnected, stepSize, xyFeedRate, zFeedRate, executeJogMove, sendCancelJog]);

  const isSpindleActive = status.accessories.spindleCw || status.accessories.spindleCcw;
  const isCoolantActive = status.accessories.floodCoolant || status.accessories.mistCoolant;

  const padBtnClass =
    'relative flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed h-12 select-none touch-none';

  return (
    <div className="bg-white border border-slate-200/90 text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl p-3 flex flex-col gap-2.5 select-none">
      {/* En-tête : 2 Onglets segmentés Jog XY/Z vs Broche & Aux avec état live permanent */}
      <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('jog')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'jog'
              ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 border border-transparent'
          }`}
        >
          <Move className="w-3.5 h-3.5 text-sky-600" />
          <span>Jog XY/Z</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('spindle')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'spindle'
              ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 border border-transparent'
          }`}
        >
          <Fan
            className={`w-3.5 h-3.5 shrink-0 ${
              isSpindleActive ? 'text-amber-600 animate-spin' : 'text-slate-500'
            }`}
          />
          <span className="truncate">Broche & Aux</span>
          {isSpindleActive ? (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-mono text-[10px] font-bold shrink-0">
              {status.spindleSpeed}
            </span>
          ) : isCoolantActive ? (
            <span className="px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-800 font-mono text-[10px] font-bold shrink-0">
              AUX
            </span>
          ) : (
            <span className="text-[10px] font-mono text-slate-400 shrink-0">OFF</span>
          )}
        </button>
      </div>

      {activeTab === 'jog' ? (
        <>
          {/* Sous-en-tête : Pas / Continu + Clavier / Manette */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setJogMode('step')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  jogMode === 'step'
                    ? 'bg-white text-slate-900 border border-slate-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Move className="w-3 h-3 text-sky-600" />
                <span>Pas</span>
              </button>
              <button
                type="button"
                onClick={() => setJogMode('continuous')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  jogMode === 'continuous'
                    ? 'bg-amber-500 text-white border border-amber-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Hand className="w-3 h-3" />
                <span>Continu</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setKeyboardEnabled((v) => !v)}
                title="Activer/Désactiver le pilotage au clavier (Flèches, PageUp/Down, Pavé num, [ / ], Espace = Pause)"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                  keyboardEnabled
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <Keyboard className="w-3 h-3" />
                <span>{keyboardEnabled ? 'Clavier' : 'Clavier OFF'}</span>
              </button>

              <div
                title={
                  gamepadConnected
                    ? `Manette active : ${gamepadName}`
                    : 'Branchez une manette USB et appuyez sur un bouton'
                }
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                  gamepadConnected
                    ? 'bg-sky-50 border-sky-200 text-sky-800'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <Gamepad2 className={`w-3 h-3 ${gamepadConnected ? 'text-sky-600' : ''}`} />
                <span className="truncate max-w-[85px]">
                  {gamepadConnected ? gamepadActiveAxis || 'Manette' : 'Manette'}
                </span>
              </div>
            </div>
          </div>

          {/* Pavé directionnel XY 8 directions + Stop 0x85 + Colonne Z dédiée */}
          <div className="grid grid-cols-4 gap-1.5 items-stretch">
            {/* Grille 3x3 pour XY */}
            <div className="col-span-3 grid grid-cols-3 gap-1.5">
              {/* X- Y+ */}
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(-1, 1, 0)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                className={padBtnClass}
                title="Diagonale Arrière-Gauche (X- Y+)"
                aria-label="Diagonale X- Y+"
              >
                <ArrowUpLeft className="w-4 h-4 text-slate-500" />
              </button>

              {/* Y+ */}
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(0, 1, 0)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                className={`${padBtnClass} border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400`}
                title="Y+ (Arrière)"
              >
                <ArrowUp className="w-4 h-4 text-emerald-600" />
                <span className="text-[11px] font-mono font-bold text-emerald-700 leading-none">Y+</span>
              </button>

              {/* X+ Y+ */}
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(1, 1, 0)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                className={padBtnClass}
                title="Diagonale Arrière-Droite (X+ Y+)"
                aria-label="Diagonale X+ Y+"
              >
                <ArrowUpRight className="w-4 h-4 text-slate-500" />
              </button>

              {/* X- */}
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(-1, 0, 0)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                className={`${padBtnClass} border-red-200 bg-red-50/40 hover:bg-red-50 hover:border-red-400`}
                title="X- (Gauche)"
              >
                <ArrowLeft className="w-4 h-4 text-red-600" />
                <span className="text-[11px] font-mono font-bold text-red-700 leading-none">X-</span>
              </button>

              {/* STOP JOG (0x85) central */}
              <button
                type="button"
                disabled={!status.connected}
                onClick={sendCancelJog}
                title="Arrêt immédiat du Jog (Octet temps réel 0x85)"
                className={`flex flex-col items-center justify-center rounded-xl border font-mono font-bold transition-colors cursor-pointer h-12 ${
                  status.state === 'Jog' || isHoldingContinuous
                    ? 'bg-red-600 border-red-700 text-white'
                    : 'bg-red-50 border-red-200 hover:bg-red-600 text-red-700 hover:text-white'
                }`}
              >
                <OctagonX className="w-4 h-4" />
                <span className="text-[10px] tracking-wider leading-none mt-0.5">STOP</span>
              </button>

              {/* X+ */}
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(1, 0, 0)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                className={`${padBtnClass} border-red-200 bg-red-50/40 hover:bg-red-50 hover:border-red-400`}
                title="X+ (Droite)"
              >
                <ArrowRight className="w-4 h-4 text-red-600" />
                <span className="text-[11px] font-mono font-bold text-red-700 leading-none">X+</span>
              </button>

              {/* X- Y- */}
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(-1, -1, 0)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                className={padBtnClass}
                title="Diagonale Avant-Gauche (X- Y-)"
                aria-label="Diagonale X- Y-"
              >
                <ArrowDownLeft className="w-4 h-4 text-slate-500" />
              </button>

              {/* Y- */}
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(0, -1, 0)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                className={`${padBtnClass} border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400`}
                title="Y- (Avant)"
              >
                <ArrowDown className="w-4 h-4 text-emerald-600" />
                <span className="text-[11px] font-mono font-bold text-emerald-700 leading-none">Y-</span>
              </button>

              {/* X+ Y- */}
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(1, -1, 0)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                className={padBtnClass}
                title="Diagonale Avant-Droite (X+ Y-)"
                aria-label="Diagonale X+ Y-"
              >
                <ArrowDownRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Colonne dédiée Axe Z (Z+ Monter / Z- Descendre) */}
            <div className="col-span-1 flex flex-col justify-between gap-1.5">
              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(0, 0, 1)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                title="Monter la fraise (Z+)"
                className="flex-1 flex flex-col items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 active:bg-blue-100 text-slate-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none touch-none"
              >
                <ArrowUp className="w-4 h-4 text-blue-600" />
                <span className="font-mono text-xs font-bold text-blue-700 leading-none mt-0.5">Z+</span>
                <span className="text-[9px] text-slate-500 mt-0.5">Monter</span>
              </button>

              <button
                type="button"
                disabled={!canJog}
                onPointerDown={() => handleDirectionPointerDown(0, 0, -1)}
                onPointerUp={handleDirectionPointerUp}
                onPointerLeave={handleDirectionPointerUp}
                title="Descendre la fraise (Z-)"
                className="flex-1 flex flex-col items-center justify-center rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 active:bg-blue-100 text-slate-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none touch-none"
              >
                <span className="text-[9px] text-slate-500 mb-0.5">Desc.</span>
                <span className="font-mono text-xs font-bold text-blue-700 leading-none">Z-</span>
                <ArrowDown className="w-4 h-4 text-blue-600 mt-0.5" />
              </button>
            </div>
          </div>

          {/* Sélecteur de Pas (Step Size) : 0.01 à 100 mm + Champ personnalisé */}
          <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-200/80 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Pas ({status.unit}) <span className="text-slate-400 font-normal">[ / ]</span>
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label="Pas d'incrément personnalisé"
                  step="0.01"
                  min="0.001"
                  max="500"
                  value={customStepInput}
                  onChange={(e) => {
                    setCustomStepInput(e.target.value);
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) setStepSize(v);
                  }}
                  className="w-16 bg-white border border-slate-200 focus:border-sky-500 rounded-md px-1.5 py-0.5 font-mono text-xs font-bold text-slate-900 text-right focus:outline-none"
                />
                <span className="text-[10px] font-mono text-slate-400">{status.unit}</span>
              </div>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-9 gap-1">
              {STEP_PRESETS.map((preset) => {
                const active = Math.abs(stepSize - preset) < 0.0001;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => selectStep(preset)}
                    className={`py-1 rounded-md font-mono text-[11px] font-bold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-600 border-sky-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Réglages rapides de Vitesse XY et Vitesse Z (mm/min) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {/* Vitesse XY */}
            <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-200/80 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-emerald-600" />
                  XY
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label="Vitesse de jog XY"
                    min={10}
                    max={20000}
                    step={100}
                    value={xyFeedRate}
                    onChange={(e) => setXyFeedRate(Math.max(10, Number(e.target.value) || 100))}
                    className="w-16 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-900 text-right focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[9px] font-mono text-slate-400">mm/m</span>
                </div>
              </div>
              <div className="flex items-center divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white overflow-hidden">
                {XY_FEED_PRESETS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setXyFeedRate(f)}
                    className={`flex-1 py-1 text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                      xyFeedRate === f
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Vitesse Z */}
            <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-200/80 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-blue-600" />
                  Z
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label="Vitesse de jog Z"
                    min={10}
                    max={5000}
                    step={50}
                    value={zFeedRate}
                    onChange={(e) => setZFeedRate(Math.max(10, Number(e.target.value) || 50))}
                    className="w-16 bg-white border border-slate-200 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-900 text-right focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[9px] font-mono text-slate-400">mm/m</span>
                </div>
              </div>
              <div className="flex items-center divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white overflow-hidden">
                {Z_FEED_PRESETS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setZFeedRate(f)}
                    className={`flex-1 py-1 text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                      zFeedRate === f
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bandeau de sécurité rapide si broche ou arrosage actif */}
          {(isSpindleActive || isCoolantActive) && (
            <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs">
              <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-amber-900">
                {isSpindleActive && (
                  <span className="inline-flex items-center gap-1">
                    <Fan className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                    Broche {status.accessories.spindleCw ? 'M3' : 'M4'} · {status.spindleSpeed} RPM
                  </span>
                )}
                {isCoolantActive && (
                  <span className="inline-flex items-center gap-1 text-sky-800">
                    <Droplets className="w-3.5 h-3.5 text-sky-600" />
                    {status.accessories.floodCoolant ? 'M8' : 'M7'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isSpindleActive && (
                  <button
                    type="button"
                    disabled={!status.connected}
                    onClick={() => onSendCommand('M5')}
                    className="px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] cursor-pointer"
                  >
                    STOP M5
                  </button>
                )}
                {isCoolantActive && (
                  <button
                    type="button"
                    disabled={!status.connected}
                    onClick={() => onSendCommand('M9')}
                    className="px-2 py-0.5 rounded-md bg-sky-700 hover:bg-sky-800 text-white font-bold text-[11px] cursor-pointer"
                  >
                    M9
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ONGLET 2 : BROCHE (SPINDLE PWM) & ARROSAGE / ASPIRATION */
        <div className="flex flex-col gap-2.5">
          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Fan
                  className={`w-4 h-4 ${
                    isSpindleActive ? 'text-amber-600 animate-spin' : 'text-slate-500'
                  }`}
                />
                <span className="text-xs font-bold text-slate-800">Broche PWM</span>
              </div>
              <div className="font-mono text-xs flex items-center gap-2">
                <span className="text-slate-500">
                  Cible <strong className="text-slate-900">{spindleRpm}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-amber-700 font-bold">
                  Actuel {status.spindleSpeed} RPM
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-slate-400">0</span>
              <input
                type="range"
                aria-label="Vitesse cible de la broche"
                min={0}
                max={24000}
                step={500}
                value={spindleRpm}
                onChange={(e) => setSpindleRpm(Number(e.target.value))}
                className="flex-1 accent-amber-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-[11px] text-slate-400">24k</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => onSendCommand(`M3 S${spindleRpm}`)}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 ${
                  status.accessories.spindleCw
                    ? 'bg-amber-500 border-amber-600 text-white'
                    : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Fan className="w-3.5 h-3.5" />
                <span>Horaire (M3)</span>
              </button>

              <button
                type="button"
                disabled={!status.connected}
                onClick={() => onSendCommand(`M4 S${spindleRpm}`)}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 ${
                  status.accessories.spindleCcw
                    ? 'bg-orange-500 border-orange-600 text-white'
                    : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Fan className="w-3.5 h-3.5" />
                <span>Anti-hor. (M4)</span>
              </button>

              <button
                type="button"
                disabled={!status.connected}
                onClick={() => onSendCommand('M5')}
                className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-red-50 border border-red-200 hover:bg-red-600 text-red-700 hover:text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>STOP (M5)</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Arrosage & Aspiration
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={!status.connected}
                onClick={() => onSendCommand('M8')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                  status.accessories.floodCoolant
                    ? 'bg-sky-600 border-sky-600 text-white font-bold'
                    : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Droplets className={`w-3.5 h-3.5 ${status.accessories.floodCoolant ? 'text-white' : 'text-sky-600'}`} />
                <span>Flood (M8)</span>
              </button>

              <button
                type="button"
                disabled={!status.connected}
                onClick={() => onSendCommand('M7')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                  status.accessories.mistCoolant
                    ? 'bg-sky-600 border-sky-600 text-white font-bold'
                    : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Wind className={`w-3.5 h-3.5 ${status.accessories.mistCoolant ? 'text-white' : 'text-sky-600'}`} />
                <span>Mist (M7)</span>
              </button>

              <button
                type="button"
                disabled={!status.connected}
                onClick={() => onSendCommand('M9')}
                className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
              >
                <span>Arrêt (M9)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JogPanel;
