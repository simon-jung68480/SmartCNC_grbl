import type { LaserPath } from "./laserCam";

// Single-stroke characters keep the labels independent of fonts and SVG imports.
const glyphs: Record<string, string[]> = {
  "0": ["00 02 12 10 00"], "1": ["02 12 10"], "2": ["02 12 11 01 00 10"],
  "3": ["02 12 10 00", "01 11"], "4": ["02 01 11", "12 10"],
  "5": ["12 02 01 11 10 00"], "6": ["12 02 00 10 11 01"],
  "7": ["02 12 00"], "8": ["00 02 12 10 00", "01 11"], "9": ["01 02 12 10 00", "01 11"],
  "-": ["01 11"], ".": ["00 0.3,0"], "%": ["00 12", "02 0.3,2", "0.7,0 10"],
  "F": ["00 02 12", "01 11"], "Z": ["02 12 00 10"],
  "M": ["00 02 0.5,1 12 10"], "D": ["00 02 0.7,2 1,1.5 1,0.5 0.7,0 00"],
  "P": ["00 02 12 11 01"], "I": ["0.5,0 0.5,2", "00 10", "02 12"],
  "/": ["00 12"], " ": [],
};

export function calibrationLabelWidth(value: string, height: number): number {
  return (value.length * 0.78 - 0.23) * height;
}

export function calibrationLabel(value: string, x: number, y: number, height: number, vertical = false): LaserPath[] {
  return [...value].flatMap((character, index) =>
    glyphs[character].map((stroke, strokeIndex) => ({
      label: index === 0 && strokeIndex === 0 ? `Gravure : ${value}` : undefined,
      points: stroke.split(" ").map(point => {
        // A comma separates the coordinates so fractions can be used in either axis.
        const [u, v] = point.includes(",") ? point.split(",").map(Number) : [...point].map(Number);
        const along = (index * 0.78 + u * 0.55) * height;
        const across = v * height / 2;
        return vertical ? { x: x - across, y: y + along } : { x: x + along, y: y + across };
      }),
    })),
  );
}
