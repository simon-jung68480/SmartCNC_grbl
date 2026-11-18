import { framingGCode, type Bounds2, type Point2 } from "./laserCam";

const anchorFractions = {
  "bottom-left": { x: 0, y: 0 },
  "bottom-center": { x: 0.5, y: 0 },
  "bottom-right": { x: 1, y: 0 },
  "middle-left": { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  "middle-right": { x: 1, y: 0.5 },
  "top-left": { x: 0, y: 1 },
  "top-center": { x: 0.5, y: 1 },
  "top-right": { x: 1, y: 1 },
} as const;

export type LaserJobAnchor = keyof typeof anchorFractions;

export interface LaserJobPlacement {
  startFrom: "absolute" | "current-position" | "work-origin" | "user-origin";
  anchor: LaserJobAnchor;
  offset: Point2;
  userOrigin: Point2 | null;
}

export const defaultLaserJobPlacement: LaserJobPlacement = {
  startFrom: "absolute",
  anchor: "bottom-left",
  offset: { x: 0, y: 0 },
  userOrigin: null,
};

function validXY(point: Point2) {
  return [point.x, point.y].every((value) => Number.isFinite(value) && Math.abs(value) <= 100_000);
}

const formatCoordinate = (value: number) => Number(value.toFixed(3));

export function laserJobTranslation(
  bounds: Bounds2,
  placement: LaserJobPlacement,
  currentPosition?: Point2,
): Point2 {
  if (!validXY(placement.offset)) throw new Error("Le décalage XY est invalide.");
  if (placement.startFrom === "absolute") return { ...placement.offset };

  const target = placement.startFrom === "current-position" ? currentPosition
    : placement.startFrom === "work-origin" ? { x: 0, y: 0 } : placement.userOrigin;
  if (!target || !validXY(target)) {
    throw new Error(placement.startFrom === "current-position"
      ? "La position de travail actuelle est indisponible."
      : "Mémorisez une origine utilisateur pour positionner la gravure.");
  }

  const { minX, minY, maxX, maxY } = bounds;
  if (!validXY({ x: minX, y: minY }) || !validXY({ x: maxX, y: maxY }) || minX > maxX || minY > maxY) {
    throw new Error("Les limites de la gravure sont invalides.");
  }
  const anchor = anchorFractions[placement.anchor];
  return {
    x: target.x - (minX + (maxX - minX) * anchor.x) + placement.offset.x,
    y: target.y - (minY + (maxY - minY) * anchor.y) + placement.offset.y,
  };
}

/** Place les mouvements XY du G-code absolu en millimètres généré par l’atelier. */
export function placeLaserJob(
  code: string,
  engravingBounds: Bounds2,
  placement: LaserJobPlacement,
  currentPosition?: Point2,
): string {
  const { x, y } = laserJobTranslation(engravingBounds, placement, currentPosition);
  if (x === 0 && y === 0) return code;

  let metric = false;
  let absolute = false;
  return code.split("\n").map((line) => {
    const command = line.split(";", 1)[0].trim();
    if (command === "G20" || command === "G21") metric = command === "G21";
    if (command === "G90" || command === "G91") absolute = command === "G90";
    if (!/\b[XY]/.test(command)) return line;
    if (!metric || !absolute || !/^G[01](?:\s|$)/.test(command)) {
      throw new Error("Le placement exige des mouvements XY absolus en millimètres.");
    }

    const commentIndex = line.indexOf(";");
    const words = commentIndex < 0 ? line : line.slice(0, commentIndex);
    const moved = words.replace(/\b([XY])([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?=\s|$)/g, (_, axis, value) => {
      const offset = axis === "X" ? x : y;
      if (offset === 0) return `${axis}${value}`;
      const coordinate = Number(value) + offset;
      if (!Number.isFinite(coordinate) || Math.abs(coordinate) > 100_000) {
        throw new Error("Le placement dépasse la limite de coordonnées de 100 000 mm.");
      }
      return `${axis}${formatCoordinate(coordinate)}`;
    });
    return commentIndex < 0 ? moved : moved + line.slice(commentIndex);
  }).join("\n");
}

/** Le retour facultatif conserve la position de départ après un cadrage. */
export function frameLaserJob(bounds: Bounds2, margin: number, feed: number, returnPosition?: Point2): string {
  const code = framingGCode(bounds, margin, feed);
  if (!returnPosition) return code;
  if (!validXY(returnPosition)) throw new Error("La position de retour du cadrage est invalide.");

  const x = formatCoordinate(returnPosition.x);
  const y = formatCoordinate(returnPosition.y);
  return `${code}\nG0 X${x} Y${y}\nM5`;
}
