# Runbot — Developer Documentation

## Überblick

Dieses Dokument beschreibt interne Architektur-Entscheidungen, Service-Integrationen und
Betriebsdetails, die über die Nutzer-/Admin-Dokumentation hinausgehen.

---

## Directus SSOT Integration (task30)

### Zweck

Nach erfolgreichem Plugin-Detect durch den Plugin-Wizard (`clonePluginFromGithub`) wird
der erkannte `plugin_component`-Eintrag automatisch als Draft in den Directus SSOT
importiert. Das ermöglicht dem Catalog-Editor, das Plugin direkt in Directus zu
sichten und zu pflegen, ohne manuellen Daten-Import.

### Ablauf

```
Admin öffnet Plugin-Wizard
  └─▶ POST /admin/plugins/install (gitUrl)
        └─▶ clonePluginFromGithub(gitUrl)
              ├─▶ git clone → /opt/plugins/<repo>
              ├─▶ version.php parse → DetectedPlugin
              └─▶ importPluginToDirectus(detected)  ← fire-and-forget
                    ├─▶ GET /items/plugin_component?filter[component][_eq]=<frankenstyle>
                    │       existiert?  → Rückgabe existing id, kein POST
                    └─▶ POST /items/plugin_component { component, display_name, slug, status:"draft" }
```

### Service

**Datei:** `src/services/directus-import.ts`

Exportiert eine Funktion:

```typescript
importPluginToDirectus(detected: DetectedPlugin): Promise<DirectusImportResult>
```

**`DirectusImportResult`:**

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | `string` | Directus-ID des `plugin_component`-Eintrags (leer bei Fehler/Skip) |
| `created` | `boolean` | `true` = neuer Draft-Eintrag angelegt |
| `skipped` | `boolean?` | `true` = kein Token konfiguriert, Import übersprungen |

### Konfiguration

| Env-Variable | Default | Beschreibung |
|---|---|---|
| `DIRECTUS_IMPORT_TOKEN` | _(keiner)_ | Directus Service-Token mit `catalog_editor`-Rolle. **Pflicht** für aktiven Import. |
| `DIRECTUS_URL` | `https://directus.eledia.ai` | Basis-URL der Directus-Instanz. |

#### Token erstellen (Directus Admin UI)

1. Directus → Settings → Users → catalog_editor-Nutzer wählen
2. „Token" → neuen Token generieren
3. Token als `DIRECTUS_IMPORT_TOKEN` in der Runbot-`.env` eintragen

### Fehlerverhalten

- **Kein Token gesetzt:** Import wird lautlos übersprungen (nur WARN-Log).
- **Duplikat (`component` existiert bereits):** Kein zweiter POST — bestehende ID wird
  zurückgegeben, kein Error.
- **Netzwerkfehler / HTTP-Error:** Exception wird geloggt (`[directus-import] WARN: ...`),
  niemals weitergeworfen. Der Plugin-Wizard läuft erfolgreich weiter.

### Directus Collection `plugin_component`

Beim Draft-Import werden folgende Felder belegt:

| Feld | Wert | Notiz |
|------|------|-------|
| `component` | frankenstyle, z.B. `local_myplugin` | Primärschlüssel |
| `display_name` | = `component` | Admin befüllt manuell nach Import |
| `slug` | shortname als kebab-case, z.B. `my-plugin` | Aus shortname abgeleitet |
| `status` | `draft` | Admin publiziert nach Review |

---

## Plugin-Wizard Backend (task43d)

**Datei:** `src/services/plugin-install.ts`

### Funktionen

#### `clonePluginFromGithub(gitUrl: string): Promise<DetectedPlugin>`

Klont ein Moodle-Plugin-Repository nach `/opt/plugins/<repo>` und liest `version.php`.

- Nur HTTPS GitHub-URLs erlaubt (kein SSH, kein lokaler Pfad)
- Existierender Clone wird übersprungen (kein Auto-Pull — schützt laufende Demos)
- Nach erfolgreichem Parse: fire-and-forget `importPluginToDirectus` (task30)

**`DetectedPlugin`:**

```typescript
interface DetectedPlugin {
  component:   string;   // frankenstyle, z.B. "local_myplugin"
  type:        string;   // "local", "mod", "block", ...
  shortname:   string;   // "myplugin"
  version:     string;   // aus version.php
  release:     string;
  maturity?:   string;
  requires?:   string;
  srcPath:     string;   // absoluter Pfad zu /opt/plugins/<repo>
  detectedAt:  string;   // ISO-Timestamp
  gitUrl:      string;
  githubRepo:  string;   // "owner/repo"
}
```

#### `createConfig(config: DemoConfig): Promise<DemoConfig>`

Atomic-append in `configs.json` via tmp+rename. Wirft bei Duplikat-ID.

#### `listAllConfigsRaw(): Promise<DemoConfig[]>`

Alle Configs inklusive `visible: false` (für Admin-UI).

---

## Betrieb

### Logs

Alle Service-Logs schreiben auf **stderr** (`console.error`). Konvention:

```
[<service-name>] Beschreibung  →  Info
[<service-name>] WARN: ...     →  Warnung (kein Fatal)
```

### Plugin-Verzeichnis

Geklonte Plugins liegen unter `RUNBOT_WORK_DIR/plugins/` (default `/opt/runbot/plugins/`).
Der Pfad wird durch die Konstante `PLUGINS_DIR` in `plugin-install.ts` gesteuert.

### TypeScript Build

```bash
npm run build          # tsc → dist/
npm start              # node dist/index.js http
```

Der Build-Output liegt in `dist/` (`.gitignore`d). Für Änderungen am Quellcode:

```bash
npm run build && npm start
```
