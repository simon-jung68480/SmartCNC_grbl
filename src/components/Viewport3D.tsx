import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Box,
  Compass,
  Crosshair,
  Eye,
  Grid,
  Layers,
  Maximize2,
  Navigation,
  Ruler,
  Clock,
  Activity,
} from 'lucide-react';
import {
  Coordinates,
  GCodeSegment,
  GrblStatus,
  HeightmapGrid,
  ParsedGCodeStats,
} from '../types/cnc';
import { sampleHeightmapZ } from '../utils/gcodeParser';

export interface Viewport3DProps {
  status: GrblStatus;
  segments: GCodeSegment[];
  stats: ParsedGCodeStats | null;
  currentLineIndex?: number;
  heightmap?: HeightmapGrid;
  machineEnvelope?: Coordinates;
  gridZOffset?: number;
  gridMajorStep?: number;
  customBedDimensions?: { x: number; y: number } | null;
  onOpenFraming?: () => void;
  /** Present only in the laser workshop: measured footprint and laser head. */
  laserBeamWidth?: number;
  laserTrace?: GCodeSegment[];
}

/**
 * Crée un Sprite Three.js contenant du texte net sur fond badge clair sobre
 */
function createTextSprite(
  text: string,
  options: {
    color?: string;
    bgColor?: string;
    borderColor?: string;
    fontSize?: number;
    scale?: number;
  } = {}
): THREE.Sprite {
  const {
    color = '#1e293b',
    bgColor = 'rgba(255, 255, 255, 0.92)',
    borderColor = 'rgba(148, 163, 184, 0.8)',
    fontSize = 26,
    scale = 10,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `600 ${fontSize}px "JetBrains Mono", "Fira Code", monospace`;
  ctx.font = font;

  const metrics = ctx.measureText(text);
  const padX = 16;
  const padY = 8;
  const width = Math.ceil(metrics.width + padX * 2);
  const height = Math.ceil(fontSize + padY * 2);

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(r, 1);
  ctx.lineTo(width - r, 1);
  ctx.quadraticCurveTo(width - 1, 1, width - 1, r);
  ctx.lineTo(width - 1, height - r);
  ctx.quadraticCurveTo(width - 1, height - 1, width - r, height - 1);
  ctx.lineTo(r, height - 1);
  ctx.quadraticCurveTo(1, height - 1, 1, height - r);
  ctx.lineTo(1, r);
  ctx.quadraticCurveTo(1, 1, r, 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  const aspect = width / height;
  sprite.scale.set(scale * aspect * 0.45, scale * 0.45, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/**
 * Convertit une valeur normalisée [0..1] en couleur thermique Bleu -> Vert -> Rouge
 */
function heightmapColorRamp(t: number): THREE.Color {
  const clamped = Math.max(0, Math.min(1, t));
  const color = new THREE.Color();
  color.setHSL((1 - clamped) * 0.62, 0.85, 0.45);
  return color;
}

/**
 * Formatte une durée en secondes en format lisible (ex: 4m 12s)
 */
function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h > 0) return `${h}h ${remM}m`;
  return `${m}m ${s}s`;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  status,
  segments,
  stats,
  currentLineIndex = 0,
  heightmap,
  machineEnvelope = { x: 300, y: 300, z: 80 },
  gridZOffset = 0,
  gridMajorStep = 50,
  customBedDimensions = null,
  onOpenFraming,
  laserBeamWidth,
  laserTrace,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const updateLaserTraceRef = useRef<((trace: GCodeSegment[] | undefined) => void) | null>(null);

  // Toggles d'affichage
  const [showRapids, setShowRapids] = useState<boolean>(true);
  const [showBoundingBox, setShowBoundingBox] = useState<boolean>(true);
  const [showHeightmap, setShowHeightmap] = useState<boolean>(true);
  const [showMachineGrid, setShowMachineGrid] = useState<boolean>(true);
  const [followTool, setFollowTool] = useState<boolean>(false);

  // Références Three.js
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Groupes de scène
  const machineGroupRef = useRef<THREE.Group | null>(null);
  const workOriginGroupRef = useRef<THREE.Group | null>(null);
  const toolpathGroupRef = useRef<THREE.Group | null>(null);
  const bboxGroupRef = useRef<THREE.Group | null>(null);
  const heightmapGroupRef = useRef<THREE.Group | null>(null);
  const toolHeadGroupRef = useRef<THREE.Group | null>(null);
  const spindleConeRef = useRef<THREE.Mesh | null>(null);

  // Géométries dynamiques pour mise à jour incrémentale O(delta) de la couleur d'avancement
  const cutColorAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const cutSegLineIndicesRef = useRef<Int32Array>(new Int32Array(0));
  const lastColoredSegPtrRef = useRef<number>(0);
  const lastColoredLineIndexRef = useRef<number>(0);

  // Références réactives pour la boucle d'animation requestAnimationFrame
  const statusRef = useRef<GrblStatus>(status);
  statusRef.current = status;
  const followToolRef = useRef<boolean>(followTool);
  followToolRef.current = followTool;
  const prevWcoRef = useRef<Coordinates>({
    x: status.wco?.x || 0,
    y: status.wco?.y || 0,
    z: status.wco?.z || 0,
  });

  // Initialisation de la scène Three.js
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d121b');
    sceneRef.current = scene;

    // Caméra Z-Up (standard CNC : X droite, Y profondeur, Z hauteur)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 4000);
    camera.up.set(0, 0, 1);
    camera.position.set(150, -210, 175);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    controls.maxDistance = 2000;
    controls.minDistance = 8;
    controls.target.set(80, 60, 0);
    controls.update();
    controlsRef.current = controls;

    // Éclairages CAO/FAO studio sombre
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.05);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight1.position.set(200, -180, 260);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x94a3b8, 0.65);
    dirLight2.position.set(-150, 220, 180);
    scene.add(dirLight2);

    // Groupes principaux
    const machineGroup = new THREE.Group();
    const workOriginGroup = new THREE.Group();
    const toolpathGroup = new THREE.Group();
    const bboxGroup = new THREE.Group();
    const heightmapGroup = new THREE.Group();
    const toolHeadGroup = new THREE.Group();

    // Position initiale du plateau machine selon le WCO actuel
    const initWco = statusRef.current?.wco || { x: 0, y: 0, z: 0 };
    machineGroup.position.set(-initWco.x, -initWco.y, -initWco.z);
    const initWpos = statusRef.current?.wpos || { x: 0, y: 0, z: 0 };
    toolHeadGroup.position.set(initWpos.x, initWpos.y, initWpos.z);

    scene.add(machineGroup);
    scene.add(workOriginGroup);
    scene.add(heightmapGroup);
    scene.add(toolpathGroup);
    scene.add(bboxGroup);
    scene.add(toolHeadGroup);

    machineGroupRef.current = machineGroup;
    workOriginGroupRef.current = workOriginGroup;
    toolpathGroupRef.current = toolpathGroup;
    bboxGroupRef.current = bboxGroup;
    heightmapGroupRef.current = heightmapGroup;
    toolHeadGroupRef.current = toolHeadGroup;

    // Trièdre d'origine pièce (WPos 0,0,0 : X Rouge, Y Vert, Z Bleu)
    const axisLen = 32;
    const xArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0.1),
      axisLen,
      0xfb7185,
      4.5,
      2.5
    );
    const yArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0.1),
      axisLen,
      0x34d399,
      4.5,
      2.5
    );
    const zArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0.1),
      axisLen,
      0x38bdf8,
      4.5,
      2.5
    );
    workOriginGroup.add(xArrow, yArrow, zArrow);

    const xTag = createTextSprite('X0', {
      color: '#fda4af',
      bgColor: 'rgba(15, 23, 42, 0.90)',
      borderColor: 'rgba(251, 113, 133, 0.65)',
      scale: 6.5,
    });
    xTag.position.set(axisLen + 5, 0, 1);
    const yTag = createTextSprite('Y0', {
      color: '#6ee7b7',
      bgColor: 'rgba(15, 23, 42, 0.90)',
      borderColor: 'rgba(52, 211, 153, 0.65)',
      scale: 6.5,
    });
    yTag.position.set(0, axisLen + 5, 1);
    const zTag = createTextSprite('Z0', {
      color: '#7dd3fc',
      bgColor: 'rgba(15, 23, 42, 0.90)',
      borderColor: 'rgba(56, 189, 248, 0.65)',
      scale: 6.5,
    });
    zTag.position.set(0, 0, axisLen + 5);
    workOriginGroup.add(xTag, yTag, zTag);

    if (laserBeamWidth !== undefined) {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 27),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.35 })
      );
      body.position.z = 22;
      toolHeadGroup.add(body);
      const nozzleGeometry = new THREE.CylinderGeometry(4, 3, 6, 20);
      nozzleGeometry.rotateX(Math.PI / 2);
      nozzleGeometry.translate(0, 0, 6);
      toolHeadGroup.add(new THREE.Mesh(
        nozzleGeometry,
        new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.55, roughness: 0.3 })
      ));
      const spot = new THREE.Mesh(
        new THREE.CircleGeometry(Math.max(laserBeamWidth / 2, 0.1), 24),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide })
      );
      spot.name = 'laser-spot';
      spot.position.z = 0.04;
      toolHeadGroup.add(spot);
    } else {
    // Broche + fraise 3D haute visibilité pour studio sombre
    const tipGeo = new THREE.ConeGeometry(2.0, 14, 16);
    tipGeo.rotateX(-Math.PI / 2);
    tipGeo.translate(0, 0, 7);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.35,
      roughness: 0.3,
    });
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);

    const fluteGeo = new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.4, 2.05, 13.5, 6));
    fluteGeo.rotateX(Math.PI / 2);
    fluteGeo.translate(0, 0, 7);
    const fluteLines = new THREE.LineSegments(
      fluteGeo,
      new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8 })
    );
    tipMesh.add(fluteLines);
    toolHeadGroup.add(tipMesh);
    spindleConeRef.current = tipMesh;

    // 2. Pince ER11 (Collet)
    const colletGeo = new THREE.CylinderGeometry(5.2, 4.0, 8, 20);
    colletGeo.rotateX(Math.PI / 2);
    colletGeo.translate(0, 0, 18);
    const colletMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.5,
      roughness: 0.35,
    });
    toolHeadGroup.add(new THREE.Mesh(colletGeo, colletMat));

    // 3. Corps de broche en acier clair
    const bodyGeo = new THREE.CylinderGeometry(12, 12, 28, 24);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.translate(0, 0, 36);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.45,
      roughness: 0.35,
    });
    toolHeadGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

    // 4. Repère circulaire discret à la pointe de l'outil
    const crosshairGeo = new THREE.RingGeometry(2.4, 3.0, 24);
    const crosshairMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const crosshairMesh = new THREE.Mesh(crosshairGeo, crosshairMat);
    crosshairMesh.position.set(0, 0, 0.05);
    toolHeadGroup.add(crosshairMesh);
    }

    // Boucle d'animation
    let animFrameId = 0;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);

      const curStatus = statusRef.current;
      const wpos = curStatus?.wpos || { x: 0, y: 0, z: 0 };
      const wco = curStatus?.wco || { x: 0, y: 0, z: 0 };

      // Détection d'un changement d'origine pièce (clic sur X=0, Y=0, Z=0)
      const prevWco = prevWcoRef.current;
      const dwx = wco.x - prevWco.x;
      const dwy = wco.y - prevWco.y;
      const dwz = wco.z - prevWco.z;
      const wcoChanged =
        Math.abs(dwx) > 1e-4 || Math.abs(dwy) > 1e-4 || Math.abs(dwz) > 1e-4;

      // Le plateau machine est toujours positionné à (-wco.x, -wco.y, -wco.z) dans le repère pièce (WPos)
      if (machineGroupRef.current) {
        machineGroupRef.current.position.set(-wco.x, -wco.y, -wco.z);
      }

      if (wcoChanged) {
        prevWcoRef.current = { x: wco.x, y: wco.y, z: wco.z };
        // Placement immédiat de la fraise et compensation de la caméra de -deltaWco :
        // ainsi la fraise et le plateau machine restent fixes à l'écran et seul le tracé G-Code + origine (0,0,0) se calent sous la fraise
        if (toolHeadGroupRef.current) {
          toolHeadGroupRef.current.position.set(wpos.x, wpos.y, wpos.z);
        }
        if (cameraRef.current && controlsRef.current) {
          cameraRef.current.position.x -= dwx;
          cameraRef.current.position.y -= dwy;
          cameraRef.current.position.z -= dwz;
          controlsRef.current.target.x -= dwx;
          controlsRef.current.target.y -= dwy;
          controlsRef.current.target.z -= dwz;
        }
      } else if (toolHeadGroupRef.current) {
        toolHeadGroupRef.current.position.set(wpos.x, wpos.y, wpos.z);
        if (followToolRef.current && controlsRef.current) {
          controlsRef.current.target.lerp(toolHeadGroupRef.current.position, 0.25);
        }
      }

      // Rotation de la fraise quand la broche tourne
      const isSpindleSpinning =
        curStatus.spindleSpeed > 0 &&
        (curStatus.accessories?.spindleCw ||
          curStatus.accessories?.spindleCcw ||
          curStatus.state === 'Run');

      if (spindleConeRef.current && isSpindleSpinning) {
        spindleConeRef.current.rotation.z -= 0.3;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Construction du plateau de la CNC Router (grille millimétrée + graduations 50mm + cadre machine continu)
  useEffect(() => {
    const group = machineGroupRef.current;
    if (!group) return;
    group.clear();

    const maxX = (customBedDimensions && customBedDimensions.x > 0 ? customBedDimensions.x : machineEnvelope.x) || 300;
    const maxY = (customBedDimensions && customBedDimensions.y > 0 ? customBedDimensions.y : machineEnvelope.y) || 300;
    const maxZ = machineEnvelope.z || 80;
    const zOffset = gridZOffset || 0;
    const majorStep = gridMajorStep || 50;

    // Plateau machine en studio sombre (#151d2b)
    const bedGeo = new THREE.PlaneGeometry(maxX, maxY);
    bedGeo.translate(maxX / 2, maxY / 2, zOffset - 0.15);
    const bedMat = new THREE.MeshBasicMaterial({
      color: 0x151d2b,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(bedGeo, bedMat));

    // Grille millimétrée (pas de 10mm fine + pas de majorStep principale)
    const minorPositions: number[] = [];
    const majorPositions: number[] = [];

    for (let x = 0; x <= maxX; x += 10) {
      const target = x % majorStep === 0 ? majorPositions : minorPositions;
      target.push(x, 0, zOffset, x, maxY, zOffset);
    }
    for (let y = 0; y <= maxY; y += 10) {
      const target = y % majorStep === 0 ? majorPositions : minorPositions;
      target.push(0, y, zOffset, maxX, y, zOffset);
    }

    const minorGeo = new THREE.BufferGeometry();
    minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPositions, 3));
    group.add(
      new THREE.LineSegments(
        minorGeo,
        new THREE.LineBasicMaterial({ color: 0x223047, transparent: true, opacity: 0.85 })
      )
    );

    const majorGeo = new THREE.BufferGeometry();
    majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPositions, 3));
    group.add(
      new THREE.LineSegments(
        majorGeo,
        new THREE.LineBasicMaterial({ color: 0x3b4f70, transparent: true, opacity: 0.95 })
      )
    );

    // Graduations tous les majorStep sur X et Y
    for (let x = 0; x <= maxX; x += majorStep) {
      const lbl = createTextSprite(`${x}`, {
        color: '#f1f5f9',
        bgColor: 'rgba(15, 23, 42, 0.90)',
        borderColor: 'rgba(100, 116, 139, 0.65)',
        fontSize: 22,
        scale: 6.5,
      });
      lbl.position.set(x, -7, zOffset + 0.2);
      group.add(lbl);
    }
    for (let y = majorStep; y <= maxY; y += majorStep) {
      const lbl = createTextSprite(`${y}`, {
        color: '#f1f5f9',
        bgColor: 'rgba(15, 23, 42, 0.90)',
        borderColor: 'rgba(100, 116, 139, 0.65)',
        fontSize: 22,
        scale: 6.5,
      });
      lbl.position.set(-9, y, zOffset + 0.2);
      group.add(lbl);
    }

    // Volume enveloppe machine en lignes continues fines
    const envBoxGeo = new THREE.BoxGeometry(maxX, maxY, maxZ);
    envBoxGeo.translate(maxX / 2, maxY / 2, zOffset + maxZ / 2);
    const envEdges = new THREE.EdgesGeometry(envBoxGeo);
    const envLines = new THREE.LineSegments(
      envEdges,
      new THREE.LineBasicMaterial({
        color: 0x475569,
        transparent: true,
        opacity: 0.6,
      })
    );
    group.add(envLines);
  }, [machineEnvelope.x, machineEnvelope.y, machineEnvelope.z, gridZOffset, gridMajorStep, customBedDimensions]);

  // Visibilité de la grille machine
  useEffect(() => {
    if (machineGroupRef.current) {
      machineGroupRef.current.visible = showMachineGrid;
    }
  }, [showMachineGrid]);

  // Construction du parcours d'outil 3D haute performance (Float32Array pré-alloués)
  useEffect(() => {
    const group = toolpathGroupRef.current;
    if (!group) return;
    group.clear();
    cutColorAttrRef.current = null;
    cutSegLineIndicesRef.current = new Int32Array(0);
    lastColoredSegPtrRef.current = 0;
    lastColoredLineIndexRef.current = 0;

    if (!segments || segments.length === 0) return;

    const totalSegs = segments.length;
    // Échantillonnage léger sur les très gros fichiers (> 180 000 segments) pour maintenir 60 FPS
    const sampleStep = totalSegs > 180000 ? Math.ceil(totalSegs / 180000) : 1;

    // 1er passage rapide pour compter les segments G0 et G1/G2/G3 retenus
    let rapidCount = 0;
    let cutCount = 0;

    for (let i = 0; i < totalSegs; i++) {
      const seg = segments[i];
      if (seg.type === 'G0') {
        // Ignorer le tout premier segment G0 artificiel partant de (0,0,0) pour le dégagement initial
        if (
          i === 0 &&
          seg.start.x === 0 &&
          seg.start.y === 0 &&
          seg.start.z === 0
        ) {
          continue;
        }
        rapidCount++;
      } else {
        if (sampleStep > 1 && i % sampleStep !== 0 && i !== totalSegs - 1) {
          const dx = seg.end.x - seg.start.x;
          const dy = seg.end.y - seg.start.y;
          const dz = seg.end.z - seg.start.z;
          if (dx * dx + dy * dy + dz * dz < 0.25) {
            continue;
          }
        }
        cutCount++;
      }
    }

    const rapidPositions = new Float32Array(rapidCount * 6);
    const cutPositions = new Float32Array(cutCount * 6);
    const cutColors = new Float32Array(cutCount * 6);
    const cutLineIndices = new Int32Array(cutCount);

    const pendingColor = new THREE.Color('#38bdf8');
    let rPtr = 0;
    let cPtr = 0;
    let cIdxPtr = 0;
    let lastEnd: Coordinates | null = null;

    for (let i = 0; i < totalSegs; i++) {
      const seg = segments[i];
      if (seg.type === 'G0') {
        if (
          i === 0 &&
          seg.start.x === 0 &&
          seg.start.y === 0 &&
          seg.start.z === 0
        ) {
          lastEnd = seg.end;
          continue;
        }
        rapidPositions[rPtr++] = seg.start.x;
        rapidPositions[rPtr++] = seg.start.y;
        rapidPositions[rPtr++] = seg.start.z;
        rapidPositions[rPtr++] = seg.end.x;
        rapidPositions[rPtr++] = seg.end.y;
        rapidPositions[rPtr++] = seg.end.z;
        lastEnd = seg.end;
      } else {
        if (sampleStep > 1 && i % sampleStep !== 0 && i !== totalSegs - 1) {
          const dx = seg.end.x - seg.start.x;
          const dy = seg.end.y - seg.start.y;
          const dz = seg.end.z - seg.start.z;
          if (dx * dx + dy * dy + dz * dz < 0.25) {
            continue;
          }
        }
        const sx = sampleStep > 1 && lastEnd ? lastEnd.x : seg.start.x;
        const sy = sampleStep > 1 && lastEnd ? lastEnd.y : seg.start.y;
        const sz = sampleStep > 1 && lastEnd ? lastEnd.z : seg.start.z;

        const base = cPtr;
        cutPositions[base] = sx;
        cutPositions[base + 1] = sy;
        cutPositions[base + 2] = sz;
        cutPositions[base + 3] = seg.end.x;
        cutPositions[base + 4] = seg.end.y;
        cutPositions[base + 5] = seg.end.z;

        cutColors[base] = pendingColor.r;
        cutColors[base + 1] = pendingColor.g;
        cutColors[base + 2] = pendingColor.b;
        cutColors[base + 3] = pendingColor.r;
        cutColors[base + 4] = pendingColor.g;
        cutColors[base + 5] = pendingColor.b;

        cPtr += 6;
        cutLineIndices[cIdxPtr++] = seg.lineIndex;
        lastEnd = seg.end;
      }
    }

    // 1. Segments Rapides G0 : SEULS traits en pointillés de la scène 3D (orange lumineux #fb923c)
    if (rapidCount > 0) {
      const rapidGeo = new THREE.BufferGeometry();
      rapidGeo.setAttribute('position', new THREE.BufferAttribute(rapidPositions, 3));
      const rapidMat = new THREE.LineDashedMaterial({
        color: 0xfb923c,
        dashSize: 2.0,
        gapSize: 1.5,
        transparent: true,
        opacity: 0.88,
      });
      const rapidLines = new THREE.LineSegments(rapidGeo, rapidMat);
      rapidLines.computeLineDistances();
      rapidLines.name = 'rapids';
      rapidLines.visible = showRapids;
      group.add(rapidLines);
    }

    // 2. Segments d'Usinage G1/G2/G3
    if (cutCount > 0) {
      const cutGeo = new THREE.BufferGeometry();
      cutGeo.setAttribute('position', new THREE.BufferAttribute(cutPositions, 3));
      const colorAttr = new THREE.BufferAttribute(cutColors, 3);
      cutGeo.setAttribute('color', colorAttr);

      const cutMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.98,
      });
      const cutLines = new THREE.LineSegments(cutGeo, cutMat);
      cutLines.name = 'cuts';
      group.add(cutLines);

      cutColorAttrRef.current = colorAttr;
      cutSegLineIndicesRef.current = cutLineIndices;
    }
  }, [segments]);

  // Measured laser footprint. Kept separate from the CNC line geometry.
  useEffect(() => {
    const group = toolpathGroupRef.current;
    if (!group || laserBeamWidth === undefined || laserBeamWidth <= 0) return;
    const cuts = segments.filter(segment => segment.type !== 'G0' && segment.spindleSpeed > 0);
    if (!cuts.length) return;
    const step = Math.max(1, Math.ceil(cuts.length / 20000));
    const count = Math.ceil(cuts.length / step);
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xf59e0b, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const capGeometry = new THREE.CircleGeometry(0.5, 16);
    const caps = new THREE.InstancedMesh(capGeometry, material, count * 2);
    const partial = new THREE.InstancedMesh(geometry, material, 1);
    const partialCaps = new THREE.InstancedMesh(capGeometry, material, 2);
    // Geometry is uploaded once; playback changes instance counts and only the current stroke.
    mesh.frustumCulled = caps.frustumCulled = partial.frustumCulled = partialCaps.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const axis = new THREE.Vector3(0, 0, 1);
    const writeStroke = (target: THREE.InstancedMesh, ends: THREE.InstancedMesh, index: number, segment: GCodeSegment) => {
      const dx = segment.end.x - segment.start.x, dy = segment.end.y - segment.start.y;
      position.set(
        (segment.start.x + segment.end.x) / 2,
        (segment.start.y + segment.end.y) / 2,
        (segment.start.z + segment.end.z) / 2 + 0.04
      );
      rotation.setFromAxisAngle(axis, Math.atan2(dy, dx));
      scale.set(Math.hypot(dx, dy), laserBeamWidth, 1);
      matrix.compose(position, rotation, scale);
      target.setMatrixAt(index, matrix);
      scale.set(laserBeamWidth, laserBeamWidth, 1);
      rotation.identity();
      position.set(segment.start.x, segment.start.y, segment.start.z + 0.04);
      matrix.compose(position, rotation, scale);
      ends.setMatrixAt(index * 2, matrix);
      position.set(segment.end.x, segment.end.y, segment.end.z + 0.04);
      matrix.compose(position, rotation, scale);
      ends.setMatrixAt(index * 2 + 1, matrix);
    };
    for (let i = 0; i < cuts.length; i += step) {
      writeStroke(mesh, caps, i / step, cuts[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    partial.count = partialCaps.count = 0;
    group.add(mesh, caps, partial, partialCaps);
    updateLaserTraceRef.current = trace => {
      const last = trace?.at(-1);
      const hasPartial = !!last && last !== cuts[trace!.length - 1];
      const fullCount = trace ? trace.length - (hasPartial ? 1 : 0) : cuts.length;
      mesh.count = Math.ceil(fullCount / step);
      caps.count = mesh.count * 2;
      partial.count = hasPartial ? 1 : 0;
      partialCaps.count = hasPartial ? 2 : 0;
      if (hasPartial && last) {
        writeStroke(partial, partialCaps, 0, last);
        partial.instanceMatrix.needsUpdate = partialCaps.instanceMatrix.needsUpdate = true;
      }
    };
    return () => {
      updateLaserTraceRef.current = null;
      group.remove(mesh, caps, partial, partialCaps);
      mesh.dispose(); caps.dispose(); partial.dispose(); partialCaps.dispose();
      geometry.dispose(); capGeometry.dispose(); material.dispose();
    };
  }, [segments, laserBeamWidth]);

  useEffect(() => {
    const cuts = toolpathGroupRef.current?.getObjectByName('cuts');
    if (cuts) cuts.visible = laserTrace === undefined;
    updateLaserTraceRef.current?.(laserTrace);
  }, [segments, laserTrace, laserBeamWidth]);

  useEffect(() => {
    const spot = toolHeadGroupRef.current?.getObjectByName('laser-spot') as THREE.Mesh | undefined;
    if (!spot || laserBeamWidth === undefined) return;
    spot.geometry.dispose();
    spot.geometry = new THREE.CircleGeometry(Math.max(laserBeamWidth / 2, 0.1), 24);
  }, [laserBeamWidth]);

  // Visibilité des déplacements rapides G0
  useEffect(() => {
    const group = toolpathGroupRef.current;
    if (!group) return;
    const rapidsObj = group.getObjectByName('rapids');
    if (rapidsObj) {
      rapidsObj.visible = showRapids;
    }
  }, [showRapids]);

  // Mise à jour incrémentale O(delta) des couleurs d'avancement (sans boucler sur 100k+ segments à chaque frame)
  useEffect(() => {
    const colorAttr = cutColorAttrRef.current;
    const lineIndices = cutSegLineIndicesRef.current;
    const len = lineIndices.length;
    if (!colorAttr || len === 0) return;

    const doneColor = new THREE.Color('#34d399');
    const pendingColor = new THREE.Color('#38bdf8');
    const array = colorAttr.array as Float32Array;

    // Si retour à zéro ou recul de ligne, on réinitialise la plage précédemment colorée
    if (currentLineIndex === 0 || currentLineIndex < lastColoredLineIndexRef.current) {
      const resetLimit = lastColoredSegPtrRef.current;
      for (let i = 0; i < resetLimit; i++) {
        const offset = i * 6;
        array[offset] = pendingColor.r;
        array[offset + 1] = pendingColor.g;
        array[offset + 2] = pendingColor.b;
        array[offset + 3] = pendingColor.r;
        array[offset + 4] = pendingColor.g;
        array[offset + 5] = pendingColor.b;
      }
      lastColoredSegPtrRef.current = 0;
      lastColoredLineIndexRef.current = 0;
      if (currentLineIndex === 0) {
        colorAttr.needsUpdate = true;
        return;
      }
    }

    // Avance uniquement sur la nouvelle tranche de segments franchie depuis la dernière frame
    let ptr = lastColoredSegPtrRef.current;
    let updated = false;
    while (ptr < len && lineIndices[ptr] < currentLineIndex) {
      const offset = ptr * 6;
      array[offset] = doneColor.r;
      array[offset + 1] = doneColor.g;
      array[offset + 2] = doneColor.b;
      array[offset + 3] = doneColor.r;
      array[offset + 4] = doneColor.g;
      array[offset + 5] = doneColor.b;
      ptr++;
      updated = true;
    }

    lastColoredSegPtrRef.current = ptr;
    lastColoredLineIndexRef.current = currentLineIndex;

    if (updated) {
      colorAttr.needsUpdate = true;
    }
  }, [currentLineIndex, segments]);

  // Construction de la Boîte Englobante (Bounding Box) en lignes continues fines (#0369a1)
  useEffect(() => {
    const group = bboxGroupRef.current;
    if (!group) return;
    group.clear();

    if (!stats || stats.motionLines === 0) return;

    const { min, max, size } = stats.bounds;
    const sx = Math.max(0.5, size.x);
    const sy = Math.max(0.5, size.y);
    const sz = Math.max(0.5, size.z);
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;

    const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    boxGeo.translate(cx, cy, cz);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const boxLines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.72,
      })
    );
    group.add(boxLines);

    // Étiquette de dimensions X × Y × Z mm
    const dimLabel = createTextSprite(
      `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`,
      {
        color: '#f1f5f9',
        bgColor: 'rgba(15, 23, 42, 0.90)',
        borderColor: 'rgba(100, 116, 139, 0.65)',
        fontSize: 22,
        scale: 9,
      }
    );
    dimLabel.position.set(cx, max.y + 8, max.z + 6);
    group.add(dimLabel);
  }, [stats]);

  // Visibilité de la boîte englobante
  useEffect(() => {
    if (bboxGroupRef.current) {
      bboxGroupRef.current.visible = showBoundingBox;
    }
  }, [showBoundingBox]);

  // Construction du maillage 3D de la Heightmap
  useEffect(() => {
    const group = heightmapGroupRef.current;
    if (!group) return;
    group.clear();

    if (!heightmap || !heightmap.points || heightmap.points.length === 0) return;

    const hasProbedPoints = heightmap.points.some((p) => p.probed && p.z !== null);
    if (!hasProbedPoints && !heightmap.enabled) return;

    const width = Math.max(5, heightmap.maxX - heightmap.minX);
    const height = Math.max(5, heightmap.maxY - heightmap.minY);
    const segX = Math.max(16, (heightmap.cols - 1) * 8);
    const segY = Math.max(16, (heightmap.rows - 1) * 8);

    const planeGeo = new THREE.PlaneGeometry(width, height, segX, segY);
    const posAttr = planeGeo.attributes.position as THREE.BufferAttribute;

    let zMin = Infinity;
    let zMax = -Infinity;
    for (const pt of heightmap.points) {
      if (pt.z !== null && Number.isFinite(pt.z)) {
        if (pt.z < zMin) zMin = pt.z;
        if (pt.z > zMax) zMax = pt.z;
      }
    }
    if (!Number.isFinite(zMin)) {
      zMin = -0.5;
      zMax = 0.5;
    }
    const zSpan = Math.max(0.05, zMax - zMin);

    const colors = new Float32Array(posAttr.count * 3);
    const visualScaleZ = zSpan < 1.5 ? 5.0 : 1.0;

    for (let i = 0; i < posAttr.count; i++) {
      const localX = posAttr.getX(i);
      const localY = posAttr.getY(i);
      const worldX = heightmap.minX + width / 2 + localX;
      const worldY = heightmap.minY + height / 2 + localY;
      const zVal = sampleHeightmapZ(worldX, worldY, heightmap);

      posAttr.setXYZ(i, worldX, worldY, zVal * visualScaleZ + 0.15);

      const norm = (zVal - zMin) / zSpan;
      const col = heightmapColorRamp(norm);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    planeGeo.computeVertexNormals();

    const surfaceMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(planeGeo, surfaceMat));

    const wireMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
    });
    group.add(new THREE.Mesh(planeGeo, wireMat));

    for (const pt of heightmap.points) {
      const zVal = pt.z ?? 0;
      const sphereGeo = new THREE.SphereGeometry(1.1, 10, 10);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: pt.probed ? heightmapColorRamp((zVal - zMin) / zSpan) : new THREE.Color('#64748b'),
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(pt.x, pt.y, zVal * visualScaleZ + 0.25);
      group.add(sphere);
    }
  }, [heightmap]);

  // Visibilité du maillage Heightmap
  useEffect(() => {
    if (heightmapGroupRef.current) {
      heightmapGroupRef.current.visible = showHeightmap;
    }
  }, [showHeightmap]);

  // Fonctions de vues caméra rapides
  const getSceneCenterAndRadius = useCallback(() => {
    if (stats && stats.motionLines > 0) {
      const cx = (stats.bounds.min.x + stats.bounds.max.x) / 2;
      const cy = (stats.bounds.min.y + stats.bounds.max.y) / 2;
      const cz = (stats.bounds.min.z + stats.bounds.max.z) / 2;
      const maxDim = Math.max(stats.bounds.size.x, stats.bounds.size.y, stats.bounds.size.z, 40);
      return { center: new THREE.Vector3(cx, cy, cz), dist: maxDim * 1.65 };
    }
    const wco = statusRef.current?.wco || { x: 0, y: 0, z: 0 };
    return {
      center: new THREE.Vector3(
        machineEnvelope.x / 3 - wco.x,
        machineEnvelope.y / 3 - wco.y,
        -wco.z
      ),
      dist: 220,
    };
  }, [stats, machineEnvelope.x, machineEnvelope.y]);

  const setViewPreset = useCallback(
    (preset: 'iso' | 'xy' | 'xz' | 'yz' | 'center') => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      setFollowTool(false);
      const { center, dist } = getSceneCenterAndRadius();
      controls.target.copy(center);

      switch (preset) {
        case 'iso':
        case 'center':
          camera.position.set(center.x + dist * 0.65, center.y - dist * 0.85, center.z + dist * 0.75);
          break;
        case 'xy':
          camera.position.set(center.x, center.y - 0.01, center.z + dist * 1.25);
          break;
        case 'xz':
          camera.position.set(center.x, center.y - dist * 1.25, center.z + 5);
          break;
        case 'yz':
          camera.position.set(center.x + dist * 1.25, center.y, center.z + 5);
          break;
      }
      controls.update();
    },
    [getSceneCenterAndRadius]
  );

  // Recentrage automatique initial au chargement d'un nouveau programme G-Code
  useEffect(() => {
    if (stats && stats.motionLines > 0) {
      setViewPreset('iso');
    }
  }, [stats?.fileName, stats?.totalLines]);

  return (
    <div className="relative w-full h-full min-h-0 bg-[#0d121b] rounded-xl overflow-hidden border border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.28)] select-none flex flex-col">
      {/* Canvas 3D Three.js */}
      <div ref={containerRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Barre d'outils flottante studio sombre */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-10">
        {/* Vues caméra */}
        <div className="flex flex-wrap items-center gap-0.5 bg-[#111622]/90 backdrop-blur-md border border-slate-700/80 text-slate-100 shadow-lg rounded-xl p-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => setViewPreset('iso')}
            className="min-h-8 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold hover:bg-[#1b2436] text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Vue 3D Isométrique"
          >
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            <span>Iso</span>
          </button>
          <button
            type="button"
            onClick={() => setViewPreset('xy')}
            className="min-h-8 px-2.5 py-1 text-xs font-semibold hover:bg-[#1b2436] text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Vue de Dessus (Plan XY)"
          >
            XY
          </button>
          <button
            type="button"
            onClick={() => setViewPreset('xz')}
            className="min-h-8 px-2.5 py-1 text-xs font-semibold hover:bg-[#1b2436] text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Vue de Face (Plan XZ)"
          >
            XZ
          </button>
          <button
            type="button"
            onClick={() => setViewPreset('yz')}
            className="min-h-8 px-2.5 py-1 text-xs font-semibold hover:bg-[#1b2436] text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Vue de Côté (Plan YZ)"
          >
            YZ
          </button>
          <div className="h-4 w-px bg-slate-700 mx-0.5" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setViewPreset('center')}
            className="min-h-8 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold hover:bg-[#1b2436] text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Centrer la caméra sur la pièce"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Centrer</span>
          </button>
          <button
            type="button"
            onClick={() => setFollowTool((v) => !v)}
            className={`min-h-8 flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              followTool
                ? 'bg-sky-400 text-slate-950'
                : 'hover:bg-[#1b2436] text-slate-200'
            }`}
            title={laserBeamWidth === undefined ? 'Verrouiller la caméra sur la fraise en temps réel' : 'Verrouiller la caméra sur la tête laser en temps réel'}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Suivre</span>
          </button>
        </div>

        {/* Toggles de couches & cadrage */}
        <div className="flex flex-wrap items-center gap-1 bg-[#111622]/90 backdrop-blur-md border border-slate-700/80 text-slate-100 shadow-lg rounded-xl p-1 pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowRapids((v) => !v)}
            className={`min-h-8 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              showRapids
                ? 'bg-orange-500/20 text-orange-300 border border-orange-400/40'
                : 'hover:bg-[#1b2436] text-slate-400 border border-transparent'
            }`}
            title="Afficher / Masquer les déplacements rapides G0 (pointillés)"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>G0</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBoundingBox((v) => !v)}
            className={`min-h-8 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              showBoundingBox
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                : 'hover:bg-[#1b2436] text-slate-400 border border-transparent'
            }`}
            title="Afficher / Masquer la boîte englobante cotée"
          >
            <Box className="w-3.5 h-3.5" />
            <span>Cotes</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHeightmap((v) => !v)}
            className={`min-h-8 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              showHeightmap
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                : 'hover:bg-[#1b2436] text-slate-400 border border-transparent'
            }`}
            title="Afficher / Masquer le maillage 3D Heightmap"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Heightmap</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMachineGrid((v) => !v)}
            className={`min-h-8 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              showMachineGrid
                ? 'bg-[#1b2436] text-slate-100 border border-slate-600'
                : 'hover:bg-[#1b2436] text-slate-400 border border-transparent'
            }`}
            title="Afficher / Masquer le plateau et la grille machine"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Grille</span>
          </button>

          {onOpenFraming && (
            <>
              <div className="h-4 w-px bg-slate-700 mx-0.5" aria-hidden="true" />
              <button
                type="button"
                onClick={onOpenFraming}
                disabled={!status.connected || status.state === 'Run'}
                className="min-h-8 flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg transition-colors bg-sky-400 hover:bg-sky-300 text-slate-950 disabled:opacity-35 cursor-pointer"
                title="Ouvrir l'assistant de traçage de cadre (Framing)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Cadrer</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bandeau télémétrique & légende intégrée en bas du viewport */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-wrap items-center justify-between gap-2 bg-[#111622]/90 backdrop-blur-md border border-slate-700/80 text-slate-100 shadow-lg rounded-xl px-3 py-2 text-xs pointer-events-none">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Légende compacte intégrée */}
          <div className="flex items-center gap-2.5 text-[11px] text-slate-300 pr-2.5 border-r border-slate-700">
            <span className="flex items-center gap-1 font-semibold" title="Déplacements rapides G0">
              <span className="w-3 border-b-2 border-dashed border-orange-400 inline-block" />
              G0
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-3 h-0.5 bg-sky-400 inline-block rounded-full" />
              {laserBeamWidth === undefined ? 'Coupe' : 'Laser'}
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-3 h-0.5 bg-emerald-400 inline-block rounded-full" />
              {laserBeamWidth === undefined ? 'Exécuté' : 'Gravé'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Pièce :</span>
            <span className="font-mono font-semibold text-slate-100">
              {stats
                ? `${stats.bounds.size.x.toFixed(1)} × ${stats.bounds.size.y.toFixed(1)} × ${stats.bounds.size.z.toFixed(1)} mm`
                : '—'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Parcours :</span>
            <span className="font-mono font-semibold text-slate-100">
              {stats ? `${stats.totalDistanceMm.toFixed(0)} mm` : '0 mm'}
            </span>
            {stats && stats.cuttingDistanceMm > 0 && (
              <span className="text-[11px] text-slate-400">
                (Coupe {stats.cuttingDistanceMm.toFixed(0)} mm)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Durée :</span>
            <span className="font-mono font-semibold text-slate-100">
              {stats ? formatDuration(stats.estimatedTimeSec) : '0s'}
            </span>
          </div>

          {heightmap?.enabled && (
            <div className="flex items-center gap-1 text-emerald-300 bg-emerald-500/15 border border-emerald-400/40 px-2 py-0.5 rounded-md">
              <Layers className="w-3 h-3 text-emerald-400" />
              <span className="text-[11px] font-semibold">Heightmap Active</span>
            </div>
          )}
        </div>

        {/* Position actuelle de l'outil (WPos) */}
        <div className="flex items-center gap-2 font-mono text-xs bg-[#090d14] border border-slate-800 px-2.5 py-1 rounded-lg tabular-nums">
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-rose-400 font-bold">X:{status.wpos.x.toFixed(2)}</span>
          <span className="text-emerald-400 font-bold">Y:{status.wpos.y.toFixed(2)}</span>
          <span className="text-sky-400 font-bold">Z:{status.wpos.z.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default Viewport3D;
