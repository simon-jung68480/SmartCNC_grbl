import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileUp,
  Flame,
  Grid2X2,
  Image,
  Layers,
  Play,
  RotateCcw,
  Scan,
  Settings2,
  Square,
  Upload,
} from "lucide-react";
import type {
  Coordinates,
  GrblSettingItem,
  GrblStatus,
  JobStatus,
} from "../types/cnc";
import {
  analyseLaserGCode,
  boundsOfPaths,
  calibrationPaths,
  framingGCode,
  generateRasterGCode,
  generateVectorGCode,
  materialTestPaths,
  placePaths,
  expandLaserBounds,
  laserSpotDiameter,
  type LaserFocusSettings,
  type LaserCutSettings,
  type LaserPath,
  type MaterialTest,
  type Placement,
  type RasterData,
  type RasterSettings,
} from "../utils/laserCam";
import { prepareLaserFill, type LaserFillSettings } from "../utils/laserFill";
import type { AppPreferences } from "../utils/appPreferences";
import { LaserPreview } from "./LaserPreview";
import { LaserDesignEditor } from "./LaserDesignEditor";
import { LaserCalibrationPanel } from "./LaserCalibrationPanel";
import { duplicateLaserObject, generateLaserDocument, type LaserDocumentObject } from "../utils/laserDocument";
import { parseLaserProject, serializeLaserProject } from "../utils/laserProject";

interface Props {
  status: GrblStatus;
  job: JobStatus;
  settings: GrblSettingItem[];
  machineEnvelope: Coordinates;
  preferences: AppPreferences;
  active: boolean;
  onRefreshSettings: () => void;
  onStart: (name: string, gcode: string) => void;
  onSimulate: (name: string, gcode: string, maxPower: number) => Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onJog: (axes: { x?: number; y?: number }, feed: number) => void;
  onZero: (axis: "XY") => void;
  onLaserOff: () => void;
}
type Source =
  | { kind: "vector"; name: string; paths: LaserPath[]; warnings: string[]; objects: LaserDocumentObject[]; selectedId: string }
  | { kind: "raster"; name: string; image: RasterData; previewUrl: string }
  | { kind: "test"; name: string }
  | { kind: "gcode"; name: string };
type Pattern = "material" | "square-circle" | "lines";
const button =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors";
const input =
  "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-100";
const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const initialPlacement: Placement = {
  width: 50,
  height: 50,
  x: 0,
  y: 0,
  anchor: "bottom-left",
  rotation: 0,
  mirrorX: false,
  mirrorY: false,
};
const initialCut: LaserCutSettings = {
  feed: 1200,
  power: 20,
  maxPower: 1000,
  passes: 1,
  mode: "M4",
  focus: {
    enabled: false,
    spotDiameter: 1,
    offset: 2,
    controlZ: false,
    referenceZ: 0,
    zFeed: 300,
    restoreZ: true,
  },
};
const initialTest: MaterialTest = {
  columns: 5,
  rows: 5,
  size: 8,
  gap: 3,
  minFeed: 500,
  maxFeed: 2500,
  minPower: 10,
  maxPower: 50,
  hatch: 0.4,
};
const numberLabel = (v: number) => Number(v.toFixed(2)).toLocaleString("fr-FR");
const duration = (s: number) =>
  s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <label className="block text-xs text-slate-600 space-y-1">
      <span>{label}</span>
      <input
        className={input}
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}

