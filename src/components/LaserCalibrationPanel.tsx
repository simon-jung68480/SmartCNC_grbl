import React, { useState } from "react";
import { MAX_LASER_SCAN_OFFSET, type LaserCutSettings, type LaserScanOffset } from "../utils/laserCam";
import { buildLaserCalibration, calibratedSteps, measuredKerf, type LaserCalibrationKind } from "../utils/laserCalibration";

interface Props {
  cut: LaserCutSettings;
  x: number;
  y: number;
  disabled?: boolean;
  onLoadProgram: (name: string, code: string, notes: string[], maxPower: number) => void;
  onApplyInterval?: (mm: number) => void;
  onApplyScanOffset?: (entry: LaserScanOffset) => void;
}
const fieldClass = "w-full min-w-0 min-h-9 rounded-lg border border-slate-700 bg-[#090d14] px-2.5 py-1.5 text-sm text-slate-100 focus:border-sky-400 focus:outline-none";
const buttonClass = "min-h-9 rounded-lg border border-slate-700/80 px-3.5 py-2 text-xs font-semibold bg-[#1b2436] hover:bg-[#243047] text-slate-100 transition-colors cursor-pointer disabled:opacity-40";
const choices: { id: LaserCalibrationKind; name: string; min: number; max: number }[] = [
  {id:"material",name:"Matrice vitesse / puissance",min:10,max:50},
  {id:"focus",name:"Mise au point avec axe Z",min:-2,max:2},
  {id:"interval",name:"Pas de balayage / spot",min:0.05,max:0.25},
  {id:"passes",name:"Nombre de passes de coupe",min:1,max:5},
  {id:"dimensions",name:"Dimensions et équerrage",min:0,max:1},
  {id:"kerf",name:"Largeur de coupe (kerf)",min:0,max:1},
  {id:"scan-offset",name:"Alignement aller / retour",min:0,max:1},
];
function Numeric({label,value,onChange,min,max,step="any"}:{label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number|"any"}) {
  return <label className="block space-y-1 text-xs text-slate-300"><span>{label}</span><input type="number" className={fieldClass} min={min} max={max} step={step} value={Number.isFinite(value)?value:""} onChange={e=>onChange(e.target.value===""?NaN:Number(e.target.value))}/></label>;
}
const display=(n:number)=> Number(n.toFixed(4)).toLocaleString("fr-FR");
export function LaserCalibrationPanel({cut,x,y,disabled,onLoadProgram,onApplyInterval,onApplyScanOffset}:Props) {
  const [kind,setKind]=useState<LaserCalibrationKind>("material");
  const [minimum,setMinimum]=useState(10),[maximum,setMaximum]=useState(50);
  const [samples,setSamples]=useState(5),[size,setSize]=useState(10),[gap,setGap]=useState(3);
  const [positionX, setPositionX] = useState<number | null>(null);
  const [positionY, setPositionY] = useState<number | null>(null);
  const [engraving, setEngraving] = useState<Partial<LaserCutSettings>>({});
  const testCut = { ...cut, ...engraving };
  const [matrix, setMatrix] = useState({ columns: 5, rows: 5, hatch: 0.15 });
  const [matrixMinFeed, setMatrixMinFeed] = useState<number | null>(null);
  const [matrixMaxFeed, setMatrixMaxFeed] = useState<number | null>(null);
  const [scanInput, setScanInput] = useState<string | null>(null);
  const [correctionFeed, setCorrectionFeed] = useState<number | null>(null);
  const scanField = scanInput ?? String(testCut.feed);
  const scanFeeds = scanField.trim().split(/[\s;]+/).filter(Boolean).map(value => Number(value.replace(",", ".")));
  const scanCalibrationFeed = correctionFeed ?? scanFeeds[0] ?? testCut.feed;
  const [referenceZ,setReferenceZ]=useState(0),[zFeed,setZFeed]=useState(100),[allowZ,setAllowZ]=useState(false);
  const [error,setError]=useState("");
  const [currentSteps,setCurrentSteps]=useState(80),[requested,setRequested]=useState(100),[measured,setMeasured]=useState(100);
  const [axis,setAxis]=useState("X"),[opening,setOpening]=useState(10.15),[insert,setInsert]=useState(9.85);
  const [interval,setInterval]=useState(0.1);
  const [scanDifference,setScanDifference]=useState(NaN),[spot,setSpot]=useState(0.15);
  const scanOffset = scanDifference / 2;
  const validScanOffset = Number.isFinite(scanOffset)
    && Math.abs(scanOffset) <= MAX_LASER_SCAN_OFFSET
    && Number.isFinite(scanCalibrationFeed) && scanCalibrationFeed >= 1 && scanCalibrationFeed <= 30000;
  let stepsResult:number|undefined,kerf:number|undefined;
  try { stepsResult=calibratedSteps(currentSteps,requested,measured); } catch {}
  try { kerf=measuredKerf(opening,insert); } catch {}
  const variable = ["material","focus","interval","passes"].includes(kind);
  const separateSamples = ["focus", "interval", "passes"].includes(kind);
  const usesGap = !["dimensions", "kerf"].includes(kind);
  const unit=kind==="material"?"%":kind==="passes"?"passes":"mm";
  function generate() {
    setError("");
    try {
      const program = buildLaserCalibration({
        kind, x: positionX ?? x, y: positionY ?? y, size, gap: usesGap ? gap : 3,
        samples: separateSamples ? samples : 5, min: minimum, max: maximum, referenceZ, zFeed, allowZ,
        matrix: { ...matrix, minFeed: matrixMinFeed ?? testCut.feed / 2, maxFeed: matrixMaxFeed ?? testCut.feed * 2 },
        scanFeeds,
      }, testCut);
      onLoadProgram(program.name, program.code, program.notes, testCut.maxPower);
    } catch(e) { setError(e instanceof Error?e.message:String(e)); }
  }
  return <section className="rounded-xl border border-slate-800 bg-[#141b27] text-slate-100 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.28)] space-y-3">
    <h3 className="text-sm font-bold text-slate-50">Banc de calibration laser</h3>
    <fieldset disabled={disabled} className="space-y-3 disabled:opacity-50">
      <label className="block text-xs text-slate-300 space-y-1"><span>Calibration</span><select className={fieldClass} value={kind} onChange={e=>{const choice=choices.find(c=>c.id===e.target.value)!;setKind(choice.id);setMinimum(choice.min);setMaximum(choice.max);setAllowZ(false);setError("");}}>{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2">
        <Numeric label="Origine X pièce (mm)" value={positionX ?? x} onChange={setPositionX}/>
        <Numeric label="Origine Y pièce (mm)" value={positionY ?? y} onChange={setPositionY}/>
        <Numeric label="Taille du motif (mm)" value={size} onChange={setSize} min={2} max={200}/>
        {usesGap && <Numeric label="Écart (mm)" value={gap} onChange={setGap} min={1} max={50}/>}
      </div>
      {separateSamples && <Numeric label="Nombre d’échantillons" value={samples} onChange={setSamples} min={2} max={10} step={1}/>}
      {variable && <div className="grid grid-cols-2 gap-2"><Numeric label={`Minimum (${unit})`} value={minimum} onChange={setMinimum}/><Numeric label={`Maximum (${unit})`} value={maximum} onChange={setMaximum}/></div>}
      {kind === "material" && <div className="grid grid-cols-2 gap-2">
        <Numeric label="Colonnes (vitesses)" value={matrix.columns} onChange={columns => setMatrix(current => ({ ...current, columns }))} min={2} max={10} step={1}/>
        <Numeric label="Lignes (puissances)" value={matrix.rows} onChange={rows => setMatrix(current => ({ ...current, rows }))} min={2} max={10} step={1}/>
        <Numeric label="Vitesse min (mm/min)" value={matrixMinFeed ?? testCut.feed / 2} onChange={setMatrixMinFeed} min={1}/>
        <Numeric label="Vitesse max (mm/min)" value={matrixMaxFeed ?? testCut.feed * 2} onChange={setMatrixMaxFeed} min={1}/>
        <Numeric label="Pas de remplissage (mm)" value={matrix.hatch} onChange={hatch => setMatrix(current => ({ ...current, hatch }))} min={0.05}/>
      </div>}
      {kind==="focus"&&<div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 space-y-2 text-xs text-amber-100"><p>Ce test déplace réellement Z entre les lignes. Vérifier la course libre et la référence de mise au point. Un Z positif monte la tête. Le test termine à Z référence.</p><div className="grid grid-cols-2 gap-2"><Numeric label="Z référence pièce (mm)" value={referenceZ} onChange={setReferenceZ}/><Numeric label="Avance Z (mm/min)" value={zFeed} onChange={setZFeed} min={1} max={5000}/></div><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="accent-amber-400" checked={allowZ} onChange={e=>setAllowZ(e.target.checked)}/>Autoriser les mouvements Z de ce test</label></div>}
      {kind === "scan-offset" && <label className="block space-y-1 text-xs text-slate-300">
        <span>Vitesses du test (mm/min)</span>
        <input className={fieldClass} value={scanField} onChange={event => setScanInput(event.target.value)} />
        <span>Séparez les vitesses par des espaces, par exemple 600 1200 2400. Le motif grave 20 lignes par vitesse.</span>
      </label>}
      {kind==="dimensions"&&<p className="text-xs text-slate-300">Carré, cercle et diagonales. Mesurer les centres des traits ; des diagonales différentes indiquent un défaut mécanique d’équerrage.</p>}
      {kind==="kerf"&&<p className="text-xs text-slate-300">Découper un carré puis mesurer l’ouverture et l’insert. Le calculateur ci-dessous donne la largeur de coupe et le décalage à prévoir.</p>}
      <details className="rounded-xl border border-slate-800 bg-[#0f1520] p-2.5">
        <summary className="cursor-pointer text-xs font-bold text-slate-100">Réglages de gravure</summary>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Numeric label={kind === "material" || kind === "scan-offset" ? "Avance des repères (mm/min)" : "Avance (mm/min)"} value={testCut.feed} onChange={feed => setEngraving(current => ({ ...current, feed }))} min={1}/>
          <Numeric label={kind === "material" ? "Puissance des repères (%)" : "Puissance (%)"} value={testCut.power} onChange={power => setEngraving(current => ({ ...current, power }))} min={0.1} max={100}/>
          {kind === "kerf" && <Numeric label="Passes" value={testCut.passes} onChange={passes => setEngraving(current => ({ ...current, passes }))} min={1} max={50} step={1}/>}
          <Numeric label="S maximal (GRBL $30)" value={testCut.maxPower} onChange={maxPower => setEngraving(current => ({ ...current, maxPower }))} min={1}/>
          <label className="block space-y-1 text-xs text-slate-300">Mode laser
            <select className={fieldClass} value={testCut.mode} onChange={event => setEngraving(current => ({ ...current, mode: event.target.value as LaserCutSettings["mode"] }))}>
              <option value="M4">M4 dynamique</option><option value="M3">M3 constant</option>
            </select>
          </label>
        </div>
      </details>
      <button type="button" className="min-h-9 rounded-lg border border-sky-300 bg-sky-400 hover:bg-sky-300 px-3.5 py-2 text-xs font-bold text-slate-950 transition-colors cursor-pointer disabled:opacity-40" onClick={generate}>Créer le G-code et afficher l’aperçu</button>
      {error&&<p role="alert" className="text-xs text-rose-300">{error}</p>}
    </fieldset>
    <details className="border-t border-slate-800 pt-3"><summary className="cursor-pointer text-xs font-bold text-slate-100">Mesures et calculateurs</summary><div className="pt-3 space-y-4">
      <div className="space-y-2"><h4 className="text-xs font-bold text-slate-100">Pas/mm par mesure réelle</h4><label className="text-xs text-slate-300 block space-y-1"><span>Axe</span><select className={fieldClass} value={axis} onChange={e=>setAxis(e.target.value)}><option>X</option><option>Y</option><option>Z</option></select></label><div className="grid grid-cols-3 gap-2"><Numeric label="Pas/mm actuels" value={currentSteps} onChange={setCurrentSteps}/><Numeric label="Demandé (mm)" value={requested} onChange={setRequested}/><Numeric label="Mesuré (mm)" value={measured} onChange={setMeasured}/></div><p className="text-xs text-slate-300">{stepsResult===undefined?"Saisir trois valeurs positives valides.":`Réglage proposé $${axis==="X"?100:axis==="Y"?101:102} = ${display(stepsResult)} pas/mm.`} Reporter la valeur dans les paramètres GRBL après vérification. Aucune écriture automatique.</p></div>
      <div className="space-y-2"><h4 className="text-xs font-bold text-slate-100">Largeur de coupe mesurée</h4><div className="grid grid-cols-2 gap-2"><Numeric label="Ouverture (mm)" value={opening} onChange={setOpening}/><Numeric label="Insert (mm)" value={insert} onChange={setInsert}/></div><p className="text-xs text-slate-300">{kerf===undefined?"L’ouverture doit être supérieure ou égale à l’insert, mesures positives.":`Kerf : ${display(kerf)} mm. Décalage du centre d’outil : ${display(kerf/2)} mm vers l’extérieur pour conserver l’insert, vers l’intérieur pour calibrer l’ouverture.`} Aucune compensation automatique des contours.</p></div>
      <div className="space-y-2"><h4 className="text-xs font-bold text-slate-100">Spot et intervalle de balayage</h4><Numeric label="Largeur de spot mesurée (mm)" value={spot} onChange={setSpot} min={0.02} max={20}/><p className="text-xs text-slate-300">{Number.isFinite(spot)&&spot>=0.02&&spot<=20?`Point de départ : pas ${display(spot*0.8)} mm (recouvrement 20 %). Affiner avec les aplats.`:"Mesurer un trait net sur le matériau."}</p><Numeric label="Intervalle retenu (mm)" value={interval} onChange={setInterval} min={0.025} max={2}/>{onApplyInterval&&<button className={buttonClass} type="button" disabled={disabled||!Number.isFinite(interval)||interval<0.025||interval>2} onClick={()=>onApplyInterval(interval)}>Appliquer au remplissage et à l’image</button>}</div>
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-100">Décalage aller / retour</h4>
        <Numeric label="Vitesse mesurée (mm/min)" value={scanCalibrationFeed} onChange={setCorrectionFeed} min={1} max={30000}/>
        <Numeric label="X aller moins X retour au même bord (mm)"
          value={scanDifference} onChange={setScanDifference}
          min={-2 * MAX_LASER_SCAN_OFFSET} max={2 * MAX_LASER_SCAN_OFFSET}/>
        <p className="text-xs text-slate-300">L’aller va vers X positif. Une correction positive décale chaque ligne dans le sens opposé à son déplacement.</p>
        {validScanOffset && <p className="text-xs text-emerald-300 font-medium">Correction par sens de {display(scanOffset)} mm à {display(scanCalibrationFeed)} mm/min.</p>}
        {onApplyScanOffset && (
          <button type="button" className={buttonClass} disabled={disabled || !validScanOffset}
            onClick={() => onApplyScanOffset({ feed: scanCalibrationFeed, offset: scanOffset })}>
            Appliquer à cette vitesse
          </button>
        )}
      </div>
    </div></details>
  </section>;
}
