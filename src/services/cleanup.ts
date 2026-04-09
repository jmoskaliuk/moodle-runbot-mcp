// src/services/cleanup.ts
// Läuft alle 60 Sekunden und stoppt Instanzen die:
//   a) älter als MAX_AGE_MS sind (Standard: 60 Min)
//   b) länger als INACTIVITY_MS keine Aktivität hatten (Standard: 15 Min)

import { getAllInstances, saveInstance, deleteInstance } from './registry.js';
import { stopContainers, cleanupInstanceDir } from './docker.js';
import { unregisterInstance } from './nginx.js';
import type { MoodleInstance } from '../types.js';

const MAX_AGE_MS      = parseInt(process.env.DEMO_MAX_AGE_MINUTES    ?? '60')  * 60 * 1000;
const INACTIVITY_MS   = parseInt(process.env.DEMO_INACTIVITY_MINUTES ?? '15')  * 60 * 1000;
const POLL_INTERVAL   = parseInt(process.env.CLEANUP_INTERVAL_SECONDS ?? '60') * 1000;

export function startCleanupScheduler(): void {
  console.error(
    `[cleanup] Scheduler started — maxAge=${MAX_AGE_MS/60000}min, ` +
    `inactivity=${INACTIVITY_MS/60000}min, poll=${POLL_INTERVAL/1000}s`
  );
  setInterval(runCleanup, POLL_INTERVAL);
  // Also run immediately on startup
  runCleanup();
}

async function runCleanup(): Promise<void> {
  const now = Date.now();
  let instances: MoodleInstance[];

  try {
    instances = await getAllInstances();
  } catch {
    return; // Registry not yet initialized
  }

  for (const inst of instances) {
    if (inst.status === 'stopping' || inst.status === 'stopped') continue;

    const age        = now - new Date(inst.createdAt).getTime();
    const inactive   = now - new Date(inst.lastActivity).getTime();
    const tooOld     = age      > MAX_AGE_MS;
    const tooIdle    = inactive > INACTIVITY_MS && inst.status === 'running';

    if (tooOld || tooIdle) {
      const reason = tooOld
        ? `max age reached (${Math.round(age/60000)} min)`
        : `inactivity timeout (${Math.round(inactive/60000)} min idle)`;

      console.error(`[cleanup] Stopping ${inst.id} — ${reason}`);

      try {
        inst.status = 'stopping';
        await saveInstance(inst);
        await unregisterInstance(inst.id);
        await stopContainers(inst);
        await cleanupInstanceDir(inst);
        await deleteInstance(inst.id);
        console.error(`[cleanup] ✓ ${inst.id} removed`);
      } catch (e) {
        console.error(`[cleanup] ✗ Failed to stop ${inst.id}:`, e);
        // Mark as error so it shows in UI
        inst.status = 'error';
        inst.error  = `Cleanup failed: ${String(e)}`;
        await saveInstance(inst);
      }
    }
  }
}

// Call this whenever a user makes an HTTP request to their demo instance.
// (Webhook from nginx or the demo itself hitting our /ping endpoint)
export async function recordActivity(instanceId: string): Promise<void> {
  const { getInstance, saveInstance } = await import('./registry.js');
  const inst = await getInstance(instanceId);
  if (!inst) return;
  inst.lastActivity = new Date().toISOString();
  await saveInstance(inst);
}
