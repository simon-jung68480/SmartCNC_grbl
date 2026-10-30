import assert from "node:assert/strict";
import test from "node:test";
import { GrblController } from "../server/grblController";
import { generateVectorGCode } from "../src/utils/laserCam";
import type { JobStatus } from "../src/types/cnc";

test("simulateur GRBL : gravure hors focus et retour Z, laser éteint à la fin", async () => {
  const controller = new GrblController();
  try {
    await controller.connect("SIMULATOR");
    assert.equal(controller.getStatus().isSimulator, true);
    const code = generateVectorGCode(
      [
        {
          points: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 2, y: 2 },
          ],
        },
      ],
      {
        feed: 10000,
        power: 20,
        maxPower: 1000,
        passes: 1,
        mode: "M4",
        focus: {
          enabled: true,
          spotDiameter: 1,
          offset: 0.2,
          controlZ: true,
          referenceZ: 0,
          zFeed: 1000,
          restoreZ: true,
        },
      },
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Le programme simulé ne se termine pas")),
        8000,
      );
      const onJob = (job: JobStatus) => {
        if (job.state === "completed") {
          clearTimeout(timer);
          controller.off("job", onJob);
          resolve();
        } else if (job.state === "error") {
          clearTimeout(timer);
          controller.off("job", onJob);
          reject(new Error("Erreur de streaming"));
        }
      };
      controller.on("job", onJob);
      controller.startJob("focus-test.nc", code, false);
    });
    const status = controller.getStatus();
    assert.equal(status.wpos.x, 2);
    assert.equal(status.wpos.y, 2);
    assert.equal(status.wpos.z, 0);
    assert.equal(status.spindleSpeed, 0);
    assert.equal(status.accessories.spindleCw, false);
    assert.equal(status.accessories.spindleCcw, false);
  } finally {
    await controller.disconnect();
  }
});
