import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  BookOpen,
  FilePlus2,
  FileUp,
  Flame,
  FolderOpen,
  Image,
  Play,
  RotateCcw,
  Save,
  Scan,
  Settings2,
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
  expandLaserBounds,
  laserSpotDiameter,
  defaultLaserFocusSettings,
  MAX_LASER_SCAN_OFFSET,
  type LaserFocusSettings,
  type LaserCutSettings,
  type LaserPath,
  type LaserScanOffset,
  type Point2,
  type Placement,
} from "../utils/laserCam";
import type { LaserFillSettings } from "../utils/laserFill";
import type { AppPreferences } from "../utils/appPreferences";
import { LaserPreview } from "./LaserPreview";
import { LaserDesignEditor } from "./LaserDesignEditor";
import { LaserCalibrationPanel } from "./LaserCalibrationPanel";
import { duplicateLaserObject, generateLaserDocument, moveLaserObject, type LaserDocumentObject } from "../utils/laserDocument";
import { parseLaserProject, serializeLaserProject } from "../utils/laserProject";
import { defaultLaserJobPlacement, frameLaserJob, placeLaserJob, type LaserJobPlacement } from "../utils/laserJobPlacement";
import { LaserLayerTree } from "./laser-workshop/LaserLayerTree";
import { LaserLayerDialog } from "./laser-workshop/LaserLayerDialog";
import { LaserPresetLibrary } from "./laser-workshop/LaserPresetLibrary";
import { applyLaserLayerSettings, assignLaserLayerColor, laserLayerKey, readLaserLayerSettings, shareLaserLayerSettings } from "../utils/laserLayerSettings";
import { laserPresetStorageKey, parseLaserPresets, type LaserPreset } from "../utils/laserPresets";
import { LaserJobOrigin, LaserMachineSettings } from "./laser-workshop/LaserMachineSettings";
import { LaserFocusSettings as LaserFocusPanel } from "./laser-workshop/LaserFocusSettings";
import { LaserMotionPanel } from "./laser-workshop/LaserMotionPanel";
import { button, card, input, NumberField } from "./laser-workshop/LaserControls";
import { laserShapeNames, type LaserShape } from "../utils/laserShapes";

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
  onJog: (axes: { x?: number; y?: number; z?: number }, feed: number) => void;
  onZero: (axis: "XY") => void;
  onLaserOff: () => void;
}
type Source =
  | { kind: "vector"; name: string; paths: LaserPath[]; warnings: string[]; objects: LaserDocumentObject[]; selectedId: string }
  | { kind: "gcode"; name: string };
const emptyDrawing: Source = { kind: "vector", name: "Dessin sans titre", paths: [], warnings: [], objects: [], selectedId: "" };
const layerColors = [
  { hex: "#000000", name: "Noir" }, { hex: "#334155", name: "Ardoise" }, { hex: "#0369a1", name: "Bleu" }, { hex: "#b91c1c", name: "Rouge" },
  { hex: "#047857", name: "Vert" }, { hex: "#7e22ce", name: "Violet" }, { hex: "#c2410c", name: "Orange" },
  { hex: "#a16207", name: "Ocre" }, { hex: "#be185d", name: "Rose" }, { hex: "#0e7490", name: "Cyan" },
];
const layerColorName = (color: string) => layerColors.find(entry => entry.hex === color.toLowerCase())?.name ?? color;
const tabClass = (selected: boolean) =>
  "rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-40 " + (selected ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100");
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
  focus: defaultLaserFocusSettings,
};
const numberLabel = (v: number) => Number(v.toFixed(2)).toLocaleString("fr-FR");
const duration = (s: number) =>
  s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
const machineProfileKey = "smartcnc.laser.machine-profile";

function readMachineProfile(): { offset: Point2; scanOffsets: LaserScanOffset[] } {
  try {
    const saved = JSON.parse(localStorage.getItem(machineProfileKey) ?? "null");
    if (Number.isFinite(saved?.offset?.x) && Number.isFinite(saved?.offset?.y) &&
        Array.isArray(saved?.scanOffsets) && saved.scanOffsets.every((row: LaserScanOffset) =>
          Number.isFinite(row?.feed) && row.feed > 0 && Number.isFinite(row?.offset) && Math.abs(row.offset) <= MAX_LASER_SCAN_OFFSET) &&
        new Set(saved.scanOffsets.map((row: LaserScanOffset) => row.feed)).size === saved.scanOffsets.length) return saved;
  } catch { /* The browser may disable local storage. */ }
  return { offset: { x: 0, y: 0 }, scanOffsets: [] };
}

