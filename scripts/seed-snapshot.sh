#!/usr/bin/env bash
# scripts/seed-snapshot.sh
#
# Helper für den task19-Snapshot-Workflow.
# Ruft die MCP-Tools des laufenden Runbot-Servers über die korrekte
# JSON-RPC-Schnittstelle auf. Ersetzt die kaputten `curl … /mcp/call`-
# Beispiele aus dem alten Runbook.
#
# Voraussetzungen:
#   - Läuft auf dem VPS, auf dem moodle-runbot.service aktiv ist
#   - root (oder sudo) — wir lesen /proc/<pid>/environ des Servers
#   - python3 (für JSON-Parsing, statt jq)
#
# API-Key-Quelle:
#   Der MCP_API_KEY wird direkt aus der Laufzeit-Environment des
#   moodle-runbot-Prozesses gelesen (/proc/<pid>/environ). Das ist
#   die einzige zuverlässige Quelle — sie entspricht exakt dem, was
#   der Server gerade tatsächlich als Key akzeptiert, unabhängig von
#   Env-File-Format, Quoting, systemd-Override-Files, CR/LF, usw.
#   Fallback: MCP_API_KEY aus der Shell-Environment.
#
# Commands:
#   list-instances                   → Alle laufenden Instanzen
#   list-snapshots                   → Alle vorhandenen Snapshots
#   create-snapshot <instance-id> <snapshot-id> <label> <description>
#                                    → Snapshot einer laufenden Instanz
#   stop-instance   <instance-id>    → Instanz stoppen + aufräumen
#   doctor                           → Diagnose (Server erreichbar, Key gesetzt)
#
# Beispiele:
#   ./seed-snapshot.sh list-instances
#   ./seed-snapshot.sh create-snapshot pr-demo-abc123 leitnerflow-v1 \
#       "LeitnerFlow Demo" "Snapshot mit Beispielkurs und 15 Karten"

set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:3000}"
SERVICE_NAME="${SERVICE_NAME:-moodle-runbot}"

# ── API-Key aus dem laufenden Prozess lesen ───────────────────────────────────
#
# Rationale: Env-Files sind ein Minenfeld (Single/Double-Quotes, CR/LF,
# systemd-Overrides, Environment= vs. EnvironmentFile=, drop-ins in
# /etc/systemd/system/moodle-runbot.service.d/*.conf …). Wir umgehen das
# komplett, indem wir die Environment des laufenden Dienstes direkt aus
# /proc/<pid>/environ lesen — die kanonische Quelle. Wenn das scheitert
# (z.B. Script läuft ohne root), fallen wir auf die Shell-Env zurück.
#
load_api_key_from_proc() {
  local pid
  pid=$(systemctl show -p MainPID --value "$SERVICE_NAME" 2>/dev/null || true)
  if [[ -z "$pid" || "$pid" == "0" ]]; then
    return 1
  fi
  if [[ ! -r "/proc/$pid/environ" ]]; then
    echo "WARN: /proc/$pid/environ nicht lesbar — als root ausführen?" >&2
    return 1
  fi
  # environ ist NUL-separiert; pro Zeile ein KEY=VALUE
  local key
  key=$(tr '\0' '\n' < "/proc/$pid/environ" \
        | grep -E '^MCP_API_KEY=' \
        | head -1 \
        | cut -d= -f2-)
  if [[ -n "$key" ]]; then
    MCP_API_KEY="$key"
    return 0
  fi
  return 1
}

if [[ -z "${MCP_API_KEY:-}" ]]; then
  load_api_key_from_proc || true
fi

