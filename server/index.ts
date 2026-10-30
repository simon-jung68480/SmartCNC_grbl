import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { GrblController } from './grblController';
import type { ProbeConfig, HeightmapGrid } from '../src/types/cnc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function getLocalNetworkInfo(port: number): {
  hostname: string;
  port: number;
  ips: string[];
  urls: string[];
  primaryUrl: string;
} {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  const urls = ips.map((ip) => `http://${ip}:${port}`);
  const primaryUrl = urls[0] || `http://localhost:${port}`;

  return {
    hostname: os.hostname(),
    port,
    ips,
    urls,
    primaryUrl
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 50 * 1024 * 1024 // 50 MB for large G-Code files
  });

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const controller = new GrblController();

  // ============================================================================
  // REST API ENDPOINTS
  // ============================================================================

  app.get('/api/ports', async (_req, res) => {
    try {
      const ports = await controller.listPorts();
      res.json(ports);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/network-info', (_req, res) => {
    res.json(getLocalNetworkInfo(PORT));
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      status: controller.getStatus(),
      job: controller.getJobStatus(),
      settings: controller.getSettingsList(),
      heightmap: controller.getHeightmap(),
      network: getLocalNetworkInfo(PORT)
    });
  });

  // ============================================================================
  // CONTROLLER -> SOCKET.IO BROADCASTS
  // ============================================================================

  controller.on('status', (status) => {
    io.emit('cnc:status', status);
  });

  controller.on('console', (entry) => {
    io.emit('cnc:console', entry);
  });

  controller.on('settings', (settings) => {
    io.emit('cnc:settings', settings);
  });

  controller.on('job', (job) => {
    io.emit('cnc:job', job);
  });

  controller.on('heightmap', (grid) => {
    io.emit('cnc:heightmap', grid);
  });

  controller.on('probeResult', (result) => {
    io.emit('cnc:probe:result', result);
  });

  // ============================================================================
  // SOCKET.IO CLIENT HANDLERS
  // ============================================================================

  io.on('connection', async (socket) => {
    // Send initial state immediately upon connection
    socket.emit('cnc:status', controller.getStatus());
    socket.emit('cnc:job', controller.getJobStatus());
    socket.emit('cnc:settings', controller.getSettingsList());
    const hm = controller.getHeightmap();
    if (hm) {
      socket.emit('cnc:heightmap', hm);
    }

    const ports = await controller.listPorts();
    socket.emit('cnc:ports', ports);

    socket.on('cnc:ports:list', async (cb?: (ports: unknown) => void) => {
      const list = await controller.listPorts();
      socket.emit('cnc:ports', list);
      if (typeof cb === 'function') cb(list);
    });

    socket.on(
      'cnc:connect',
      async (
        payload: { path?: string; portPath?: string; baudRate?: number } | string,
        cb?: (res: { ok: boolean; error?: string }) => void
      ) => {
        try {
          const portPath =
            typeof payload === 'string'
              ? payload
              : payload?.portPath || payload?.path || 'SIMULATOR';
          const baudRate =
            typeof payload === 'object' && payload?.baudRate ? Number(payload.baudRate) : 115200;

          await controller.connect(portPath, baudRate);
          if (typeof cb === 'function') cb({ ok: true });
        } catch (err) {
          if (typeof cb === 'function') cb({ ok: false, error: (err as Error).message });
        }
      }
    );

    socket.on('cnc:disconnect', async (cb?: (res: { ok: boolean }) => void) => {
      await controller.disconnect();
      if (typeof cb === 'function') cb({ ok: true });
    });

    socket.on('cnc:command', (payload: string | { command?: string; cmd?: string }) => {
      const cmd = typeof payload === 'string' ? payload : payload?.command || payload?.cmd || '';
      if (cmd) {
        controller.sendCommand(cmd);
      }
    });

    socket.on('cnc:realtime', (payload: string | number | { char?: string; byte?: number }) => {
      if (typeof payload === 'string' || typeof payload === 'number') {
        controller.sendRealtime(payload);
      } else if (payload?.byte !== undefined) {
        controller.sendRealtime(payload.byte);
      } else if (payload?.char !== undefined) {
        controller.sendRealtime(payload.char);
      }
    });

    socket.on(
      'cnc:jog',
      (payload: {
        x?: number;
        y?: number;
        z?: number;
        feedRate?: number;
        distanceMode?: 'G90' | 'G91';
        axis?: 'X' | 'Y' | 'Z';
        step?: number;
      }) => {
        if (!payload) return;
        if (payload.axis && typeof payload.step === 'number') {
          controller.jog({
            x: payload.axis === 'X' ? payload.step : undefined,
            y: payload.axis === 'Y' ? payload.step : undefined,
            z: payload.axis === 'Z' ? payload.step : undefined,
            feedRate: payload.feedRate || 1000,
            distanceMode: payload.distanceMode || 'G91'
          });
        } else {
          controller.jog({
            x: payload.x,
            y: payload.y,
            z: payload.z,
            feedRate: payload.feedRate || 1000,
            distanceMode: payload.distanceMode || 'G91'
          });
        }
      }
    );

    socket.on('cnc:jogCancel', () => {
      controller.jogCancel();
    });

    socket.on(
      'cnc:zero',
      (
        payload:
          | 'X'
          | 'Y'
          | 'Z'
          | 'XY'
          | 'ALL'
          | ('X' | 'Y' | 'Z' | 'XY' | 'ALL')[]
          | { axis?: 'X' | 'Y' | 'Z' | 'XY' | 'ALL'; axes?: ('X' | 'Y' | 'Z' | 'XY' | 'ALL')[] }
      ) => {
        if (typeof payload === 'string' || Array.isArray(payload)) {
          controller.zeroAxes(payload);
        } else if (payload?.axes) {
          controller.zeroAxes(payload.axes);
        } else if (payload?.axis) {
          controller.zeroAxes(payload.axis);
        } else {
          controller.zeroAxes('ALL');
        }
      }
    );

    socket.on('cnc:setMachineZero', () => {
      controller.setMachineZero();
    });

    socket.on(
      'cnc:goto',
      (payload: {
        x?: number;
        y?: number;
        z?: number;
        isMachineCoords?: boolean;
        safeZFirst?: boolean;
      }) => {
        if (payload) {
          controller.gotoPosition(payload);
        }
      }
    );

    socket.on('cnc:home', () => {
      controller.home();
    });

    socket.on('cnc:unlock', () => {
      controller.unlock();
    });

    socket.on('cnc:reset', () => {
      controller.softReset();
    });

    socket.on(
      'cnc:override',
      (payload: {
        type: 'feed' | 'rapid' | 'spindle' | 'spindleToggle' | 'floodToggle' | 'mistToggle';
        action: 'reset' | 'plus10' | 'minus10' | 'plus1' | 'minus1' | '100' | '50' | '25' | 'toggle';
        byte?: number;
      }) => {
        if (payload?.byte !== undefined) {
          controller.sendRealtime(payload.byte);
        } else if (payload?.type && payload?.action) {
          controller.setOverride(payload.type, payload.action);
        }
      }
    );

    socket.on('cnc:settings:get', () => {
      controller.requestSettings();
    });

    socket.on(
      'cnc:settings:set',
      (
        payload:
          | { id?: number; value?: number; settings?: { id: number; value: number }[] }
          | { id: number; value: number }[]
      ) => {
        if (Array.isArray(payload)) {
          for (const item of payload) {
            controller.updateSetting(Number(item.id), Number(item.value));
          }
        } else if (payload?.settings && Array.isArray(payload.settings)) {
          for (const item of payload.settings) {
            controller.updateSetting(Number(item.id), Number(item.value));
          }
        } else if (payload && typeof payload.id === 'number' && typeof payload.value === 'number') {
          controller.updateSetting(payload.id, payload.value);
        }
      }
    );

    socket.on(
      'cnc:job:start',
      (payload: {
        fileName?: string;
        lines?: string[];
        gcode?: string;
        applyHeightmap?: boolean;
      }) => {
        if (!payload) return;
        const content = payload.lines || payload.gcode || '';
        controller.startJob(
          payload.fileName || 'programme.nc',
          content,
          Boolean(payload.applyHeightmap)
        );
      }
    );

    socket.on('cnc:laser:simulate', async (
      payload: { fileName: string; gcode: string; maxPower?: number },
      cb?: (result: { ok: boolean; error?: string }) => void,
    ) => {
      try {
        await controller.simulateLaserJob(payload.fileName, payload.gcode, payload.maxPower);
        cb?.({ ok: true });
      } catch (error) {
        cb?.({ ok: false, error: error instanceof Error ? error.message : 'Simulation impossible.' });
      }
    });

    socket.on('cnc:job:pause', () => {
      controller.pauseJob();
    });

    socket.on('cnc:job:resume', () => {
      controller.resumeJob();
    });

    socket.on('cnc:job:stop', () => {
      controller.stopJob();
    });

    socket.on('cnc:probe:run', async (config: ProbeConfig, cb?: (res: unknown) => void) => {
      const result = await controller.runProbe(config);
      if (typeof cb === 'function') cb(result);
    });

    socket.on('cnc:heightmap:scan', async (grid: HeightmapGrid, cb?: (res: unknown) => void) => {
      const result = await controller.scanHeightmap(grid);
      if (typeof cb === 'function') cb(result);
    });

    socket.on('cnc:heightmap:stop', () => {
      controller.stopHeightmapScan();
    });

    socket.on('cnc:heightmap:set', (grid: HeightmapGrid | null) => {
      controller.setHeightmap(grid);
    });
  });

  // ============================================================================
  // VITE DEV MIDDLEWARE OR PRODUCTION STATIC ASSETS
  // ============================================================================

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.SMARTCNC_DIST_PATH || path.resolve(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, () => {
    if (process.send) process.send({ type: 'ready' });
    const netInfo = getLocalNetworkInfo(PORT);
    console.log(`\n============================================================`);
    console.log(`  SmartCNC Server (GRBL 1.1 / Arduino Uno + CNC Shield V3.0)`);
    console.log(`  Local:   http://localhost:${PORT}`);
    for (const url of netInfo.urls) {
      console.log(`  Réseau:  ${url} (Tablette / Mobile)`);
    }
    console.log(`============================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