const workFrame = (status: GrblStatus) => JSON.stringify([status.portPath, status.activeWCS, status.wco.x, status.wco.y]);
const sameXY = (a: Point2, b: Point2) => Math.abs(a.x - b.x) < 0.005 && Math.abs(a.y - b.y) < 0.005;

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
  const [source, setSource] = useState<Source>(emptyDrawing);
  const [machineProfile] = useState(readMachineProfile);
  const [jobPlacement, setJobPlacement] = useState<LaserJobPlacement>(() => ({ ...defaultLaserJobPlacement, offset: machineProfile.offset }));
  const [scanOffsets, setScanOffsets] = useState(machineProfile.scanOffsets);
  const [originFrame, setOriginFrame] = useState("");
  const [inspector, setInspector] = useState<"operation" | "motion" | "machine" | "library">("operation");
  const [selectedOperation, setSelectedOperation] = useState<"fill" | "contours">("fill");
  const [workspaceView, setWorkspaceView] = useState<"design" | "preview">("design");
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [layerDialogOpen, setLayerDialogOpen] = useState(false);
  const [presetLibraryOpen, setPresetLibraryOpen] = useState(false);
  const [presets, setPresets] = useState<LaserPreset[]>(() => {
    try { return parseLaserPresets(localStorage.getItem(laserPresetStorageKey) ?? '[]'); }
    catch { return []; }
  });
  const savePresets = (next: LaserPreset[]) => {
    const serialized = JSON.stringify(next);
    parseLaserPresets(serialized);
    localStorage.setItem(laserPresetStorageKey, serialized);
    setPresets(next);
  };
  const frameKey = workFrame(status);
  const effectivePlacement = useMemo(() => originFrame === frameKey || !jobPlacement.userOrigin
    ? jobPlacement : { ...jobPlacement, userOrigin: null }, [jobPlacement, originFrame, frameKey]);
  const updateJobPlacement = (next: LaserJobPlacement) => {
    if (next.userOrigin && next.userOrigin !== effectivePlacement.userOrigin) setOriginFrame(frameKey);
    setJobPlacement(next);
  };
  const latestStatus = useRef(status);
  latestStatus.current = status;

  useEffect(() => {
    const { offset } = jobPlacement;
    if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y) ||
        scanOffsets.some(row => !Number.isFinite(row.feed) || row.feed <= 0 || !Number.isFinite(row.offset) || Math.abs(row.offset) > MAX_LASER_SCAN_OFFSET) ||
        new Set(scanOffsets.map(row => row.feed)).size !== scanOffsets.length) return;
    try { localStorage.setItem(machineProfileKey, JSON.stringify({ offset, scanOffsets })); }
    catch { /* The browser may disable local storage. */ }
  }, [jobPlacement.offset, scanOffsets]);
  const [placement, setPlacement] = useState<Placement>(initialPlacement),
    [cut, setCut] = useState<LaserCutSettings>(initialCut);
  const [fill, setFill] = useState<LaserFillSettings>({
    mode: "fill-and-contours",
    spacing: 0.1,
    angle: 0,
    crossHatch: false,
    respectSvgFill: true,
  });
  const focus = cut.focus ?? initialCut.focus!;
  const changeFocus = (patch: Partial<LaserFocusSettings>) =>
    setCut((c) => ({ ...c, focus: { ...(c.focus ?? initialCut.focus!), ...patch } }));
  const [lockedRatio, setLockedRatio] = useState(true);
  const [layerDisplay, setLayerDisplay] = useState<Record<string, Pick<LaserDocumentObject, "hidden">>>({});

  const documentObjects = useMemo(() => {
    if (source.kind !== "vector") return [];
    const objects = source.objects.map(object => ({
      ...object, ...(object.id === source.selectedId ? { placement, cut, fill } : {}), ...layerDisplay[object.id],
    }));
    const selected = objects.find(object => object.id === source.selectedId);
    return selected ? shareLaserLayerSettings(objects, selected) : objects;
  }, [source, placement, cut, fill, layerDisplay]);
  const [savedVector, setSavedVector] = useState<Extract<Source, { kind: "vector" }> | null>(null);
  useEffect(() => { if (source.kind === "vector") setSavedVector({ ...source, objects: documentObjects }); }, [source, documentObjects]);
  const signature = useMemo(
    () => ({
      source,
      placement,
      cut,
      fill,
      effectivePlacement,
      scanOffsets,
    }),
    [source, placement, cut, fill, effectivePlacement, scanOffsets],
  );
  const [program, setProgram] = useState<{
    name: string;
    code: string;
    signature: typeof signature | null;
    notes?: string[];
    maxPower?: number;
    rasterOverscan?: number;
    spotDiameter?: number;
    focusSummary?: string;
    startReference?: { point: Point2; frame: string };
  } | null>(null);
  const [playbackProgram, setPlaybackProgram] = useState<typeof program>(null);
  const [confirmed, setConfirmed] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const [step, setStep] = useState(1),
    [zStep, setZStep] = useState(0.2),
    [jogFeed, setJogFeed] = useState(1000),
    [margin, setMargin] = useState(0),
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
      idle && !working && !status.accessories.spindleCw && !status.accessories.spindleCcw;
  const referenceStale = !!program?.startReference && (!status.connected || program.startReference.frame !== frameKey || !sameXY(program.startReference.point, status.wpos));
  const stale = (!!program?.signature && program.signature !== signature) || referenceStale;
  const chosenSpot = program?.spotDiameter ?? laserSpotDiameter(program?.signature?.cut || cut);
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
  const programMaxPower = program?.maxPower ?? program?.signature?.cut.maxPower;
  const scaleMismatch = programMaxPower !== undefined && machineMaxPower !== undefined && programMaxPower !== machineMaxPower;
  const powerExceeded =
    !!analysis &&
    machineMaxPower !== undefined &&
    analysis.stats.maxSpindleSpeed > machineMaxPower;
  const focusInputsValid =
    program?.maxPower !== undefined || !focus.enabled ||
    (Number.isFinite(focus.spotDiameter) &&
      focus.spotDiameter >= 0.02 &&
      focus.spotDiameter <= 20 &&
      Number.isFinite(focus.offset) &&
      Math.abs(focus.offset) <= 50);
  const startAllowed =
    idle &&
    !working &&
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
  const rasterOverscan = program?.rasterOverscan ?? 0;
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
    referenceStale,
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
    if (source.kind !== "vector" || source.selectedId !== object.id) setSelectedOperation("fill");
    setSource({ kind: "vector", name: object.name, paths: object.paths, warnings: object.warnings, objects, selectedId: object.id });
    setPlacement(object.placement);
    setFill(object.fill);
    setCut(current => ({ ...object.cut, maxPower: current.maxPower, mode: current.mode }));
  };
  const editLayer = (id: string, edit: (object: LaserDocumentObject) => LaserDocumentObject) => {
    if (source.kind !== "vector") return;
    loadObject(documentObjects.map(object => object.id === id ? edit(object) : object), source.selectedId);
  };
  const editLayerDisplay = (id: string, display: Pick<LaserDocumentObject, "hidden">) =>
    setLayerDisplay(previous => ({ ...previous, [id]: { ...previous[id], ...display } }));
  const selectedLayer = source.kind === "vector" ? documentObjects.find(object => object.id === source.selectedId) : undefined;
  const selectedGroupSize = selectedLayer ? documentObjects.filter(object => laserLayerKey(object) === laserLayerKey(selectedLayer)).length : 0;
  const removeObject = (id: string) => {
    if (busy || working) return;
    const remaining = documentObjects.filter(object => object.id !== id);
    if (remaining.length) loadObject(remaining, selectedLayer?.id ?? "");
    else {
      setSource(emptyDrawing);
      setLayerDisplay({});
      setProgram(null);
      setWorkspaceView("design");
    }
  };
  const raster = selectedLayer?.raster?.settings;
  const setRaster = (update: (settings: NonNullable<LaserDocumentObject["raster"]>["settings"]) => NonNullable<LaserDocumentObject["raster"]>["settings"]) => {
    if (!selectedLayer?.raster) return;
    editLayer(selectedLayer.id, object => object.raster
      ? { ...object, raster: { ...object.raster, settings: update(object.raster.settings) } } : object);
  };
  const combinedOperation = !!selectedLayer && !raster && fill.mode === "fill-and-contours";
  const editingContours = combinedOperation && selectedOperation === "contours";
  const operationCut = (editingContours ? selectedLayer?.contourCut : undefined) ?? cut;
  const changeOperation = (key: "feed" | "power" | "passes", value: number) => {
    if (!editingContours || !selectedLayer) { changeCut(key, value); return; }
    const { feed, power, passes, contourDirection } = operationCut;
    editLayer(selectedLayer.id, object => ({ ...object, contourCut: { feed, power, passes, contourDirection, [key]: value } }));
  };
  const contourDirection = (combinedOperation ? selectedLayer.contourCut?.contourDirection : undefined) ?? cut.contourDirection ?? "original";
  const changeContourDirection = (value: LaserCutSettings["contourDirection"]) => {
    if (!combinedOperation) { setCut(current => ({ ...current, contourDirection: value })); return; }
    const { feed, power, passes } = selectedLayer.contourCut ?? cut;
    editLayer(selectedLayer.id, layer => ({ ...layer, contourCut: { feed, power, passes, contourDirection: value } }));
  };
  const newDrawing = () => {
    if ((documentObjects.length || savedVector?.objects.length) && !window.confirm("Créer un dessin vide ? La composition ouverte sera remplacée.")) return;
    setSource(emptyDrawing);
    setLayerDisplay({});
    setSavedVector(null);
    setProgram(null);
    setWorkspaceView("design");
    setInspector("operation");
    setPlacement(initialPlacement);
    setError("");
  };
  const drawShape = (shape: LaserShape, path: LaserPath) => {
    if (busy || working || source.kind !== "vector") return;
    if (documentObjects.length >= 200) { setError("Maximum 200 calques par projet."); return; }
    try {
      const bounds = boundsOfPaths([path]);
      const layer: LaserDocumentObject = {
        id: crypto.randomUUID(), name: laserShapeNames[shape], paths: [path], warnings: [], enabled: true,
        color: layerColors[documentObjects.length % layerColors.length].hex,
        cut: { ...cut, focus: initialCut.focus }, fill: { ...fill, mode: "contours" },
        placement: { ...initialPlacement, width: bounds.width, height: bounds.height, x: bounds.minX, y: bounds.minY },
      };
      loadObject([...documentObjects, assignLaserLayerColor(layer, layer.color!, documentObjects)], layer.id);
      setInspector("operation");
      setError("");
    } catch (error) { setError((error as Error).message); }
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
      setLayerDisplay({});
      loadObject(project.objects, project.selectedId);
      setCanvasRevision(revision => revision + 1);
      setWorkspaceView("design");
      setInspector("operation");
      const selected = project.objects.find(object => object.id === project.selectedId)!;
      setCut({ ...selected.cut, maxPower: project.cut.maxPower, mode: project.cut.mode });
      setProgram(null); setConfirmed(false);
    } catch (error) { setError((error as Error).message); }
    finally { setWorking(false); }
  };
  const importFiles = async (files: File[]) => {
    setWorking(true);
    setError("");
    setConfirmed(false);
    try {
      if (files.some(file => file.size > 20 * 1024 * 1024))
        throw new Error("Fichier trop volumineux (20 Mo maximum).");
      const extension = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";
      const imageExtensions = ["png", "jpg", "jpeg", "webp", "bmp"];
      const [file] = files;
      if (files.length === 1 && ["nc", "gcode", "gc", "tap", "txt"].includes(extension(file))) {
        const code = await file.text();
        setSource({ kind: "gcode", name: file.name });
        setProgram({ name: file.name, code, signature: null });
        setWorkspaceView("preview");
        setInspector("machine");
        return;
      }
      if (!files.every(file => ["svg", "dxf", ...imageExtensions].includes(extension(file))))
        throw new Error("Importez des SVG, DXF, PNG, JPEG, WebP ou BMP ensemble, ou un programme G-code seul.");

      const objects = [...(source.kind === "vector" ? documentObjects : savedVector?.objects ?? [])];
      if (objects.length + files.length > 200) throw new Error("Maximum 200 calques par projet.");
      const importer = await import("../utils/laserImport");
      let previous = source.kind === "vector" && objects.length ? placement : objects.at(-1)?.placement;
      for (const file of files) {
        const ext = extension(file);
        const layer: LaserDocumentObject = {
          id: crypto.randomUUID(), name: file.name, paths: [], warnings: [], enabled: true,
          color: layerColors[objects.length % layerColors.length].hex, cut: { ...cut, focus: initialCut.focus }, fill: { ...fill },
          placement: { ...initialPlacement, x: previous ? previous.x + 5 : 0, y: previous ? previous.y + 5 : 0 },
        };
        if (imageExtensions.includes(ext)) {
          const { previewUrl, ...image } = await importer.importRaster(file);
          const scale = 50 / Math.max(image.width, image.height);
          layer.placement.width = image.width * scale;
          layer.placement.height = image.height * scale;
          layer.raster = { image, previewUrl, settings: { interval: 0.2, threshold: 128, grayscale: true, invert: false, overscan: 2 } };
        } else {
          const parse = ext === "svg" ? importer.importSvg : importer.importDxf;
          const result = parse(await file.text());
          layer.paths = result.paths;
          layer.warnings = result.warnings;
          layer.placement.width = Number(result.widthMm.toFixed(3));
          layer.placement.height = Number(result.heightMm.toFixed(3));
        }
        objects.push(assignLaserLayerColor(layer, layer.color!, objects));
        previous = layer.placement;
      }
      loadObject(objects, objects[objects.length - 1].id);
      setCanvasRevision(revision => revision + 1);
      setWorkspaceView("design");
      setProgram(null);
      setInspector("operation");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const generate = async () => {
    if (source.kind !== "vector") return;
    setError("");
    setWorking(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const generationStatus = latestStatus.current;
      const startReference = effectivePlacement.startFrom === "current-position" ? {
        point: { x: generationStatus.wpos.x, y: generationStatus.wpos.y }, frame: workFrame(generationStatus),
      } : undefined;
      if (startReference && (!generationStatus.connected || generationStatus.state !== "Idle"))
        throw new Error("La position actuelle exige une machine connectée et à l’arrêt.");
      const describeFocus = (name: string, settings?: LaserFocusSettings) => settings?.enabled
        ? settings.controlZ ? `${name} · Z cible ${numberLabel(settings.referenceZ + settings.offset)} mm`
          : `${name} · hors focus manuel ${numberLabel(settings.offset)} mm` : "";
      const focusSummary = documentObjects.filter(object => object.enabled)
        .map(object => describeFocus(object.name, object.cut.focus)).filter(Boolean).join("\n");
      const { code: generatedCode, notes, rasterOverscan, spotDiameter } = generateLaserDocument(documentObjects, { ...cut, scanOffsets });
      let code = generatedCode;
      if (effectivePlacement.startFrom !== "absolute" || effectivePlacement.offset.x !== 0 || effectivePlacement.offset.y !== 0) {
        const bounds = analyseLaserGCode(code, source.name).bounds;
        if (!bounds) throw new Error("Aucun tracé gravé à positionner.");
        code = placeLaserJob(code, bounds, effectivePlacement, startReference?.point);
      }
      setProgram({
        name: documentObjects.length > 1 ? "Composition laser.nc" : source.name.replace(/\.[^.]+$/, "") + ".nc",
        code,
        signature,
        notes,
        rasterOverscan,
        spotDiameter,
        focusSummary,
        startReference,
      });
      setWorkspaceView("preview");
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
      working ||
      !focusInputsValid ||
      stale ||
      coordinateMismatch
    )
      return;
    try {
      const code = frameLaserJob(
        analysis.bounds,
        Math.max(margin, rasterOverscan),
        jogFeed,
        program?.startReference?.point,
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
    if (!program || stale) return;
    const url = URL.createObjectURL(
        new Blob([program.code], { type: "text/plain;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = program.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const operationSettings = <>
            {source.kind !== "gcode" && (source.kind !== "vector" || !!selectedLayer) && (
              <fieldset
                disabled={busy || working}
                className={`${card} disabled:opacity-60`}
              >
                <h2 className="text-sm font-bold flex gap-2 items-center mb-3">
                  <Settings2 size={17} />
                  Réglages de gravure
                </h2>
                {combinedOperation && <div className="mb-3 flex gap-1" role="group" aria-label="Opération du calque">
                  <button type="button" className={tabClass(!editingContours)} aria-pressed={!editingContours} onClick={() => setSelectedOperation("fill")}>Remplissage</button>
                  <button type="button" className={tabClass(editingContours)} aria-pressed={editingContours} onClick={() => setSelectedOperation("contours")}>Contour</button>
                </div>}
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="Avance (mm/min)"
                    value={operationCut.feed}
                    min={1}
                    onChange={(v) => changeOperation("feed", v)}
                  />
                  <NumberField
                    label="Puissance (%)"
                    value={operationCut.power}
                    min={0.1}
                    max={100}
                    onChange={(v) => changeOperation("power", v)}
                  />
                  <NumberField
                    label="Passes"
                    value={operationCut.passes}
                    min={1}
                    max={50}
                    step={1}
                    onChange={(v) => changeOperation("passes", v)}
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
                  <span>Commande de puissance (machine)</span>
                  <select
                    className={input}
                    value={cut.mode}
                    onChange={(e) => changeCut("mode", e.target.value)}
                  >
                    <option value="M4">M4 — puissance dynamique</option>
                    <option value="M3">M3 — puissance constante</option>
                  </select>
                </label>
                {selectedLayer && !raster && fill.mode !== "fill" && (!combinedOperation || editingContours) && (
                  <label className="mt-3 block space-y-1 text-xs text-slate-600">
                    <span>Sens du contour</span>
                    <select className={input} value={contourDirection} onChange={event => changeContourDirection(event.target.value as LaserCutSettings["contourDirection"])}>
                      <option value="original">Sens du tracé</option>
                      <option value="reverse">Sens inverse</option>
                      <option value="alternate">Alterner à chaque passe</option>
                    </select>
                  </label>
                )}
                {raster && (
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
                      value={raster.overscan ?? 0}
                      min={0}
                      max={50}
                      onChange={(v) =>
                        setRaster((r) => ({ ...r, overscan: v }))
                      }
                    />
                    <label className="flex gap-2 text-xs">
                      <input type="checkbox" checked={raster.bidirectional !== false} onChange={event => setRaster(current => ({ ...current, bidirectional: event.target.checked }))} />
                      Balayage bidirectionnel
                    </label>
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
            {selectedLayer && !raster && (
              <fieldset
                disabled={busy || working}
                className={`${card} disabled:opacity-60`}
              >
                <h2 className="text-sm font-bold mb-3">Contour et remplissage</h2>
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
                        label="Angle de balayage (°)"
                        value={fill.angle}
                        onChange={(v) => setFill((f) => ({ ...f, angle: v }))}
                      />
                      <NumberField label="Surbalayage par extrémité (mm)" value={fill.overscan ?? 0} min={0} max={50}
                        onChange={overscan => setFill(current => ({ ...current, overscan }))} />
                    </div>
                    <label className="mt-3 flex gap-2 text-xs">
                      <input type="checkbox" checked={fill.bidirectional !== false}
                        onChange={event => setFill(current => ({ ...current, bidirectional: event.target.checked }))} />
                      Balayage bidirectionnel
                    </label>
                    <p className="mt-2 text-[11px] text-slate-600">0° pour des lignes horizontales, 90° pour des lignes verticales. Le surbalayage prolonge le trajet, laser éteint.</p>
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
  </>;
  const focusSettings = <LaserFocusPanel focus={focus} disabled={busy || working} external={source.kind === "gcode"}
    workCoordinateSystem={status.activeWCS} changeFocus={changeFocus} />;

  return (
    <main className="flex-1 min-h-0 overflow-auto bg-slate-100 text-slate-800">
      {layerDialogOpen && selectedLayer && <LaserLayerDialog name={selectedLayer.name} focusSettings={focusSettings} onClose={() => setLayerDialogOpen(false)}>
        {selectedGroupSize > 1 && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Ces réglages s’appliquent aux {selectedGroupSize} objets du calque {layerColorName(selectedLayer.color!)}.</p>}
        {operationSettings}
      </LaserLayerDialog>}
      {presetLibraryOpen && <LaserPresetLibrary presets={presets} disabled={busy || working}
        current={selectedLayer && { name: selectedLayer.name, settings: readLaserLayerSettings(selectedLayer) }}
        onChange={savePresets} onClose={() => setPresetLibraryOpen(false)}
        onApply={settings => {
          if (!selectedLayer || busy || working) return;
          editLayer(selectedLayer.id, layer => applyLaserLayerSettings(layer, settings));
        }} />}
      <div className="max-w-[1700px] mx-auto p-3 md:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3 items-center">
            <div className="rounded-xl bg-amber-500 p-2.5 text-white">
              <Flame size={25} />
            </div>
            <div>
              <h1 className="font-bold text-xl">Atelier laser</h1>
              <p className="text-xs text-slate-500">{source.kind === "vector" ? `${documentObjects.length} calque${documentObjects.length === 1 ? "" : "s"}` : source.name} · {status.activeWCS}</p>
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
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm" role="group" aria-label="Barre d’outils laser">
              <input
                ref={uploadRef}
                className="hidden"
                type="file"
                multiple
                accept=".svg,.dxf,.png,.jpg,.jpeg,.webp,.bmp,.nc,.gcode,.gc,.tap,.txt"
                disabled={busy || working}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) void importFiles(files);
                }}
              />
              <input ref={projectUploadRef} type="file" accept=".smartlaser.json,.json" className="hidden" disabled={busy || working} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void openProject(file); }} />
          <button type="button" className={button} disabled={busy || working} onClick={newDrawing}><FilePlus2 size={16} /> Nouveau</button>
          <button type="button" className={button} disabled={busy || working} onClick={() => projectUploadRef.current?.click()}><FolderOpen size={16} /> Ouvrir projet</button>
          <button type="button" className={button} disabled={busy || working || !documentObjects.length} onClick={saveProject}><Save size={16} /> Enregistrer</button>
          <button type="button" className={button} disabled={busy || working} title="SVG, DXF, image ou G-code" onClick={() => uploadRef.current?.click()}><FileUp size={16} /> Importer</button>
          <button type="button" className={button} onClick={() => setPresetLibraryOpen(true)}><BookOpen size={16} /> Préréglages</button>
          {source.kind !== "vector" && !!savedVector?.objects.length && <button type="button" className={button} disabled={busy || working}
            onClick={() => { loadObject(savedVector.objects, savedVector.selectedId); setProgram(null); setWorkspaceView("design"); setInspector("operation"); }}>Revenir au dessin</button>}
          <div className="ml-auto flex flex-wrap gap-1">
            {source.kind === "vector" && <button type="button" className={tabClass(workspaceView === "design")} aria-pressed={workspaceView === "design"} onClick={() => setWorkspaceView("design")}>Dessin</button>}
            <button type="button"
              className="inline-flex items-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-40"
              aria-pressed={workspaceView === "preview" && !!program}
              disabled={working || ((!program || stale) && (busy || (source.kind === "vector" && !documentObjects.some(object => object.enabled))))}
              onClick={() => { if (source.kind === "gcode" || (program && !stale)) setWorkspaceView("preview"); else void generate(); }}>
              <Play size={14} /> {working ? "Traitement…" : "Aperçu du parcours"}
            </button>
          </div>
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-2">
            {selectedLayer && (
              <fieldset
                disabled={busy || working}
                className={`${card} disabled:opacity-60`}
              >
                <h2 className="sr-only">
                  Dimensions et placement
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex gap-1.5 items-center">
                    <input
                      type="checkbox"
                      checked={lockedRatio}
                      onChange={(e) => setLockedRatio(e.target.checked)}
                    />
                    Conserver les proportions
                  </label>
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
                  {!raster && (
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
              </fieldset>
            )}
            <div hidden={workspaceView !== "design"}>
            {source.kind === "vector" && <LaserDesignEditor
              key={canvasRevision}
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
              onDraw={drawShape}
              onRemove={removeObject}
            />}
            </div>
            {source.kind === "vector" && workspaceView === "design" && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2" role="group" aria-label="Couleur du calque">
              <span className="mr-1 text-xs font-semibold text-slate-600">Couleur du calque</span>
              {layerColors.map(({ hex, name }) => <button key={hex} type="button" title={name} aria-label={name}
                className="size-6 rounded-md border border-black/10 aria-pressed:ring-2 aria-pressed:ring-slate-700 aria-pressed:ring-offset-2 disabled:opacity-40"
                style={{ backgroundColor: hex }} aria-pressed={selectedLayer?.color?.toLowerCase() === hex && !selectedLayer.isolatedColor}
                disabled={!selectedLayer || busy || working} onClick={() => {
                  if (selectedLayer) editLayer(selectedLayer.id, object => assignLaserLayerColor(object, hex, documentObjects));
                }} />)}
              {selectedGroupSize > 1 && <span className="text-xs text-slate-600">{selectedGroupSize} objets partagent les réglages de ce calque</span>}
            </div>}
              {source.kind === "vector" && source.warnings.length > 0 && (
                <ul className="text-[11px] text-amber-800 space-y-1 mt-3 list-disc pl-4">
                  {source.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            <div hidden={source.kind === "vector" && workspaceView === "design"}>
            <LaserPreview
              analysis={analysis}
              status={status}
              machineEnvelope={machineEnvelope}
              preferences={preferences}
              spotDiameter={spotDiameter}
              currentLineIndex={
                job.fileName === program?.name ? job.currentLineIndex : -1
              }
              active={active && (source.kind !== "vector" || workspaceView === "preview")}
              playback={status.isSimulator && program === playbackProgram && job.fileName === program?.name && job.startTime !== null ? job : null}
            />
            </div>
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
                {stale && !busy && (
                  <p
                    role="status"
                    className="text-xs text-amber-800 bg-amber-50 p-2 mt-3 rounded"
                  >
                    {referenceStale ? "La position ou le repère de départ a changé. Régénérez le G-code." : "Les réglages ont changé. Régénérez le G-code pour mettre à jour le parcours."}
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
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Panneaux laser">
              <button type="button" className={tabClass(inspector === "operation")} aria-pressed={inspector === "operation"} onClick={() => setInspector("operation")}>Calques</button>
              <button type="button" className={tabClass(inspector === "motion")} aria-pressed={inspector === "motion"} onClick={() => setInspector("motion")}>Déplacer</button>
              <button type="button" className={tabClass(inspector === "machine")} aria-pressed={inspector === "machine"} onClick={() => setInspector("machine")}>Machine</button>
              <button type="button" className={tabClass(inspector === "library")} aria-pressed={inspector === "library"} onClick={() => setInspector("library")}>Tests</button>
            </div>
            <div className="space-y-2 lg:max-h-[35vh] lg:overflow-y-auto lg:p-0.5">
              <div className="space-y-2" hidden={inspector !== "operation"}>
            {source.kind === "vector" && <LaserLayerTree
              objects={documentObjects}
              selectedId={source.selectedId}
              colorName={layerColorName}
              disabled={busy || working}
              onSelect={id => { loadObject(documentObjects, id); setWorkspaceView("design"); }}
              onSelectOperation={(id, operation) => { if (id !== source.selectedId) loadObject(documentObjects, id); setSelectedOperation(operation === "raster" ? "fill" : operation); setLayerDialogOpen(true); }}
              onEdit={id => { if (id !== source.selectedId) loadObject(documentObjects, id); setLayerDialogOpen(true); }}
              onToggle={id => editLayer(id, object => ({ ...object, enabled: !object.enabled }))}
              onToggleVisibility={id => editLayerDisplay(id, { hidden: !documentObjects.find(object => object.id === id)?.hidden })}
              onRename={(id, name) => editLayer(id, object => ({ ...object, name }))}
              onMove={(id, direction) => loadObject(moveLaserObject(documentObjects, id, direction), source.selectedId)}
              onDuplicate={id => {
                if (documentObjects.length >= 200) { setError("Maximum 200 calques par projet."); return; }
                const object = documentObjects.find(object => object.id === id);
                if (!object) return;
                const copy = duplicateLaserObject(object, crypto.randomUUID());
                loadObject([...documentObjects, copy], copy.id);
              }}
              onRemove={removeObject}
            />}
            {source.kind === "gcode" && focusSettings}
            </div>
            <div hidden={inspector !== "motion"}>
              <LaserMotionPanel status={status} step={step} zStep={zStep} feed={jogFeed}
                canMove={canMove} canTurnOff={idle} showZ={focus.enabled && focus.controlZ}
                onStep={setStep} onZStep={setZStep} onFeed={setJogFeed}
                onJog={onJog} onZero={() => onZero("XY")} onLaserOff={onLaserOff} />
            </div>
            <div hidden={inspector !== "machine"}>
              <LaserMachineSettings placement={effectivePlacement} onPlacement={updateJobPlacement}
                scanOffsets={scanOffsets} onScanOffsets={setScanOffsets} disabled={busy || working} />
            </div>
            <div hidden={inspector !== "library"}>
              <LaserCalibrationPanel cut={cut} x={placement.x} y={placement.y} disabled={busy || working}
                onLoadProgram={(name, code, notes, maxPower) => {
                  setSource({ kind: "gcode", name });
                  setProgram({ name, code, signature: null, notes, maxPower });
                  setConfirmed(false);
                  setError("");
                  setWorkspaceView("preview");
                }}
                onApplyScanOffset={entry => setScanOffsets(rows => [...rows.filter(row => row.feed !== entry.feed), entry])}
                onApplyInterval={mm => {
                  if (raster) setRaster(current => ({ ...current, interval: mm }));
                  else setFill(current => ({ ...current, spacing: mm }));
                }} />
            </div>
            </div>
            <section className={`${card} border-amber-200`}>
              <h2 className="text-sm font-bold flex gap-2 items-center mb-3">
                <Flame size={17} className="text-amber-600" />
                Commandes laser
              </h2>
              {source.kind !== "gcode" && <LaserJobOrigin placement={effectivePlacement} onPlacement={updateJobPlacement}
                position={status.wpos} canCapture={canMove} disabled={busy || working} />}
              <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                className={button}
                onClick={frame}
                disabled={
                  !canMove ||
                  working ||
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
                <button className={button} onClick={download} disabled={!program || stale}><Download size={15} /> Exporter</button>
              </div>
              <details className="my-2 text-xs text-slate-600">
                <summary className="cursor-pointer font-semibold">Options de cadrage</summary>
                <div className="mt-2">
              <NumberField
                label="Marge autour de la gravure (mm)"
                value={margin}
                min={0}
                onChange={setMargin}
              />
              <p className="text-[10px] text-slate-500 mt-2">
                Tour du rectangle à la hauteur Z actuelle. Aucun allumage laser,
                aucun mouvement Z. Utilise l’avance de déplacement.
              </p>
              {rasterOverscan > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Le cadrage inclut au moins {rasterOverscan} mm de marge de surbalayage.
                </p>
              )}
              {coordinateMismatch && (
                <p className="text-xs text-amber-800 mt-2">
                  Le programme sélectionne un repère différent de{" "}
                  {status.activeWCS}. Sélectionnez le bon repère avant de
                  cadrer.
                </p>
              )}
                </div>
              </details>
              <button
                className={`${button} w-full mb-2`}
                disabled={!program || stale || busy || working || (status.connected && !status.isSimulator)}
                onClick={async () => {
                  if (!program) return;
                  setError("");
                  setWorking(true);
                  setPlaybackProgram(program);
                  setWorkspaceView("preview");
                  try {
                    await onSimulate(program.name, program.code, programMaxPower ?? Math.max(1000, analysis?.stats.maxSpindleSpeed ?? 0));
                  } catch (err) { setPlaybackProgram(null); setError((err as Error).message); }
                  finally { setWorking(false); }
                }}
              >
                <Play size={16} /> Simuler le G-code
              </button>
              {program && status.connected && !status.isSimulator && laserMode !== 1 && (
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
                      `Démarrer la gravure « ${program.name} » ?${program.focusSummary ? `\n\n${program.focusSummary}` : ""}`,
                    )
                  ) {
                    setConfirmed(false);
                    setPlaybackProgram(program);
                    setWorkspaceView("preview");
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
              {job.totalLines > 0 && <div className="h-1.5 rounded bg-slate-100 overflow-hidden mt-4">
                <div
                  className="h-full bg-amber-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, job.progressPercent))}%`,
                  }}
                />
              </div>}
              {job.totalLines > 0 && <p className="text-[11px] text-slate-500 mt-2">
                {job.progressPercent.toFixed(1)} % · {job.acknowledgedLines}/
                {job.totalLines} lignes
              </p>}
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
