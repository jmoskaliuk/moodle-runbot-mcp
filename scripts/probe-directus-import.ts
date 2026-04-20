#!/usr/bin/env -S npx tsx

import { importPluginToDirectus } from "../src/services/directus-import.js";
import type { DetectedPlugin } from "../src/services/plugin-install.js";

function getArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function printUsage(): void {
  console.log(`Usage:
  npm run probe:directus-import -- [--write] [--component <frankenstyle>] [--type <type>] [--shortname <shortname>] [--git-url <url>] [--github-repo <owner/repo>] [--version-build <int>] [--release <string>] [--requires-build <int>] [--maturity <MATURITY_*|stable|beta|alpha|rc>]

Examples:
  npm run probe:directus-import --
  npm run probe:directus-import -- --component local_probeimport --shortname probeimport --github-repo owner/repo
  npm run probe:directus-import -- --write --component local_probeimport --shortname probeimport --git-url https://github.com/owner/repo --github-repo owner/repo
`);
}

function toInt(value: string | undefined, fallback: number | undefined): number | undefined {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDetectedPlugin(): DetectedPlugin {
  const component = getArg("--component") ?? "local_runbot_probeimport";
  const type = getArg("--type") ?? component.split("_")[0] ?? "local";
  const derivedShortname = component.split("_").slice(1).join("_");
  const shortname = getArg("--shortname") ?? (derivedShortname || "runbot_probeimport");
  const githubRepo = getArg("--github-repo") ?? "eledia/runbot-probeimport";
  const gitUrl = getArg("--git-url") ?? `https://github.com/${githubRepo}`;

  return {
    component,
    type,
    shortname,
    version: toInt(getArg("--version-build"), 2026042000) ?? 2026042000,
    release: getArg("--release") ?? "0.0.0-probe",
    requires: toInt(getArg("--requires-build"), 2024100700),
    maturity: getArg("--maturity") ?? "MATURITY_ALPHA",
    srcPath: `/opt/plugins/${githubRepo.split("/")[1] ?? shortname}`,
    detectedAt: new Date().toISOString(),
    gitUrl,
    githubRepo,
  };
}

async function main(): Promise<void> {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const write = hasFlag("--write");
  const detected = buildDetectedPlugin();
  const directusUrl = process.env.DIRECTUS_URL ?? "https://directus.eledia.ai";
  const tokenPresent = Boolean(process.env.DIRECTUS_IMPORT_TOKEN);

  console.log("Directus probeimport");
  console.log(`Mode: ${write ? "WRITE" : "CHECK-ONLY"}`);
  console.log(`Directus URL: ${directusUrl}`);
  console.log(`Token present: ${tokenPresent ? "yes" : "no"}`);
  console.log("Detected plugin payload:");
  console.log(JSON.stringify(detected, null, 2));

  if (!write) {
    console.log("");
    console.log("No write performed. Re-run with --write to call importPluginToDirectus() against Directus.");
    return;
  }

  if (!tokenPresent) {
    console.error("");
    console.error("DIRECTUS_IMPORT_TOKEN is not set. Cannot execute live probe import.");
    process.exitCode = 1;
    return;
  }

  const result = await importPluginToDirectus(detected);
  console.log("");
  console.log("Import result:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Probeimport failed:", error);
  process.exitCode = 1;
});