export const LaserWorkshop: React.FC<Props> = ({
  status,
  job,
  settings,
  machineEnvelope,
  preferences,
  active,
  onRefreshSettings,
  onStart,
  onSimulate,
  onPause,
  onResume,
  onStop,
  onJog,
  onZero,
  onLaserOff,
}) => {
  const [source, setSource] = useState<Source>({
    kind: "test",
    name: "Test vitesse-puissance",
  });
  const [placement, setPlacement] = useState<Placement>(initialPlacement),
    [cut, setCut] = useState<LaserCutSettings>(initialCut);
  const [fill, setFill] = useState<LaserFillSettings>({
    mode: "fill-and-contours",
    spacing: 0.1,
    angle: 0,
    crossHatch: false,
    respectSvgFill: true,
  });
  const focus = cut.focus!;
  const changeFocus = (patch: Partial<LaserFocusSettings>) =>
    setCut((c) => ({ ...c, focus: { ...c.focus!, ...patch } }));
  const [test, setTest] = useState<MaterialTest>(initialTest),
    [pattern, setPattern] = useState<Pattern>("material"),
    [calibrationSize, setCalibrationSize] = useState(30);
  const [raster, setRaster] = useState({
      interval: 0.2,
      threshold: 128,
      grayscale: true,
      invert: false,
      overscan: 2,
    }),
    [lockedRatio, setLockedRatio] = useState(true);
  const documentObjects = useMemo(() => source.kind === "vector" ? source.objects.map(object => object.id === source.selectedId ? { ...object, placement, cut, fill } : object) : [], [source, placement, cut, fill]);
  const [savedVector, setSavedVector] = useState<Extract<Source, { kind: "vector" }> | null>(null);
  useEffect(() => { if (source.kind === "vector") setSavedVector({ ...source, objects: documentObjects }); }, [source, documentObjects]);
  const signature = useMemo(
    () => ({
      source,
      placement,
      cut,
      test,
      pattern,
      calibrationSize,
      raster,
      fill,
    }),
    [source, placement, cut, test, pattern, calibrationSize, raster, fill],
  );
  const [program, setProgram] = useState<{
    name: string;
    code: string;
    signature: typeof signature | null;
    notes?: string[];
  } | null>(null);
  const [playbackProgram, setPlaybackProgram] = useState<typeof program>(null);
  const [confirmed, setConfirmed] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const [step, setStep] = useState(1),
    [jogFeed, setJogFeed] = useState(1000),
    [margin, setMargin] = useState(2),
    [showCode, setShowCode] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const projectUploadRef = useRef<HTMLInputElement>(null);
  const laserMode = settings.find((s) => s.id === 32)?.value,
    machineMaxPower = settings.find((s) => s.id === 30)?.value;
  const busy =
    job.state === "running" ||
    job.state === "paused" ||
    status.state === "Run" ||
    status.state.startsWith("Hold") ||
    status.state === "Jog";
  const idle = status.connected && status.state === "Idle" && !busy,
    canMove =
      idle && !status.accessories.spindleCw && !status.accessories.spindleCcw;
  const stale = !!program?.signature && program.signature !== signature;
  const chosenSpot = laserSpotDiameter(program?.signature?.cut || cut);
  const spotDiameter =
    Number.isFinite(chosenSpot) && chosenSpot > 0 && chosenSpot <= 20
      ? chosenSpot
      : 0.15;
  const analysis = useMemo(() => {
    if (!program) return null;
    const parsed = analyseLaserGCode(program.code, program.name);
    if (!parsed.bounds) return parsed;
    const bounds = expandLaserBounds(parsed.bounds, spotDiameter);
    return {
      ...parsed,
      bounds,
      stats: {
        ...parsed.stats,
        bounds: {
          min: { ...parsed.stats.bounds.min, x: bounds.minX, y: bounds.minY },
          max: { ...parsed.stats.bounds.max, x: bounds.maxX, y: bounds.maxY },
          size: {
            ...parsed.stats.bounds.size,
            x: bounds.width,
            y: bounds.height,
          },
        },
      },
    };
  }, [program, spotDiameter]);
  const scaleMismatch =
    !!program?.signature &&
    machineMaxPower !== undefined &&
    program.signature.cut.maxPower !== machineMaxPower;
  const powerExceeded =
    !!analysis &&
    machineMaxPower !== undefined &&
    analysis.stats.maxSpindleSpeed > machineMaxPower;
  const focusInputsValid =
    !focus.enabled ||
    (Number.isFinite(focus.spotDiameter) &&
      focus.spotDiameter >= 0.02 &&
      focus.spotDiameter <= 20 &&
      Number.isFinite(focus.offset) &&
      Math.abs(focus.offset) <= 50);
  const startAllowed =
    idle &&
    laserMode === 1 &&
    !!analysis?.engraving.length &&
    confirmed &&
    !stale &&
    !scaleMismatch &&
    !powerExceeded &&
    focusInputsValid;
  const coordinateMismatch =
    analysis?.coordinateSystems.some((code) => code !== status.activeWCS) ||
    false;
  const rasterOverscan =
    program?.signature?.source.kind === "raster"
      ? program.signature.raster.overscan
      : 0;
  useEffect(() => {
    setConfirmed(false);
  }, [
    signature,
    program,
    status.connected,
    laserMode,
    machineMaxPower,
    status.activeWCS,
    status.wco.x,
    status.wco.y,
    status.wco.z,
  ]);
  const changeCut = (key: keyof LaserCutSettings, value: number | string) =>
    setCut((c) => ({ ...c, [key]: value }));
  const setSize = (axis: "width" | "height", value: number) =>
    setPlacement((p) => {
      const other = axis === "width" ? "height" : "width";
      return {
        ...p,
        [axis]: value,
        ...(lockedRatio && p[axis] > 0
          ? { [other]: (p[other] * value) / p[axis] }
          : {}),
      };
    });
  const loadObject = (objects: LaserDocumentObject[], selectedId: string) => {
    const object = objects.find(object => object.id === selectedId) ?? objects[0];
    if (!object) return;
    setSource({ kind: "vector", name: object.name, paths: object.paths, warnings: object.warnings, objects, selectedId: object.id });
    setPlacement(object.placement);
    setFill(object.fill);
    setCut(current => ({ ...object.cut, maxPower: current.maxPower, mode: current.mode, focus: current.focus }));
  };
  const saveProject = () => {
    try {
      const content = serializeLaserProject({ objects: documentObjects, selectedId: source.kind === "vector" ? source.selectedId : "", cut });
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "atelier.smartlaser.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError((error as Error).message); }
  };
  const openProject = async (file: File) => {
    setError(""); setWorking(true);
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error("Projet trop volumineux (32 Mo maximum).");
      const project = parseLaserProject(await file.text());
      loadObject(project.objects, project.selectedId);
      const selected = project.objects.find(object => object.id === project.selectedId)!;
      setCut({ ...selected.cut, maxPower: project.cut.maxPower, mode: project.cut.mode, focus: project.cut.focus });
      setProgram(null); setConfirmed(false);
    } catch (error) { setError((error as Error).message); }
    finally { setWorking(false); }
  };
  const selectPattern = (kind: Pattern) => {
    setPattern(kind);
    setSource({
      kind: "test",
      name:
        kind === "material"
          ? "Test vitesse-puissance"
          : kind === "lines"
            ? "Lignes de mise au point"
            : "Carré et cercle de précision",
    });
    setProgram(null);
    setError("");
    setPlacement((p) => ({
      ...p,
      rotation: 0,
      mirrorX: false,
      mirrorY: false,
    }));
  };
  const importFile = async (file: File) => {
    setWorking(true);
    setError("");
    setConfirmed(false);
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Fichier trop volumineux (20 Mo maximum).");
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (["nc", "gcode", "gc", "tap", "txt"].includes(ext || "")) {
        const code = await file.text();
        setSource({ kind: "gcode", name: file.name });
        setProgram({ name: file.name, code, signature: null });
        return;
      }
      const importer = await import("../utils/laserImport");
      if (ext === "svg" || ext === "dxf") {
        const result =
          ext === "svg"
            ? importer.importSvg(await file.text())
            : importer.importDxf(await file.text());
        const object: LaserDocumentObject = {
          id: crypto.randomUUID(), name: file.name, paths: result.paths, warnings: result.warnings, enabled: true,
          cut: { ...cut }, fill: { ...fill }, placement: {
          ...initialPlacement,
          width: Number(result.widthMm.toFixed(3)),
          height: Number(result.heightMm.toFixed(3)),
          x: source.kind === "vector" ? placement.x + 5 : 0,
          y: source.kind === "vector" ? placement.y + 5 : 0,
        } };
        if (documentObjects.length >= 200) throw new Error("Maximum 200 objets par projet.");
        loadObject([...documentObjects, object], object.id);
      } else if (["png", "jpg", "jpeg", "webp", "bmp"].includes(ext || "")) {
        const image = await importer.importRaster(file);
        setSource({
          kind: "raster",
          name: file.name,
          image,
          previewUrl: image.previewUrl,
        });
        setPlacement({
          ...initialPlacement,
          width: 50,
          height: (50 * image.height) / image.width,
        });
      } else
        throw new Error(
          "Format accepté : SVG, DXF ASCII, PNG, JPEG, WebP, BMP ou G-code.",
        );
      setProgram(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const generate = async () => {
    setError("");
    setWorking(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      let code = "",
        notes: string[] = [];
      if (source.kind === "raster") {
        const config: RasterSettings = {
          ...raster,
          width: placement.width,
          height: placement.height,
          x:
            placement.x -
            (placement.anchor === "center" ? placement.width / 2 : 0),
          y:
            placement.y -
            (placement.anchor === "center" ? placement.height / 2 : 0),
        };
        code = generateRasterGCode(source.image, config, cut, source.name);
      } else if (source.kind === "vector") {
        const generated = generateLaserDocument(documentObjects, cut);
        code = generated.code; notes = generated.notes;
      } else if (source.kind !== "gcode") {
        const paths =
          pattern === "material"
              ? materialTestPaths(test)
              : calibrationPaths(pattern, calibrationSize);
        const b = boundsOfPaths(paths),
          config =
            source.kind === "test"
              ? { ...placement, width: b.width, height: b.height }
              : placement;
        let placed = placePaths(paths, config);
        code = generateVectorGCode(placed, cut, source.name);
      }
      setProgram({
        name: source.kind === "vector" && documentObjects.length > 1 ? "Composition laser.nc" : source.name.replace(/\.[^.]+$/, "") + ".nc",
        code,
        signature,
        notes,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const frame = () => {
    setError("");
    if (
      !analysis?.bounds ||
      !analysis.canFrame ||
      !canMove ||
      !focusInputsValid ||
      stale ||
      coordinateMismatch
    )
      return;
    try {
      const code = framingGCode(
        analysis.bounds,
        Math.max(margin, rasterOverscan),
        jogFeed,
      );
      if (
        window.confirm(
          "Parcourir les limites XY de la gravure, laser éteint ? Vérifiez que la tête peut se déplacer à sa hauteur actuelle.",
        )
      )
        onStart("Cadrage laser — sans émission.nc", code);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const download = () => {
    if (!program) return;
    const url = URL.createObjectURL(
        new Blob([program.code], { type: "text/plain;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = program.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="flex-1 min-h-0 overflow-auto bg-slate-100 text-slate-800">
      <div className="max-w-[1700px] mx-auto p-3 md:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3 items-center">
            <div className="rounded-xl bg-amber-500 p-2.5 text-white">
              <Flame size={25} />
            </div>
            <div>
              <h1 className="font-bold text-xl">Atelier laser</h1>
              <p className="text-xs text-slate-500">
                Préparer · cadrer · graver — repère pièce {status.activeWCS}
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <span
              className={`text-xs font-semibold px-3 py-1.5 rounded-full ${laserMode === 1 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
            >
              GRBL $32{" "}
              {laserMode === undefined
                ? "inconnu"
                : laserMode === 1
                  ? "activé"
                  : "désactivé"}
            </span>
            <button
              className={button}
              disabled={!status.connected || busy}
              onClick={onRefreshSettings}
            >
              <RotateCcw size={13} />
              Lire GRBL
            </button>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}
        <div className="grid xl:grid-cols-[350px_minmax(0,1fr)_290px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <section className={card}>
              <h2 className="text-sm font-bold flex gap-2 items-center mb-3">
                <FileUp size={17} />
                1. Dessin ou programme
              </h2>
              <input
                ref={uploadRef}
                className="hidden"
                type="file"
                accept=".svg,.dxf,.png,.jpg,.jpeg,.webp,.bmp,.nc,.gcode,.gc,.tap,.txt"
                disabled={busy || working}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void importFile(file);
                }}
              />
              <button
                className="w-full p-4 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 disabled:opacity-40 text-sm font-semibold flex flex-col items-center gap-2"
                disabled={busy || working}
                onClick={() => uploadRef.current?.click()}
              >
                <Upload size={23} />
                {working
                  ? "Traitement en cours…"
                  : "Importer SVG, DXF, image ou G-code"}
                <span className="text-[10px] font-normal">
                  PNG · JPEG · WebP · BMP · NC · GCODE
                </span>
              </button>
              <input ref={projectUploadRef} type="file" accept=".smartlaser.json,.json" className="hidden" disabled={busy || working} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void openProject(file); }} />
              <div className="flex gap-2 mt-2">
                <button className={button} disabled={busy || working} onClick={() => projectUploadRef.current?.click()}>Ouvrir projet</button>
                <button className={button} disabled={busy || working || source.kind !== "vector"} onClick={saveProject}>Sauver projet</button>
              </div>
              {source.kind !== "vector" && savedVector && <button className={`${button} mt-2`} disabled={busy || working} onClick={() => { loadObject(savedVector.objects, savedVector.selectedId); setProgram(null); }}>Revenir à la composition ({savedVector.objects.length} objets)</button>}
              <p className="text-xs font-semibold mt-3 break-all">
                {source.name}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {source.kind === "vector"
                  ? `${source.paths.length} contours · surfaces et tracés disponibles`
                  : source.kind === "raster"
                    ? "Image · balayage horizontal aller-retour"
                    : source.kind === "gcode"
                      ? "G-code importé conservé sans modification"
                      : "Motif paramétrique intégré"}
              </p>
              {source.kind === "raster" && (
                <img
                  src={source.previewUrl}
                  alt="Image source à graver"
                  className="max-h-32 max-w-full mx-auto mt-3 rounded border bg-white object-contain"
                />
              )}
              {source.kind === "vector" && source.warnings.length > 0 && (
                <ul className="text-[11px] text-amber-800 space-y-1 mt-3 list-disc pl-4">
                  {source.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </section>
            {source.kind === "vector" && (
              <fieldset
                disabled={busy || working}
                className={`${card} disabled:opacity-60`}
              >
                <h2 className="text-sm font-bold mb-3">Surfaces pleines</h2>
                <label className="block text-xs space-y-1">
                  <span>Type de gravure</span>
                  <select
                    className={input}
                    value={fill.mode}
                    onChange={(e) =>
                      setFill((f) => ({
                        ...f,
                        mode: e.target.value as LaserFillSettings["mode"],
                      }))
                    }
                  >
                    <option value="contours">Contours uniquement</option>
                    <option value="fill">Remplissage uniquement</option>
                    <option value="fill-and-contours">
                      Remplissage + contours
                    </option>
                  </select>
                </label>
                {fill.mode !== "contours" && (
                  <>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <NumberField
                        label="Pas des hachures (mm)"
                        value={fill.spacing}
                        min={0.025}
                        max={10}
                        onChange={(v) => setFill((f) => ({ ...f, spacing: v }))}
                      />
                      <NumberField
                        label="Angle des hachures (°)"
                        value={fill.angle}
                        onChange={(v) => setFill((f) => ({ ...f, angle: v }))}
                      />
                    </div>
                    <button
                      className="text-xs underline text-sky-700 mt-2"
                      onClick={() =>
                        setFill((f) => ({
                          ...f,
                          spacing: Number(
                            (laserSpotDiameter(cut) * 0.8).toFixed(3),
                          ),
                        }))
                      }
                    >
                      Pas = 80 % de la largeur du spot
                    </button>
                    <label className="flex gap-2 items-start text-xs mt-3">
                      <input
                        type="checkbox"
                        checked={fill.crossHatch}
                        onChange={(e) =>
                          setFill((f) => ({
                            ...f,
                            crossHatch: e.target.checked,
                          }))
                        }
                      />
                      Hachures croisées (second balayage à 90°)
                    </label>
                    <label className="flex gap-2 items-start text-xs mt-2">
                      <input
                        type="checkbox"
                        checked={fill.respectSvgFill}
                        onChange={(e) =>
                          setFill((f) => ({
                            ...f,
                            respectSvgFill: e.target.checked,
                          }))
                        }
                      />
                      Respecter les zones pleines du SVG (fill / fill-rule)
                    </label>
                    <p className="text-[10px] text-slate-500 mt-2">
                      Les trous restent vides et les surfaces qui se chevauchent
                      sont réunies. En DXF, les contours fermés imbriqués
                      définissent les trous. Le centre des hachures est décalé
                      vers l’intérieur d’un demi-spot pour limiter les
                      débordements.
                    </p>
                  </>
                )}
              </fieldset>
            )}
            <fieldset
              disabled={busy || working}
              className={`${card} disabled:opacity-60`}
            >
              <h2 className="text-sm font-bold mb-3">
                Hors focus et traits larges
              </h2>
              <label className="flex gap-2 items-start text-xs">
                <input
                  type="checkbox"
                  checked={focus.enabled}
                  onChange={(e) => changeFocus({ enabled: e.target.checked })}
                />
                Utiliser une gravure hors focus
              </label>
              {focus.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <NumberField
                      label="Largeur mesurée du spot (mm)"
                      value={focus.spotDiameter}
                      min={0.02}
                      max={20}
                      onChange={(v) => changeFocus({ spotDiameter: v })}
                    />
                    <NumberField
                      label="Décalage de focus (mm)"
                      value={focus.offset}
                      min={-50}
                      max={50}
                      onChange={(v) => changeFocus({ offset: v })}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">
                    Mesurez la largeur réellement obtenue sur votre matériau à
                    ce décalage. Elle n’est pas calculée à partir de Z. Un
                    décalage positif monte la tête ; un décalage négatif la
                    descend. Sans pilotage Z, faites ce réglage manuellement
                    avant la gravure.
                  </p>
                  {source.kind !== "gcode" ? (
                    <>
                      <label className="flex gap-2 items-start text-xs mt-3">
                        <input
                          type="checkbox"
                          checked={focus.controlZ}
                          onChange={(e) =>
                            changeFocus({ controlZ: e.target.checked })
                          }
                        />
                        Appliquer ce décalage avec l’axe Z dans le G-code
                      </label>
                      {focus.controlZ && (
                        <div className="mt-3 space-y-2">
                          <NumberField
                            label={`Z pièce au focus (${status.activeWCS}, mm)`}
                            value={focus.referenceZ}
                            onChange={(v) => changeFocus({ referenceZ: v })}
                          />
                          <NumberField
                            label="Avance Z (mm/min)"
                            value={focus.zFeed}
                            min={1}
                            max={5000}
                            onChange={(v) => changeFocus({ zFeed: v })}
                          />
                          <p className="text-xs font-semibold text-amber-900">
                            Z cible :{" "}
                            {numberLabel(focus.referenceZ + focus.offset)} mm,
                            avant le premier déplacement XY.
                          </p>
                          <label className="flex gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={focus.restoreZ}
                              onChange={(e) =>
                                changeFocus({ restoreZ: e.target.checked })
                              }
                            />
                            Revenir au Z de focus en fin de programme
                          </label>
                          <p className="text-[10px] text-slate-500">
                            Les déplacements Z se font laser éteint. Le cadrage
                            reste à la hauteur Z actuelle.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-amber-900 mt-2">
                      G-code externe conservé : réglage du focus manuel
                      uniquement. Aucune commande Z n’est ajoutée.
                    </p>
                  )}
                </>
              )}
            </fieldset>
            <fieldset
              disabled={busy || working}
              className={`${card} disabled:opacity-60`}
            >
              <h2 className="text-sm font-bold flex gap-2 items-center mb-3">
                <Grid2X2 size={17} />
                Bibliothèque de tests
              </h2>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["material", "Vitesse / puissance"],
                    ["square-circle", "Carré + cercle"],
                    ["lines", "Mise au point"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`rounded-lg border p-2 text-[11px] font-semibold ${source.kind === "test" && pattern === value ? "border-amber-500 bg-amber-50 text-amber-900" : "border-slate-200 hover:bg-slate-50"}`}
                    onClick={() => selectPattern(value)}
                  >
                    {value === "material" ? (
                      <Grid2X2 size={19} className="mx-auto mb-1" />
                    ) : value === "lines" ? (
                      <Layers size={19} className="mx-auto mb-1" />
                    ) : (
                      <Square size={19} className="mx-auto mb-1" />
                    )}
                    {label}
                  </button>
                ))}
              </div>
              {source.kind === "test" &&
                (pattern === "material" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {(
                        [
                          ["columns", "Colonnes (vitesses)", 2, 10],
                          ["rows", "Lignes (puissances)", 2, 10],
                          ["size", "Carré (mm)", 1, 100],
                          ["gap", "Écart (mm)", 0, 50],
                          ["minFeed", "Vitesse min (mm/min)", 1, 30000],
                          ["maxFeed", "Vitesse max (mm/min)", 1, 30000],
                          ["minPower", "Puissance min (%)", 1, 100],
                          ["maxPower", "Puissance max (%)", 1, 100],
                          ["hatch", "Remplissage (mm)", 0.05, 5],
                        ] as const
                      ).map(([key, label, min, max]) => (
                        <NumberField
                          key={key}
                          label={label}
                          value={test[key]}
                          min={min}
                          max={max}
                          onChange={(value) =>
                            setTest((t) => ({ ...t, [key]: value }))
                          }
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      Vitesse croissante de gauche à droite ; puissance
                      croissante du bas vers le haut. Les valeurs de chaque case
                      figurent dans les commentaires du G-code. Aucun texte
                      n’est gravé.
                    </p>
                  </>
                ) : (
                  <div className="mt-3">
                    <NumberField
                      label="Dimension du motif (mm)"
                      value={calibrationSize}
                      min={1}
                      onChange={setCalibrationSize}
                    />
                    <p className="text-[10px] text-slate-500 mt-2">
                      {pattern === "lines"
                        ? "10 lignes à puissance fixe. Ajustez la hauteur de la tête entre les essais pour comparer la mise au point."
                        : "Carré extérieur et cercle de diamètre 80 % du carré, pour contrôler dimensions et géométrie."}
                    </p>
                  </div>
                ))}
            </fieldset>
            {source.kind !== "gcode" && (
              <fieldset
                disabled={busy || working}
                className={`${card} disabled:opacity-60`}
              >
                <h2 className="text-sm font-bold flex gap-2 items-center mb-3">
                  <Settings2 size={17} />
                  2. Réglages de gravure
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Avance (mm/min)"
                    value={cut.feed}
                    min={1}
                    onChange={(v) => changeCut("feed", v)}
                  />
                  <NumberField
                    label="Puissance (%)"
                    value={cut.power}
                    min={0.1}
                    max={100}
                    onChange={(v) => changeCut("power", v)}
                  />
                  <NumberField
                    label="Passes"
                    value={cut.passes}
                    min={1}
                    max={50}
                    step={1}
                    onChange={(v) => changeCut("passes", v)}
                  />
                  <NumberField
                    label="S maximal (= GRBL $30)"
                    value={cut.maxPower}
                    min={1}
                    onChange={(v) => changeCut("maxPower", v)}
                  />
                </div>
                {machineMaxPower !== undefined &&
                  machineMaxPower !== cut.maxPower && (
                    <button
                      className="text-xs text-sky-700 underline mt-2"
                      onClick={() => changeCut("maxPower", machineMaxPower)}
                    >
                      Utiliser $30 = {machineMaxPower} de la machine
                    </button>
                  )}
                <label className="block text-xs text-slate-600 mt-3 space-y-1">
                  <span>Commande de puissance</span>
                  <select
                    className={input}
                    value={cut.mode}
                    onChange={(e) => changeCut("mode", e.target.value)}
                  >
                    <option value="M4">M4 — puissance dynamique</option>
                    <option value="M3">M3 — puissance constante</option>
                  </select>
                </label>
                {source.kind === "test" && pattern === "material" && (
                  <p className="text-[11px] text-amber-800 mt-2">
                    La grille utilise ses propres plages de vitesse et de
                    puissance.
                  </p>
                )}
                {source.kind === "raster" && (
                  <div className="border-t border-slate-200 mt-3 pt-3 space-y-2">
                    <h3 className="font-semibold text-xs flex gap-1.5">
                      <Image size={14} />
                      Traitement de l’image
                    </h3>
                    <NumberField
                      label="Pas de balayage (mm/pixel)"
                      value={raster.interval}
                      min={0.025}
                      onChange={(v) =>
                        setRaster((r) => ({ ...r, interval: v }))
                      }
                    />
                    <NumberField
                      label="Marge d’accélération (mm)"
                      value={raster.overscan}
                      min={0}
                      max={50}
                      onChange={(v) =>
                        setRaster((r) => ({ ...r, overscan: v }))
                      }
                    />
                    <p className="text-[10px] text-slate-500">
                      Débordement laser éteint avant et après chaque ligne, pour
                      accélérer et ralentir hors de la gravure.
                    </p>
                    <select
                      aria-label="Mode de traitement de l’image"
                      className={input}
                      value={raster.grayscale ? "gray" : "threshold"}
                      onChange={(e) =>
                        setRaster((r) => ({
                          ...r,
                          grayscale: e.target.value === "gray",
                        }))
                      }
                    >
                      <option value="gray">
                        Niveaux de gris (32 puissances)
                      </option>
                      <option value="threshold">Noir et blanc par seuil</option>
                    </select>
                    {!raster.grayscale && (
                      <NumberField
                        label="Seuil (0–255)"
                        value={raster.threshold}
                        min={0}
                        max={255}
                        onChange={(v) =>
                          setRaster((r) => ({ ...r, threshold: v }))
                        }
                      />
                    )}
                    <label className="flex gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={raster.invert}
                        onChange={(e) =>
                          setRaster((r) => ({ ...r, invert: e.target.checked }))
                        }
                      />
                      Inverser noir et blanc
                    </label>
                    <p className="text-[10px] text-slate-500">
                      Noir = puissance choisie ; blanc = laser éteint. Aucun
                      détourage vectoriel automatique.
                    </p>
                  </div>
                )}
              </fieldset>
            )}
          </div>
          <div className="min-w-0 space-y-4">
            {source.kind === "vector" && <LaserDesignEditor
              objects={documentObjects}
              selectedId={source.selectedId}
              bed={{ minX: -status.wco.x, minY: -status.wco.y, maxX: (preferences.useCustomBedDimensions ? preferences.customBedWidth : machineEnvelope.x || 300) - status.wco.x, maxY: (preferences.useCustomBedDimensions ? preferences.customBedLength : machineEnvelope.y || 300) - status.wco.y, width: preferences.useCustomBedDimensions ? preferences.customBedWidth : machineEnvelope.x || 300, height: preferences.useCustomBedDimensions ? preferences.customBedLength : machineEnvelope.y || 300 }}
              disabled={busy || working}
              lockedRatio={lockedRatio}
              onSelect={id => loadObject(documentObjects, id)}
              onPlacement={(id, next) => {
                if (id === source.selectedId) setPlacement(next);
                else loadObject(documentObjects.map(object => object.id === id ? { ...object, placement: next } : object), id);
              }}
              onDuplicate={() => {
                if (documentObjects.length >= 200) { setError("Maximum 200 objets par projet."); return; }
                const object = documentObjects.find(object => object.id === source.selectedId)!;
                const copy = duplicateLaserObject(object, crypto.randomUUID());
                loadObject([...documentObjects, copy], copy.id);
              }}
              onDelete={() => {
                const remaining = documentObjects.filter(object => object.id !== source.selectedId);
                if (remaining.length) loadObject(remaining, remaining[0].id);
              }}
              onToggle={id => loadObject(documentObjects.map(object => object.id === id ? { ...object, enabled: !object.enabled } : object), source.selectedId)}
            />}
            <LaserPreview
              analysis={analysis}
              status={status}
              machineEnvelope={machineEnvelope}
              preferences={preferences}
              spotDiameter={spotDiameter}
              currentLineIndex={
                job.fileName === program?.name ? job.currentLineIndex : -1
              }
              active={active}
              playback={status.isSimulator && program === playbackProgram && job.fileName === program?.name && job.startTime !== null ? job : null}
            />
            {source.kind !== "gcode" && (
              <fieldset
                disabled={busy || working}
                className={`${card} disabled:opacity-60`}
              >
                <h2 className="font-bold text-sm mb-3">
                  Dimensions et placement
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {source.kind !== "test" && (
                    <>
                      <NumberField
                        label="Largeur (mm)"
                        value={placement.width}
                        min={0.01}
                        onChange={(v) => setSize("width", v)}
                      />
                      <NumberField
                        label="Hauteur (mm)"
                        value={placement.height}
                        min={0.01}
                        onChange={(v) => setSize("height", v)}
                      />
                    </>
                  )}
                  <NumberField
                    label="Position X (mm)"
                    value={placement.x}
                    onChange={(v) => setPlacement((p) => ({ ...p, x: v }))}
                  />
                  <NumberField
                    label="Position Y (mm)"
                    value={placement.y}
                    onChange={(v) => setPlacement((p) => ({ ...p, y: v }))}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                  {source.kind !== "test" && (
                    <label className="flex gap-1.5 items-center">
                      <input
                        type="checkbox"
                        checked={lockedRatio}
                        onChange={(e) => setLockedRatio(e.target.checked)}
                      />
                      Conserver les proportions
                    </label>
                  )}
                  <label className="flex items-center gap-1">
                    Ancrage{" "}
                    <select
                      className={`${input} !w-auto !text-xs`}
                      value={placement.anchor}
                      onChange={(e) =>
                        setPlacement((p) => ({
                          ...p,
                          anchor: e.target.value as Placement["anchor"],
                        }))
                      }
                    >
                      <option value="bottom-left">Coin inférieur gauche</option>
                      <option value="center">Centre</option>
                    </select>
                  </label>
                  {source.kind !== "raster" && (
                    <>
                      <label className="flex items-center gap-1">
                        Rotation{" "}
                        <select
                          className={`${input} !w-auto !text-xs`}
                          value={placement.rotation}
                          onChange={(e) =>
                            setPlacement((p) => ({
                              ...p,
                              rotation: Number(e.target.value),
                            }))
                          }
                        >
                          {[0, 90, 180, 270].map((a) => (
                            <option key={a} value={a}>
                              {a}°
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex gap-1.5">
                        <input
                          type="checkbox"
                          checked={placement.mirrorX}
                          onChange={(e) =>
                            setPlacement((p) => ({
                              ...p,
                              mirrorX: e.target.checked,
                            }))
                          }
                        />
                        Miroir X
                      </label>
                      <label className="flex gap-1.5">
                        <input
                          type="checkbox"
                          checked={placement.mirrorY}
                          onChange={(e) =>
                            setPlacement((p) => ({
                              ...p,
                              mirrorY: e.target.checked,
                            }))
                          }
                        />
                        Miroir Y
                      </label>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 text-sm font-bold disabled:opacity-40"
                    onClick={() => void generate()}
                  >
                    <Play size={15} />
                    {working ? "Génération…" : "Générer le G-code"}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    Préparation locale · aucun mouvement machine
                  </span>
                </div>
              </fieldset>
            )}
            {program && (
              <section className={card}>
                <div className="flex flex-wrap justify-between gap-2 items-center">
                  <div>
                    <h2 className="text-sm font-bold break-all">
                      {program.name}
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {analysis?.lines.length.toLocaleString("fr-FR")} lignes ·
                      estimation{" "}
                      {duration(analysis?.stats.estimatedTimeSec || 0)} (hors
                      accélérations)
                    </p>
                  </div>
                  <button
                    className={button}
                    onClick={download}
                    disabled={stale}
                  >
                    <Download size={14} />
                    Exporter .nc
                  </button>
                </div>
                {stale && (
                  <p
                    role="status"
                    className="text-xs text-amber-800 bg-amber-50 p-2 mt-3 rounded"
                  >
                    Réglages modifiés : régénérez le G-code pour mettre à jour
                    l’aperçu et le programme.
                  </p>
                )}
                {analysis?.warnings.map((w) => (
                  <p key={w} className="text-xs text-amber-800 mt-2">
                    {w}
                  </p>
                ))}
                {program.notes?.map((note) => (
                  <p key={note} className="text-xs text-amber-800 mt-2">
                    {note}
                  </p>
                ))}
                {!analysis?.engraving.length && (
                  <p className="text-xs text-amber-800 mt-2">
                    Aucun déplacement avec laser actif et puissance positive
                    détecté.
                  </p>
                )}
                <button
                  className="text-xs underline text-slate-600 mt-3"
                  onClick={() => setShowCode((v) => !v)}
                >
                  {showCode ? "Masquer" : "Afficher"} le G-code
                </button>
                {showCode && (
                  <pre className="max-h-60 overflow-auto text-[11px] bg-slate-950 text-slate-300 p-3 rounded-lg mt-2 whitespace-pre-wrap">
                    {program.code.split("\n").slice(0, 2000).join("\n")}
                    {(analysis?.lines.length || 0) > 2000
                      ? "\n; Aperçu limité à 2 000 lignes. Exportez pour consulter le fichier complet."
                      : ""}
                  </pre>
                )}
              </section>
            )}
          </div>
          <div className="space-y-4 min-w-0">
            <LaserCalibrationPanel cut={cut} x={placement.x} y={placement.y} disabled={busy || working}
              onLoadProgram={(name, code, notes) => { setSource({ kind: "gcode", name }); setProgram({ name, code, signature: null, notes }); setConfirmed(false); setError(""); }}
              onApplyInterval={mm => { setFill(current => ({ ...current, spacing: mm })); setRaster(current => ({ ...current, interval: mm })); }} />
            <section className={card}>
              <h2 className="text-sm font-bold mb-3">Machine et origine</h2>
              <div className="grid grid-cols-3 gap-1 text-center font-mono text-xs">
                {(["x", "y", "z"] as const).map((axis) => (
                  <div key={axis} className="rounded bg-slate-100 py-2">
                    <span className="text-slate-500">{axis.toUpperCase()}</span>
                    <br />
                    <b>{status.wpos[axis].toFixed(2)}</b>
                  </div>
                ))}
              </div>
              <p className="text-xs my-3">
                {status.connected ? status.state : "Déconnectée"} ·{" "}
                {status.activeWCS} · mm
              </p>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Pas XY (mm)"
                  value={step}
                  min={0.01}
                  max={100}
                  onChange={setStep}
                />
                <NumberField
                  label="Avance déplacement"
                  value={jogFeed}
                  min={1}
                  onChange={setJogFeed}
                />
              </div>
              <div className="grid grid-cols-3 gap-1 w-44 mx-auto my-3">
                <span />
                <button
                  aria-label="Déplacer Y positif"
                  className={button}
                  disabled={
                    !canMove ||
                    !(
                      step > 0 &&
                      step <= 100 &&
                      jogFeed > 0 &&
                      Number.isFinite(jogFeed)
                    )
                  }
                  onClick={() => onJog({ y: step }, jogFeed)}
                >
                  ↑
                </button>
                <span />
                <button
                  aria-label="Déplacer X négatif"
                  className={button}
                  disabled={
                    !canMove ||
                    !(
                      step > 0 &&
                      step <= 100 &&
                      jogFeed > 0 &&
                      Number.isFinite(jogFeed)
                    )
                  }
                  onClick={() => onJog({ x: -step }, jogFeed)}
                >
                  ←
                </button>
                <button
                  className={button}
                  disabled={!canMove}
                  onClick={() => onZero("XY")}
                >
                  XY 0
                </button>
                <button
                  aria-label="Déplacer X positif"
                  className={button}
                  disabled={
                    !canMove ||
                    !(
                      step > 0 &&
                      step <= 100 &&
                      jogFeed > 0 &&
                      Number.isFinite(jogFeed)
                    )
                  }
                  onClick={() => onJog({ x: step }, jogFeed)}
                >
                  →
                </button>
                <span />
                <button
                  aria-label="Déplacer Y négatif"
                  className={button}
                  disabled={
                    !canMove ||
                    !(
                      step > 0 &&
                      step <= 100 &&
                      jogFeed > 0 &&
                      Number.isFinite(jogFeed)
                    )
                  }
                  onClick={() => onJog({ y: -step }, jogFeed)}
                >
                  ↓
                </button>
                <span />
              </div>
              <button
                className="w-full rounded-lg border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-xs font-bold disabled:opacity-40"
                disabled={!idle}
                onClick={onLaserOff}
              >
                Éteindre le laser (M5)
              </button>
            </section>
            <section className={card}>
              <h2 className="text-sm font-bold flex gap-2 items-center mb-3">
                <Scan size={17} />
                3. Vérifier les limites
              </h2>
              <NumberField
                label="Marge autour de la gravure (mm)"
                value={margin}
                min={0}
                onChange={setMargin}
              />
              <button
                className={`${button} w-full mt-3`}
                onClick={frame}
                disabled={
                  !canMove ||
                  !focusInputsValid ||
                  !analysis?.canFrame ||
                  stale ||
                  coordinateMismatch ||
                  !(
                    margin >= 0 &&
                    Number.isFinite(margin) &&
                    jogFeed > 0 &&
                    Number.isFinite(jogFeed)
                  )
                }
              >
                <Scan size={15} />
                Cadrer sans laser
              </button>
              <p className="text-[10px] text-slate-500 mt-2">
                Tour du rectangle à la hauteur Z actuelle. Aucun allumage laser,
                aucun mouvement Z. Utilise l’avance de déplacement.
              </p>
              {rasterOverscan > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Le cadrage inclut au moins {rasterOverscan} mm de marge
                  d’accélération de l’image.
                </p>
              )}
              {coordinateMismatch && (
                <p className="text-xs text-amber-800 mt-2">
                  Le programme sélectionne un repère différent de{" "}
                  {status.activeWCS}. Sélectionnez le bon repère avant de
                  cadrer.
                </p>
              )}
            </section>
            <section className={`${card} border-amber-200`}>
              <h2 className="text-sm font-bold flex gap-2 items-center mb-3">
                <Flame size={17} className="text-amber-600" />
                4. Lancer la gravure
              </h2>
              <button
                className={`${button} w-full !bg-sky-600 !text-white !border-sky-600 mb-2`}
                disabled={!program || stale || busy || working || (status.connected && !status.isSimulator)}
                onClick={async () => {
                  if (!program) return;
                  setError("");
                  setWorking(true);
                  setPlaybackProgram(program);
                  try {
                    await onSimulate(program.name, program.code, program.signature?.cut.maxPower ?? Math.max(1000, analysis?.stats.maxSpindleSpeed ?? 0));
                  } catch (err) { setPlaybackProgram(null); setError((err as Error).message); }
                  finally { setWorking(false); }
                }}
              >
                <Play size={16} /> Simuler le G-code
              </button>
              <p className="text-xs text-slate-500 mb-3">
                {status.connected && !status.isSimulator
                  ? "Déconnectez la machine réelle pour utiliser le simulateur Arduino."
                  : "Connexion automatique au simulateur Arduino. La tête dessine la gravure pendant la lecture ; utilisez Pause, Reprendre et Arrêter ci-dessous."}
              </p>
              {laserMode !== 1 && (
                <p className="text-xs text-amber-800 mb-3">
                  Activez le mode laser $32=1 dans les paramètres GRBL, puis
                  relisez les paramètres.
                </p>
              )}
              {(scaleMismatch || powerExceeded) && (
                <p className="text-xs text-red-700 mb-3">
                  Échelle de puissance incompatible avec $30={machineMaxPower}.
                  Corrigez S maximal et régénérez, ou vérifiez le G-code
                  importé.
                </p>
              )}
              <label className="flex gap-2 items-start text-xs leading-relaxed">
                <input
                  className="mt-0.5"
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || !program || stale}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  Programme, limites, origine et mise au point vérifiés.
                  Protection des yeux et extraction en place ; machine
                  surveillée.
                </span>
              </label>
              <button
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm p-3 mt-3 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!startAllowed}
                onClick={() => {
                  if (
                    program &&
                    window.confirm(
                      `Démarrer la gravure « ${program.name} » ?${program.signature?.cut.focus?.enabled ? (program.signature.cut.focus.controlZ ? `\nHors focus avec Z automatique : cible ${numberLabel(program.signature.cut.focus.referenceZ + program.signature.cut.focus.offset)} mm${program.signature.cut.focus.restoreZ ? ", puis retour au Z de focus" : ""}.` : `\nHors focus manuel : vérifiez le décalage ${numberLabel(program.signature.cut.focus.offset)} mm et le spot mesuré.`) : ""}`,
                    )
                  ) {
                    setConfirmed(false);
                    setPlaybackProgram(program);
                    onStart(program.name, program.code);
                  }
                }}
              >
                <Play size={16} />
                Démarrer la gravure
              </button>
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                <button
                  className={button}
                  disabled={job.state !== "running"}
                  onClick={onPause}
                >
                  Pause
                </button>
                <button
                  className={button}
                  disabled={job.state !== "paused"}
                  onClick={onResume}
                >
                  Reprendre
                </button>
                <button
                  className={`${button} !text-red-700`}
                  disabled={!busy}
                  onClick={onStop}
                >
                  Arrêter
                </button>
              </div>
              <div className="h-1.5 rounded bg-slate-100 overflow-hidden mt-4">
                <div
                  className="h-full bg-amber-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, job.progressPercent))}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {job.progressPercent.toFixed(1)} % · {job.acknowledgedLines}/
                {job.totalLines} lignes
              </p>
              {busy && (
                <p className="text-[10px] mt-1 text-slate-500 break-all">
                  {job.fileName}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
};
