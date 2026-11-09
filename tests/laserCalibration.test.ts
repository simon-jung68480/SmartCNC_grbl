import assert from "node:assert/strict";
import test from "node:test";
import { buildLaserCalibration, calibratedSteps, measuredKerf, type LaserCalibrationConfig } from "../src/utils/laserCalibration";
import type { LaserCutSettings } from "../src/utils/laserCam";
const cut:LaserCutSettings={feed:1200,power:25,maxPower:1000,passes:3,mode:"M4",focus:{enabled:true,spotDiameter:0.15,offset:5,controlZ:true,referenceZ:0,zFeed:100,restoreZ:true}};
const config:LaserCalibrationConfig={kind:"interval",x:30,y:40,size:10,gap:3,samples:3,min:0.05,max:0.15,referenceZ:-10,zFeed:100,allowZ:false};
test("calibration interval uses exact pitch, placement and a single pass without inherited Z",()=>{
  const p=buildLaserCalibration(config,cut);
  assert.match(p.code,/G0 X30 Y40/);
  assert.match(p.code,/G1 X30 Y40\.05 S250/);
  assert.doesNotMatch(p.code,/\bZ[-\d]/);
  assert.match(p.notes.join("\n"),/Case 2.*0.1 mm/);
  assert.ok(p.code.endsWith("M5\nG90"));
});
test("focus refuses Z without explicit authorization and restores the reference with laser off",()=>{
  const c={...config,kind:"focus" as const,min:-2,max:2};
  assert.throws(()=>buildLaserCalibration(c,cut),/explicitement/);
  const p=buildLaserCalibration({...c,allowZ:true},cut);
  assert.ok(p.code.startsWith("; Échelle de mise au point Z\nM5\nG21\nG90\nG17\nG94\nM5\nG1 Z-12 F100"));
  assert.match(p.code,/M5\nG1 Z-8 F100/);
  assert.ok(p.code.endsWith("M5\nG1 Z-10 F100\nG90"));
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
test("material and scan alignment samples record parameters without implicit firmware changes",()=>{
  const material=buildLaserCalibration({...config,kind:"material",min:10,max:30},cut);
  assert.match(material.code,/F600/);assert.match(material.code,/F2400/);
  assert.match(material.code,/S100/);assert.match(material.code,/S300/);
  const scan=buildLaserCalibration({...config,kind:"scan-offset"},cut);
  assert.equal((scan.code.match(/M4 S0/g)||[]).length,20);
  assert.match(scan.code,/G0 X40 Y40\.4/);
  assert.match(scan.code,/G1 X30 Y40\.4 S250/);
  assert.doesNotMatch(scan.code,/\$\d+=/);
});
