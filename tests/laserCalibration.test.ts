import assert from "node:assert/strict";
import test from "node:test";
import { buildLaserCalibration, calibratedSteps, measuredKerf, type LaserCalibrationConfig } from "../src/utils/laserCalibration";
import type { LaserCutSettings } from "../src/utils/laserCam";
const cut:LaserCutSettings={feed:1200,power:25,maxPower:1000,passes:3,mode:"M4",focus:{enabled:true,spotDiameter:0.15,offset:5,controlZ:true,referenceZ:0,zFeed:100,restoreZ:true}};
const config:LaserCalibrationConfig={kind:"interval",x:30,y:40,size:10,gap:3,samples:3,min:0.05,max:0.15,referenceZ:-10,zFeed:100,allowZ:false};

function assertEngraved(code: string, label: string) {
  const marker = `; Gravure : ${label}\n`;
  assert.ok(code.includes(marker), marker);
  const [, path] = code.split(marker);
  assert.match(path, /^M5\nG0 X[-.\d]+ Y[-.\d]+\nM4 S0\nG1 F1200\nG1 X[-.\d]+ Y[-.\d]+ S250\n/);
}

test("calibration interval uses exact pitch, placement and a single pass without inherited Z",()=>{
  const p=buildLaserCalibration(config,cut);
  assert.match(p.code,/G0 X30 Y40/);
  assert.match(p.code,/G1 X30 Y40\.05 S250/);
  assert.doesNotMatch(p.code,/\bZ[-\d]/);
  assert.match(p.notes.join("\n"),/Case 2.*0.1 mm/);
  assertEngraved(p.code, "0.05 MM / 508 DPI");
  assertEngraved(p.code, "0.1 MM / 254 DPI");
  assert.ok(p.code.endsWith("M5\nG90"));
});
test("focus refuses Z without explicit authorization and restores the reference with laser off",()=>{
  const c={...config,kind:"focus" as const,min:-2,max:2};
  assert.throws(()=>buildLaserCalibration(c,cut),/explicitement/);
  const p=buildLaserCalibration({...c,allowZ:true},cut);
  assert.ok(p.code.startsWith("; Échelle de mise au point Z\nM5\nG21\nG90\nG17\nG94\nM5\nG1 Z-12 F100"));
  assert.match(p.code,/M5\nG1 Z-8 F100/);
  const [sampleLines, labels] = p.code.split("; SmartCNC laser - Repères Z");
  assert.ok(sampleLines.endsWith("M5\nG1 Z-10 F100\n"));
  assertEngraved(labels, "Z-12");
  assertEngraved(labels, "Z-10");
  assertEngraved(labels, "Z-8");
  assert.doesNotMatch(labels, /^G1 Z/m);
  assert.ok(p.code.endsWith("M5\nG90"));
  assert.doesNotMatch(p.code,/Z5\b/);
});
test("cut pass samples use their own integer counts and laser-off rapid positioning",()=>{
  const p=buildLaserCalibration({...config,kind:"passes",min:1,max:3},cut);
  assert.equal((p.code.match(/M4 S0/g)||[]).length,6);
  assert.doesNotMatch(p.code,/\bZ[-\d]/);
  const lines=p.code.split("\n");
  lines.forEach((line,i)=>{if(line.startsWith("G0 "))assert.equal(lines[i-1],"M5");});
  assert.throws(()=>buildLaserCalibration({...config,kind:"passes",min:1.5,max:3},cut),/entiers/);
});
test("kerf test honors workshop passes and calculators distinguish kerf from tool offset",()=>{
  const p=buildLaserCalibration({...config,kind:"kerf"},cut);
  assert.equal((p.code.match(/M4 S0/g)||[]).length,3);
  assert.ok(Math.abs(measuredKerf(10.15,9.85)-0.15)<1e-8);
  assert.throws(()=>measuredKerf(9.8,10.2));
  assert.equal(calibratedSteps(80,100,98),80*100/98);
  assert.throws(()=>calibratedSteps(80,100,0));
  assert.throws(()=>calibratedSteps(NaN,100,98));
});
test("all calibration kinds reject unsafe input and invalid power settings",()=>{
  for(const kind of ["material","focus","interval","passes","dimensions","kerf","scan-offset"] as const){
    const c={...config,kind,min:1,max:3,allowZ:true};
    assert.throws(()=>buildLaserCalibration({...c,x:NaN},cut));
    assert.throws(()=>buildLaserCalibration({...c,samples:100},cut));
    assert.throws(()=>buildLaserCalibration(c,{...cut,power:101}));
  }
  assert.throws(()=>buildLaserCalibration({...config,min:0.001},cut),/Pas minimal/);
  assert.throws(()=>buildLaserCalibration({...config,kind:"focus",min:-30,allowZ:true},cut),/Décalage/);
});
test("material matrix engraves the actual speed and power beside custom columns and rows",()=>{
  const material=buildLaserCalibration({...config,kind:"material",min:10,max:30,
    matrix:{columns:3,rows:2,minFeed:500,maxFeed:2500,hatch:0.4}},cut);
  assert.match(material.code,/G1 F500\n/);
  assert.match(material.code,/G1 F2500\n/);
  assert.match(material.code,/S100/);
  assert.match(material.code,/S300/);
  for (const label of ["F500", "F1500", "F2500", "10%", "30%"]) assertEngraved(material.code, label);
  assert.equal((material.code.match(/; Case L\d C\d/g) || []).length, 6);
});

test("scan alignment engraves 20 alternating lines and the speed beside each band",()=>{
  const scanConfig = {...config,kind:"scan-offset" as const,scanFeeds:[600,1800]};
  const scan=buildLaserCalibration(scanConfig,{...cut,contourDirection:"reverse",scanOffsets:[{feed:600,offset:0.5}]});
  assert.equal((scan.code.match(/; Ligne \d+ - /g)||[]).length,40);
  assert.match(scan.code,/G0 X40 Y40\.4/);
  assert.match(scan.code,/G1 X30 Y40\.4 S250/);
  assert.match(scan.code,/G0 X30 Y50\.6\nM4 S0\nG1 F1800\nG1 X40 Y50\.6 S250/);
  assertEngraved(scan.code, "F600");
  assertEngraved(scan.code, "F1800");
  assert.doesNotMatch(scan.code,/\$\d+=/);
  assert.throws(()=>buildLaserCalibration({...scanConfig,scanFeeds:[600,600]},cut),/distinctes/);
  assert.throws(()=>buildLaserCalibration({...scanConfig,scanFeeds:[]},cut),/Nombre de vitesses/);
});
