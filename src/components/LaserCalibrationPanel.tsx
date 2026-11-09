import React, { useState } from "react";
import type { LaserCutSettings } from "../utils/laserCam";
import { buildLaserCalibration, calibratedSteps, measuredKerf, type LaserCalibrationKind } from "../utils/laserCalibration";

interface Props {
  cut: LaserCutSettings;
  x: number;
  y: number;
  disabled?: boolean;
  onLoadProgram: (name: string, code: string, notes: string[]) => void;
  onApplyInterval?: (mm: number) => void;
}
const fieldClass = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const buttonClass = "rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold bg-white hover:bg-slate-100 disabled:opacity-40";
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
  return <label className="block space-y-1 text-xs text-slate-600"><span>{label}</span><input type="number" className={fieldClass} min={min} max={max} step={step} value={Number.isFinite(value)?value:""} onChange={e=>onChange(e.target.value===""?NaN:Number(e.target.value))}/></label>;
}
const display=(n:number)=> Number(n.toFixed(4)).toLocaleString("fr-FR");
export function LaserCalibrationPanel({cut,x,y,disabled,onLoadProgram,onApplyInterval}:Props) {
  const [kind,setKind]=useState<LaserCalibrationKind>("material");
  const [minimum,setMinimum]=useState(10),[maximum,setMaximum]=useState(50);
  const [samples,setSamples]=useState(5),[size,setSize]=useState(10),[gap,setGap]=useState(3);
  const [referenceZ,setReferenceZ]=useState(0),[zFeed,setZFeed]=useState(100),[allowZ,setAllowZ]=useState(false);
  const [error,setError]=useState("");
  const [currentSteps,setCurrentSteps]=useState(80),[requested,setRequested]=useState(100),[measured,setMeasured]=useState(100);
  const [axis,setAxis]=useState("X"),[opening,setOpening]=useState(10.15),[insert,setInsert]=useState(9.85);
  const [interval,setInterval]=useState(0.1);
  const [scanDifference,setScanDifference]=useState(0),[spot,setSpot]=useState(0.15);
  let stepsResult:number|undefined,kerf:number|undefined;
  try { stepsResult=calibratedSteps(currentSteps,requested,measured); } catch {}
  try { kerf=measuredKerf(opening,insert); } catch {}
  const variable = ["material","focus","interval","passes"].includes(kind);
  const unit=kind==="material"?"%":kind==="passes"?"passes":"mm";
  function generate() {
    setError("");
    try {
      const program=buildLaserCalibration({kind,x,y,size,gap,samples,min:minimum,max:maximum,referenceZ,zFeed,allowZ},cut);
      onLoadProgram(program.name,program.code,program.notes);
    } catch(e) { setError(e instanceof Error?e.message:String(e)); }
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
    <h3 className="text-sm font-bold text-slate-800">Banc de calibration laser</h3>
    <p className="text-xs text-slate-500">Générer un échantillon, contrôler son aperçu, puis lancer avec les commandes de l’atelier. Aucun test ne démarre ici. Vitesse, puissance, mode M3/M4 et échelle S proviennent des réglages de l’atelier. Sauf le test kerf, les passes de l’atelier sont ignorées.</p>
    <fieldset disabled={disabled} className="space-y-3 disabled:opacity-50">
      <label className="block text-xs text-slate-600 space-y-1"><span>Calibration</span><select className={fieldClass} value={kind} onChange={e=>{const choice=choices.find(c=>c.id===e.target.value)!;setKind(choice.id);setMinimum(choice.min);setMaximum(choice.max);setAllowZ(false);setError("");}}>{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2"><Numeric label="Taille du motif (mm)" value={size} onChange={setSize} min={2} max={200}/><Numeric label="Écart entre échantillons (mm)" value={gap} onChange={setGap} min={1} max={50}/></div>
      {variable&&<><Numeric label="Nombre d’échantillons (par axe pour la matrice)" value={samples} onChange={setSamples} min={2} max={10} step={1}/><div className="grid grid-cols-2 gap-2"><Numeric label={`Minimum (${unit})`} value={minimum} onChange={setMinimum}/><Numeric label={`Maximum (${unit})`} value={maximum} onChange={setMaximum}/></div></>}
      {kind==="material"&&<p className="text-xs text-slate-600">Colonnes de vitesse : {display(cut.feed/2)} à {display(cut.feed*2)} mm/min. Lignes de puissance : minimum à maximum. Aplats au pas de 0,15 mm.</p>}
      {kind==="focus"&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs"><p>Ce test déplace réellement Z entre les lignes. Vérifier la course libre et la référence de mise au point. Un Z positif monte la tête. Le test termine à Z référence.</p><div className="grid grid-cols-2 gap-2"><Numeric label="Z référence pièce (mm)" value={referenceZ} onChange={setReferenceZ}/><Numeric label="Avance Z (mm/min)" value={zFeed} onChange={setZFeed} min={1} max={5000}/></div><label className="flex items-center gap-2"><input type="checkbox" checked={allowZ} onChange={e=>setAllowZ(e.target.checked)}/>Autoriser les mouvements Z de ce test</label></div>}
      {kind==="scan-offset"&&<p className="text-xs text-slate-600">20 lignes aller/retour espacées de 0,4 mm. Comparer leurs extrémités à la vitesse choisie. Ce test mesure le décalage ; il ne corrige pas automatiquement le parcours.</p>}
      {kind==="dimensions"&&<p className="text-xs text-slate-600">Carré, cercle et diagonales. Mesurer les centres des traits ; des diagonales différentes indiquent un défaut mécanique d’équerrage.</p>}
      {kind==="kerf"&&<p className="text-xs text-slate-600">Découper un carré puis mesurer l’ouverture et l’insert. Utilise {cut.passes} passe(s). Le calculateur ci-dessous donne la largeur de coupe et le décalage à prévoir.</p>}
      <p className="text-xs text-slate-500">Départ au repère pièce X {display(x)}, Y {display(y)} mm. Les valeurs de chaque échantillon figurent dans les notes du programme.</p>
      <button type="button" className={buttonClass} onClick={generate}>Préparer le programme de calibration</button>
      {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
    </fieldset>
    <details className="border-t border-slate-200 pt-3"><summary className="cursor-pointer text-xs font-semibold">Mesures et calculateurs</summary><div className="pt-3 space-y-4">
      <div className="space-y-2"><h4 className="text-xs font-semibold">Pas/mm par mesure réelle</h4><label className="text-xs">Axe <select className={fieldClass} value={axis} onChange={e=>setAxis(e.target.value)}><option>X</option><option>Y</option><option>Z</option></select></label><div className="grid grid-cols-3 gap-2"><Numeric label="Pas/mm actuels" value={currentSteps} onChange={setCurrentSteps}/><Numeric label="Demandé (mm)" value={requested} onChange={setRequested}/><Numeric label="Mesuré (mm)" value={measured} onChange={setMeasured}/></div><p className="text-xs">{stepsResult===undefined?"Saisir trois valeurs positives valides.":`Réglage proposé $${axis==="X"?100:axis==="Y"?101:102} = ${display(stepsResult)} pas/mm.`} Reporter la valeur dans les paramètres GRBL après vérification. Aucune écriture automatique.</p></div>
      <div className="space-y-2"><h4 className="text-xs font-semibold">Largeur de coupe mesurée</h4><div className="grid grid-cols-2 gap-2"><Numeric label="Ouverture (mm)" value={opening} onChange={setOpening}/><Numeric label="Insert (mm)" value={insert} onChange={setInsert}/></div><p className="text-xs">{kerf===undefined?"L’ouverture doit être supérieure ou égale à l’insert, mesures positives.":`Kerf : ${display(kerf)} mm. Décalage du centre d’outil : ${display(kerf/2)} mm vers l’extérieur pour conserver l’insert, vers l’intérieur pour calibrer l’ouverture.`} Aucune compensation automatique des contours.</p></div>
      <div className="space-y-2"><h4 className="text-xs font-semibold">Spot et intervalle de balayage</h4><Numeric label="Largeur de spot mesurée (mm)" value={spot} onChange={setSpot} min={0.02} max={20}/><p className="text-xs">{Number.isFinite(spot)&&spot>=0.02&&spot<=20?`Point de départ : pas ${display(spot*0.8)} mm (recouvrement 20 %). Affiner avec les aplats.`:"Mesurer un trait net sur le matériau."}</p><Numeric label="Intervalle retenu (mm)" value={interval} onChange={setInterval} min={0.025} max={2}/>{onApplyInterval&&<button className={buttonClass} type="button" disabled={disabled||!Number.isFinite(interval)||interval<0.025||interval>2} onClick={()=>onApplyInterval(interval)}>Appliquer au remplissage et à l’image</button>}</div>
      <div className="space-y-2"><h4 className="text-xs font-semibold">Décalage aller / retour</h4><Numeric label="Décalage relatif mesuré (mm, signé)" value={scanDifference} onChange={setScanDifference}/><p className="text-xs">{Number.isFinite(scanDifference)?`Correction indicative par sens : ${display(scanDifference/2)} mm, à ${display(cut.feed)} mm/min.`:"Saisir une mesure valide."} Mesure indicative ; aucune correction de trajectoire appliquée.</p></div>
    </div></details>
  </section>;
}