# ── MCP JSON-RPC-Request ──────────────────────────────────────────────────────
#
# Der Server nutzt StreamableHTTPServerTransport im stateless-Modus
# (sessionIdGenerator: undefined, enableJsonResponse: true). Das heißt:
# jeder POST ist eine eigenständige Session, wir brauchen kein initialize.
#
# Einziger Gotcha: der Transport verlangt Accept mit BEIDEN content types,
# sonst antwortet er mit "406 Not Acceptable".
#
mcp_call() {
  local tool="$1"; shift
  local args_json="$1"; shift

  local body
  body=$(python3 -c "
import json, sys
print(json.dumps({
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'tools/call',
    'params': {
        'name': '$tool',
        'arguments': json.loads('''$args_json''')
    }
}))
")

  local auth_header=()
  if [[ -n "${MCP_API_KEY:-}" ]]; then
    auth_header=(-H "x-api-key: $MCP_API_KEY")
  fi

  curl -sS -X POST "$SERVER_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    "${auth_header[@]}" \
    --data-raw "$body"
}

# ── Pretty-Print mit python3 statt jq ─────────────────────────────────────────
pretty() {
  python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.stdin.seek(0) if hasattr(sys.stdin, 'seek') else None
    sys.stdout.write(sys.stdin.read() if hasattr(sys.stdin, 'read') else '')
    sys.exit(0)
# Tools/call-Antworten haben result.content[0].text als JSON-String
try:
    inner = data['result']['content'][0]['text']
    parsed = json.loads(inner)
    print(json.dumps(parsed, indent=2, ensure_ascii=False))
except (KeyError, json.JSONDecodeError, TypeError):
    print(json.dumps(data, indent=2, ensure_ascii=False))
"
}

# ── Subcommands ───────────────────────────────────────────────────────────────

cmd_list_instances() {
  # Kein MCP-Tool für "alle Instanzen" → wir lesen direkt die Registry.
  local reg="${REGISTRY_FILE:-/opt/runbot/registry.json}"
  if [[ ! -f "$reg" ]]; then
    echo "registry.json nicht gefunden: $reg" >&2
    exit 1
  fi
  python3 -c "
import json
with open('$reg') as f:
    data = json.load(f)
insts = data.get('instances', {})
if not insts:
    print('(keine Instanzen)')
else:
    print(f'{\"ID\":<30} {\"Status\":<12} {\"Port\":<6} {\"URL\"}')
    print('-' * 100)
    for k, v in insts.items():
        print(f'{v.get(\"id\",\"?\"):<30} {v.get(\"status\",\"?\"):<12} {v.get(\"webPort\",\"?\"):<6} {v.get(\"url\",\"?\")}')
"
}

cmd_list_snapshots() {
  mcp_call snapshot_list '{}' | pretty
}

cmd_create_snapshot() {
  if [[ $# -lt 4 ]]; then
    echo "Usage: $0 create-snapshot <instance-id> <snapshot-id> <label> <description> [plugin-name ...]" >&2
    exit 2
  fi
  local instance_id="$1"; shift
  local snapshot_id="$1"; shift
  local label="$1"; shift
  local description="$1"; shift
  local plugins_json='[]'
  if [[ $# -gt 0 ]]; then
    plugins_json=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1:]))" "$@")
  fi

  local args
  args=$(python3 -c "
import json
print(json.dumps({
    'instanceId':  '$instance_id',
    'snapshotId':  '$snapshot_id',
    'label':       '$label',
    'description': '$description',
    'plugins':     json.loads('''$plugins_json''')
}))
")
  mcp_call snapshot_create "$args" | pretty
}

cmd_stop_instance() {
  if [[ $# -lt 1 ]]; then
    echo "Usage: $0 stop-instance <instance-id>" >&2
    exit 2
  fi
  local args="{\"instanceId\": \"$1\"}"
  mcp_call instance_stop "$args" | pretty
}

cmd_doctor() {
  echo "── Runbot seed-snapshot doctor ──"
  echo

  echo "[1/5] Service aktiv?"
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    local pid
    pid=$(systemctl show -p MainPID --value "$SERVICE_NAME" 2>/dev/null)
    echo "      OK — $SERVICE_NAME aktiv, PID=$pid"
  else
    echo "      FAIL — $SERVICE_NAME nicht aktiv. systemctl status $SERVICE_NAME"
    return 1
  fi
  echo

  echo "[2/5] /health erreichbar?"
  local health
  if health=$(curl -sSf "$SERVER_URL/health" 2>&1); then
    echo "      OK — $health"
  else
    echo "      FAIL — $health"
    return 1
  fi
  echo

  echo "[3/5] MCP_API_KEY geladen?"
  if [[ -n "${MCP_API_KEY:-}" ]]; then
    local key_len=${#MCP_API_KEY}
    local key_head=${MCP_API_KEY:0:4}
    local key_tail=${MCP_API_KEY: -4}
    # Nach Control-Chars suchen (CR, LF, tab, etc.) — häufige Stolperfalle
    local cleaned
    cleaned=$(printf '%s' "$MCP_API_KEY" | tr -d '[:cntrl:]')
    if [[ "$cleaned" != "$MCP_API_KEY" ]]; then
      echo "      WARN — Key enthält Control-Characters (CR/LF/Tab). Key-Länge=$key_len cleaned=${#cleaned}"
    else
      echo "      OK — Key geladen (Länge=$key_len, Preview=${key_head}…${key_tail})"
    fi
  else
    echo "      FAIL — MCP_API_KEY leer. Entweder Server läuft ohne Key (dev mode), oder /proc/<pid>/environ ist nicht lesbar."
    echo "      Diagnose: sudo tr '\\0' '\\n' < /proc/\$(systemctl show -p MainPID --value $SERVICE_NAME)/environ | grep MCP_API_KEY"
  fi
  echo

  echo "[4/5] /mcp JSON-RPC tools/list Round-Trip?"
  local list_body
  list_body='{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
  local auth_hdr=()
  if [[ -n "${MCP_API_KEY:-}" ]]; then
    auth_hdr=(-H "x-api-key: $MCP_API_KEY")
  fi
  local resp
  resp=$(curl -sS -X POST "$SERVER_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    "${auth_hdr[@]}" \
    --data-raw "$list_body" 2>&1 || true)
  local tool_count
  tool_count=$(printf '%s' "$resp" | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    tools = data.get('result', {}).get('tools', [])
    print(len(tools))
except Exception as e:
    print('ERR: ' + str(e))
" 2>&1 || echo "parse-err")
  if [[ "$tool_count" =~ ^[0-9]+$ ]] && (( tool_count > 0 )); then
    echo "      OK — $tool_count MCP-Tools verfügbar"
  else
    echo "      FAIL — Response: $(printf '%s' "$resp" | head -c 300)"
    return 1
  fi
  echo

  echo "[5/5] Registry vorhanden?"
  local reg="${REGISTRY_FILE:-/opt/runbot/registry.json}"
  if [[ -f "$reg" ]]; then
    echo "      OK — $reg"
  else
    echo "      WARN — $reg fehlt (nur relevant wenn Instanzen laufen sollen)"
  fi
  echo
  echo "── alles OK ──"
}

# ── Main ──────────────────────────────────────────────────────────────────────

case "${1:-}" in
  list-instances)    shift; cmd_list_instances "$@" ;;
  list-snapshots)    shift; cmd_list_snapshots "$@" ;;
  create-snapshot)   shift; cmd_create_snapshot "$@" ;;
  stop-instance)     shift; cmd_stop_instance "$@" ;;
  doctor)            shift; cmd_doctor "$@" ;;
  ""|help|-h|--help)
    grep -E '^#' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "Unbekannter Command: $1" >&2
    echo "Verfügbar: list-instances, list-snapshots, create-snapshot, stop-instance, doctor" >&2
    exit 2
    ;;
esac
