// src/services/registry.ts
// Simple file-based registry to persist instance state across MCP calls.

import fs from "fs/promises";
import path from "path";
import type { MoodleInstance, TestRun } from "../types.js";

const REGISTRY_FILE = process.env.REGISTRY_FILE ?? "/opt/runbot/registry.json";

interface Registry {
  instances: Record<string, MoodleInstance>;
  testRuns: Record<string, TestRun>;
}

async function load(): Promise<Registry> {
  try {
    const raw = await fs.readFile(REGISTRY_FILE, "utf-8");
    return JSON.parse(raw) as Registry;
  } catch {
    return { instances: {}, testRuns: {} };
  }
}

async function save(registry: Registry): Promise<void> {
  await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");
}

// ── Instances ─────────────────────────────────────────────────────────────────

export async function getAllInstances(): Promise<MoodleInstance[]> {
  const r = await load();
  return Object.values(r.instances);
}

export async function getInstance(id: string): Promise<MoodleInstance | undefined> {
  const r = await load();
  return r.instances[id];
}

export async function saveInstance(instance: MoodleInstance): Promise<void> {
  const r = await load();
  r.instances[instance.id] = instance;
  await save(r);
}

export async function deleteInstance(id: string): Promise<void> {
  const r = await load();
  delete r.instances[id];
  await save(r);
}

// ── Test Runs ─────────────────────────────────────────────────────────────────

export async function saveTestRun(run: TestRun): Promise<void> {
  const r = await load();
  r.testRuns[run.id] = run;
  await save(r);
}

export async function getTestRun(id: string): Promise<TestRun | undefined> {
  const r = await load();
  return r.testRuns[id];
}

export async function getTestRunsForInstance(instanceId: string): Promise<TestRun[]> {
  const r = await load();
  return Object.values(r.testRuns).filter((t) => t.instanceId === instanceId);
}

// ── Port management ───────────────────────────────────────────────────────────

export async function allocatePort(start: number, end: number): Promise<number> {
  const r = await load();
  const usedPorts = new Set(
    Object.values(r.instances).map((i) => i.webPort)
  );
  for (let port = start; port <= end; port++) {
    if (!usedPorts.has(port)) return port;
  }
  throw new Error(`No free ports available in range ${start}–${end}`);
}
