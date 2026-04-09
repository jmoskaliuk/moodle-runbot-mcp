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
#   - /etc/moodle-runbot.env enthält MCP_API_KEY (falls gesetzt)
#   - python3 (für JSON-Parsing, statt jq)
#
# Commands:
#   list-instances                   → Alle laufenden Instanzen
#   list-snapshots                   → Alle vorhandenen Snapshots
#   create-snapshot <instance-id> <snapshot-id> <label> <description>
#                                    → Snapshot einer laufenden Instanz
#   stop-instance   <instance-id>    → Instanz stoppen + aufräumen
#
# Beispiele:
#   ./seed-snapshot.sh list-instances
#   ./seed-snapshot.sh create-snapshot pr-demo-abc123 leitnerflow-v1 \
#       "LeitnerFlow Demo" "Snapshot mit Beispielkurs und 15 Karten"

set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:3000}"
ENV_FILE="${ENV_FILE:-/etc/moodle-runbot.env}"

# ── API-Key aus systemd-Env laden ─────────────────────────────────────────────
if [[ -z "${MCP_API_KEY:-}" && -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  MCP_API_KEY=$(grep -E '^MCP_API_KEY=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' || true)
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

# ── Main ──────────────────────────────────────────────────────────────────────

case "${1:-}" in
  list-instances)    shift; cmd_list_instances "$@" ;;
  list-snapshots)    shift; cmd_list_snapshots "$@" ;;
  create-snapshot)   shift; cmd_create_snapshot "$@" ;;
  stop-instance)     shift; cmd_stop_instance "$@" ;;
  ""|help|-h|--help)
    grep -E '^#' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "Unbekannter Command: $1" >&2
    echo "Verfügbar: list-instances, list-snapshots, create-snapshot, stop-instance" >&2
    exit 2
    ;;
esac
