import { calibrationPaths, generateVectorGCode, materialTestPaths, type LaserCutSettings, type LaserPath } from "./laserCam";

export type LaserCalibrationKind = "material" | "focus" | "interval" | "passes" | "dimensions" | "kerf" | "scan-offset";
export interface LaserCalibrationConfig {
  kind: LaserCalibrationKind;
  x: number;
  y: number;
  size: number;
  gap: number;
  samples: number;
  min: number;
  max: number;
  referenceZ: number;
  zFeed: number;
  allowZ: boolean;
}
export interface LaserCalibrationProgram { name: string; code: string; notes: string[] }
const f = (n: number) => Number(n.toFixed(4)).toString();
function range(n: number, min: number, max: number, label: string) {
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} : valeur attendue entre ${min} et ${max}.`);
}
export function calibratedSteps(current: number, requested: number, measured: number): number {
  range(current, 0.001, 1e6, "Pas/mm actuels");
  range(requested, 0.001, 10000, "Distance demandée");
  range(measured, 0.001, 10000, "Distance mesurée");
  const result = current * requested / measured;
  range(result, 0.001, 1e6, "Pas/mm calculés");
  return result;
}
/** A cut enlarges the opening and reduces the loose insert by one kerf each. */
export function measuredKerf(opening: number, insert: number): number {
  range(opening, 0.001, 10000, "Ouverture mesurée");
  range(insert, 0.001, opening, "Insert mesuré");
  return (opening - insert) / 2;
}
export function buildLaserCalibration(c: LaserCalibrationConfig, cut: LaserCutSettings): LaserCalibrationProgram {
  range(c.x, -10000, 10000, "Position X"); range(c.y, -10000, 10000, "Position Y");
  range(c.size, 2, 200, "Taille"); range(c.gap, 1, 50, "Écart");
  range(c.samples, 2, 10, "Échantillons");
  if (!Number.isInteger(c.samples)) throw new Error("Le nombre d’échantillons doit être entier.");
  const clean: LaserCutSettings = { ...cut, passes: 1, focus: undefined };
  const values = Array.from({length:c.samples}, (_,i)=> c.min + (c.max-c.min)*i/(c.samples-1));
  const paths: LaserPath[] = [];
  const notes: string[] = ["Repère pièce en mm. Contrôler le cadrage avant lancement. Les numéros et valeurs figurent dans le G-code, pas gravés sur le matériau."];
  const offset = (ps: LaserPath[], x = c.x, y = c.y) => ps.map(p => ({ ...p, points:p.points.map(q=>({x:q.x+x,y:q.y+y})) }));
  const square = (x: number, y: number, size: number, label: string): LaserPath => ({label, points:[{x,y},{x:x+size,y},{x:x+size,y:y+size},{x,y:y+size},{x,y}]});
  let name: string;
  if (c.kind === "material") {
    range(c.min, 0.1, 100, "Puissance minimale"); range(c.max, c.min, 100, "Puissance maximale");
    name = "Matrice vitesse-puissance";
    paths.push(...offset(materialTestPaths({columns:c.samples,rows:c.samples,size:c.size,gap:c.gap,minFeed:cut.feed/2,maxFeed:cut.feed*2,minPower:c.min,maxPower:c.max,hatch:0.15})));
    notes.push(`Colonnes : vitesse de ${f(cut.feed/2)} à ${f(cut.feed*2)} mm/min. Lignes : puissance de ${f(c.min)} à ${f(c.max)} %.`);
  } else if (c.kind === "focus") {
    if (!c.allowZ) throw new Error("Autorisez explicitement les mouvements Z pour le test de focus.");
    range(c.min,-20,20,"Décalage Z minimal"); range(c.max,c.min,20,"Décalage Z maximal");
    range(c.referenceZ,-10000,10000,"Référence Z"); range(c.zFeed,1,5000,"Avance Z");
    name = "Échelle de mise au point Z";
    const blocks = values.map((z,i)=> {
      const path = {label:`Ligne ${i+1} - Z relatif ${f(z)} mm`, points:[{x:c.x,y:c.y+i*c.gap},{x:c.x+c.size,y:c.y+i*c.gap}]};
      return `M5\nG1 Z${f(c.referenceZ+z)} F${f(c.zFeed)}\n${generateVectorGCode([path],clean,name)}`;
    });
    notes.push("Une ligne par hauteur Z, du minimum au maximum. Retenir la ligne la plus fine. Z positif monte la tête. Retour à la référence en fin de test.", ...values.map((v,i)=>`Ligne ${i+1} : Z référence ${f(c.referenceZ)} + ${f(v)} mm.`));
    return {name,code:[`; ${name}`,"M5","G21","G90","G17","G94",...blocks,"M5",`G1 Z${f(c.referenceZ)} F${f(c.zFeed)}`,"G90"].join("\n"),notes};
  } else if (c.kind === "interval") {
    name = "Échelle de pas de balayage";
    range(c.min,0.025,2,"Pas minimal"); range(c.max,c.min,2,"Pas maximal");
    for (const [i,step] of values.entries()) {
      const x = c.x+i*(c.size+c.gap);
      const rows = Math.floor(c.size/step);
      for(let row=0;row<=rows;row++) paths.push({label:`Case ${i+1} - pas ${f(step)} mm`,points:[{x:x+(row%2?c.size:0),y:c.y+row*step},{x:x+(row%2?0:c.size),y:c.y+row*step}]});
    }
    notes.push("Choisir le plus grand pas donnant un aplat régulier sans bandes.",...values.map((v,i)=>`Case ${i+1} de gauche à droite : ${f(v)} mm (${f(25.4/v)} DPI).`));
  } else if (c.kind === "passes") {
    name = "Échelle de passes de coupe";
    range(c.min,1,50,"Passes minimales"); range(c.max,c.min,50,"Passes maximales");
    if(!Number.isInteger(c.min)||!Number.isInteger(c.max)) throw new Error("Les nombres de passes doivent être entiers.");
    const counts = [...new Set(values.map(Math.round))];
    counts.forEach((count,i)=> {
      const p=square(c.x+i*(c.size+c.gap),c.y,c.size,`Case ${i+1} - ${count} passes`);
      for(let n=0;n<count;n++) paths.push(p);
      notes.push(`Case ${i+1} : ${count} passes à ${cut.power} %, ${cut.feed} mm/min.`);
    });
    notes.push("Les passes de chaque carré sont consécutives. Surveiller la chauffe et l’inflammation du matériau.");
  } else if(c.kind === "dimensions") {
    name = "Précision dimensionnelle";
    paths.push(...offset(calibrationPaths("square-circle",c.size)));
    paths.push({label:"Diagonale 1",points:[{x:c.x,y:c.y},{x:c.x+c.size,y:c.y+c.size}]},{label:"Diagonale 2",points:[{x:c.x+c.size,y:c.y},{x:c.x,y:c.y+c.size}]});
    notes.push(`Carré ${c.size} × ${c.size} mm. Cercle diamètre ${f(c.size*0.8)} mm. Mesurer entre centres des traits pour éviter de confondre kerf et erreur de pas/mm. Comparer les diagonales pour vérifier l’équerrage mécanique.`);
  } else if(c.kind === "kerf") {
    name = "Mesure de largeur de coupe";
    paths.push(square(c.x,c.y,c.size,"Carré insert / ouverture"));
    // For a cut-through sample the selected workshop pass count is meaningful.
    clean.passes=cut.passes;
    notes.push(`Carré nominal ${c.size} mm, ${cut.passes} passes. Mesurer l’ouverture et l’insert séparé : kerf = (ouverture − insert) / 2. Décalage du centre d’outil = kerf / 2. Ce test n’applique aucune compensation au dessin.`);
  } else if(c.kind === "scan-offset") {
    name = "Alignement du balayage aller-retour";
    for(let row=0;row<20;row++) paths.push({label:`Ligne ${row+1} - ${row%2?"retour":"aller"}`,points:[{x:c.x+(row%2?c.size:0),y:c.y+row*0.4},{x:c.x+(row%2?0:c.size),y:c.y+row*0.4}]});
    notes.push(`Lignes alternées à ${cut.feed} mm/min. Comparer les extrémités des lignes aller/retour. La correction par sens est la moitié de leur décalage relatif. Répéter pour chaque vitesse utilisée. Cette version mesure le défaut sans appliquer de compensation automatique ni délai firmware.`);
  } else throw new Error("Calibration inconnue.");
  return { name, code:generateVectorGCode(paths,clean,name), notes };
}
