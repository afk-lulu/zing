#!/usr/bin/env bash
#
# Runs the Zing backend and app together for local development.
# macOS / Linux counterpart of scripts/dev.ps1 - same flags, same behaviour.
#
# Starts `api` (Next.js, port 3000) in the background with its output in a log
# file, and `mobile` (Expo) in this terminal, so Expo keeps the interactive TTY
# its keyboard menu needs.
#
# The phone cannot reach `localhost`, so the app is pointed at this machine's
# LAN address instead. That address is not stable - it changes when you move
# networks - so the script re-detects it every run and rewrites the one line in
# `mobile/.env` when it has drifted. Everything else in that file is preserved.
#
# Written for bash. zsh is macOS's login shell but this is not sourced, so the
# shebang decides: run it as `./scripts/dev.sh` or `bash scripts/dev.sh`.
#
#   ./scripts/dev.sh --mock
#   ./scripts/dev.sh --chaos --clear

set -uo pipefail

MOCK=0
CHAOS=0
TUNNEL=0
API_ONLY=0
CLEAR=0
CHECK_ONLY=0

usage() {
    cat <<'EOF'
usage: dev.sh [options]

  --mock        Run the API with ZING_MOCK=1: no keys, no spend, canned agent
                responses.
  --chaos       Run the API with ZING_MOCK=chaos: same, plus the four deliberate
                failures that exercise the drop-and-degrade paths. A healthy
                chaos batch is 3 groups.
  --tunnel      Start Expo with --tunnel (for cellular or hostile venue Wi-Fi).
                Note this tunnels Metro only, NOT the API - with a LAN API URL
                the phone still has to be on the same network. For a real tunnel
                demo, point the app at the Vercel URL.
  --api-only    Start only the backend, in this terminal.
  --clear       Pass --clear to Expo, forcing a Metro cache reset.
  --check-only  Run the preflight, detect the LAN address and sync mobile/.env,
                then stop without starting anything. Useful after moving
                networks.
  -h, --help    This text.
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --mock)       MOCK=1 ;;
        --chaos)      CHAOS=1 ;;
        --tunnel)     TUNNEL=1 ;;
        --api-only)   API_ONLY=1 ;;
        --clear)      CLEAR=1 ;;
        --check-only) CHECK_ONLY=1 ;;
        -h|--help)    usage; exit 0 ;;
        *)            echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(dirname "$SCRIPT_DIR")
API_DIR="$REPO_ROOT/api"
MOBILE_DIR="$REPO_ROOT/mobile"
MOBILE_ENV="$MOBILE_DIR/.env"
API_PORT=3000

if [ "$MOCK" -eq 1 ] && [ "$CHAOS" -eq 1 ]; then
    echo 'Use --mock or --chaos, not both.' >&2
    exit 2
fi

MOCK_MODE=''
[ "$MOCK" -eq 1 ] && MOCK_MODE='1'
[ "$CHAOS" -eq 1 ] && MOCK_MODE='chaos'

# Colour only when this is a terminal, so redirected output stays clean.
if [ -t 1 ]; then
    C_CYAN=$'\033[36m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
    C_GREEN=$'\033[32m'; C_OFF=$'\033[0m'
else
    C_CYAN=''; C_YELLOW=''; C_RED=''; C_GREEN=''; C_OFF=''
fi

step() { printf '  %s%s%s\n' "$C_CYAN" "$1" "$C_OFF"; }
warn() { printf '  %s! %s%s\n' "$C_YELLOW" "$1" "$C_OFF"; }
bad()  { printf '  %sx %s%s\n' "$C_RED" "$1" "$C_OFF" >&2; }

# --- Preflight ---------------------------------------------------------------

for dir in "$API_DIR" "$MOBILE_DIR"; do
    if [ ! -d "$dir/node_modules" ]; then
        bad "$dir has no node_modules. Run: cd $dir && npm install"
        exit 1
    fi
done

# lsof ships with macOS; ss is the modern Linux answer. Either gives us the PID
# holding the port, which is what both the guard and the cleanup need.
port_pids() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null
    elif command -v ss >/dev/null 2>&1; then
        ss -ltnpH "sport = :$1" 2>/dev/null |
            grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
    fi
    return 0
}

# A stale server on 3000 is the nastiest failure here: the smoke script has no
# idea which server answered, so an old process gives you a green run in the
# wrong mode. Refuse to start rather than silently reuse it.
OCCUPIED=$(port_pids "$API_PORT")
if [ -n "$OCCUPIED" ]; then
    OWNER_PID=$(printf '%s\n' "$OCCUPIED" | head -1)
    OWNER_NAME=$(ps -p "$OWNER_PID" -o comm= 2>/dev/null | sed 's/^ *//')
    if [ "$CHECK_ONLY" -eq 1 ]; then
        warn "Port $API_PORT is in use by PID $OWNER_PID (${OWNER_NAME:-unknown}) - a dev server is already running."
    else
        bad "Port $API_PORT is already in use by PID $OWNER_PID (${OWNER_NAME:-unknown})."
        echo "    That is probably an old dev server. It would answer requests in"
        echo "    whatever mode it was started with, so this run would prove nothing."
        echo "    Free it with:  kill -9 $OWNER_PID"
        exit 1
    fi
fi

# --- LAN address -------------------------------------------------------------

# Pick the IPv4 address on the interface that actually carries the default
# route, so a VPN or a docker bridge does not win over Wi-Fi.
lan_address() {
    local iface addr
    case "$(uname -s)" in
        Darwin)
            iface=$(route -n get default 2>/dev/null | awk '/interface:/ { print $2; exit }')
            if [ -n "$iface" ]; then
                # Empty for a VPN utun default route - fall through to the scan.
                addr=$(ipconfig getifaddr "$iface" 2>/dev/null)
                [ -n "$addr" ] && { printf '%s' "$addr"; return 0; }
            fi
            addr=$(ifconfig 2>/dev/null | awk '/inet /{ print $2 }' |
                grep -v '^127\.' | grep -v '^169\.254\.' | head -1)
            ;;
        *)
            addr=$(ip -4 route get 1.1.1.1 2>/dev/null |
                awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }')
            if [ -z "$addr" ]; then
                addr=$(hostname -I 2>/dev/null | tr ' ' '\n' |
                    grep -v '^127\.' | grep -v '^169\.254\.' | head -1)
            fi
            ;;
    esac
    [ -n "$addr" ] && printf '%s' "$addr"
    return 0
}

LAN=$(lan_address)
if [ -z "$LAN" ]; then
    bad 'No usable IPv4 address found. Are you connected to a network?'
    exit 1
fi
API_URL="http://${LAN}:${API_PORT}"

# --- Point the app at it -----------------------------------------------------

# Rewrite only the active EXPO_PUBLIC_ZING_API_URL line. Comments, the commented
# Vercel URL, and anything else in the file survive untouched.
ENV_CHANGED=0
sync_mobile_env() {
    local url=$1
    local line="EXPO_PUBLIC_ZING_API_URL=$url"
    local example="$MOBILE_DIR/.env.example"
    local current='' found=0 tmp l

    if [ ! -f "$MOBILE_ENV" ]; then
        if [ -f "$example" ]; then
            cp "$example" "$MOBILE_ENV"
        else
            printf '%s\n' "$line" > "$MOBILE_ENV"
            ENV_CHANGED=1
            return 0
        fi
    fi

    tmp=$(mktemp "${TMPDIR:-/tmp}/zing-env.XXXXXX")
    # `|| [ -n "$l" ]` so a final line with no trailing newline is not dropped.
    while IFS= read -r l || [ -n "$l" ]; do
        if [[ $l =~ ^[[:space:]]*EXPO_PUBLIC_ZING_API_URL[[:space:]]*= ]]; then
            found=1
            current=${l#*=}
            # Trim surrounding whitespace, the only thing that would make an
            # otherwise identical URL look changed.
            current=$(printf '%s' "$current" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
            printf '%s\n' "$line" >> "$tmp"
        else
            printf '%s\n' "$l" >> "$tmp"
        fi
    done < "$MOBILE_ENV"
    [ "$found" -eq 0 ] && printf '%s\n' "$line" >> "$tmp"

    if [ "$current" = "$url" ]; then
        rm -f "$tmp"
        return 0
    fi

    # cat rather than mv: mv from $TMPDIR can cross filesystems and would take
    # the temp file's permissions with it.
    cat "$tmp" > "$MOBILE_ENV"
    rm -f "$tmp"
    ENV_CHANGED=1
    return 0
}

if [ "$API_ONLY" -eq 0 ]; then
    sync_mobile_env "$API_URL"
fi

# --- Banner ------------------------------------------------------------------

MODE_LABEL='real keys (this run costs money)'
[ "$MOCK_MODE" = '1' ] && MODE_LABEL='ZING_MOCK=1 - canned, no spend'
[ "$MOCK_MODE" = 'chaos' ] && MODE_LABEL='ZING_MOCK=chaos - failures injected, expect 3 groups'

echo
printf '  %szing dev%s\n' "$C_GREEN" "$C_OFF"
echo "  mode     $MODE_LABEL"
echo "  api      $API_URL"
if [ "$API_ONLY" -eq 0 ]; then
    if [ "$ENV_CHANGED" -eq 1 ]; then
        printf '  app      %smobile/.env updated to %s%s\n' "$C_YELLOW" "$API_URL" "$C_OFF"
    else
        echo "  app      mobile/.env already correct"
    fi
fi
echo

if [ "$CHECK_ONLY" -eq 1 ]; then
    step 'Check only - nothing started.'
    exit 0
fi

# --- Start the API -----------------------------------------------------------

[ -n "$MOCK_MODE" ] && export ZING_MOCK="$MOCK_MODE"

if [ "$API_ONLY" -eq 1 ]; then
    step 'Starting API in this terminal. Ctrl-C to stop.'
    echo
    cd "$API_DIR" || exit 1
    exec npm run dev
fi

# Expo owns this terminal, so the API's output goes to a log rather than
# interleaving with Metro's and scrambling its keyboard menu.
API_LOG=$(mktemp "${TMPDIR:-/tmp}/zing-api.XXXXXX.log")
API_PID=''
CLEANED=0

cleanup() {
    [ "$CLEANED" -eq 1 ] && return 0
    CLEANED=1
    echo
    step 'Shutting down the API...'
    # npm spawns next as a child, so killing npm alone orphans the listener and
    # the next run trips the port-in-use guard. Kill whoever holds the port.
    local listeners listener_pid
    listeners=$(port_pids "$API_PORT")
    for listener_pid in $listeners; do
        kill -9 "$listener_pid" 2>/dev/null
    done
    if [ -n "$API_PID" ]; then
        kill -9 "$API_PID" 2>/dev/null
        wait "$API_PID" 2>/dev/null
    fi
    step "Done. API log: $API_LOG"
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

step 'Starting API in the background...'
( cd "$API_DIR" && exec npm run dev ) > "$API_LOG" 2>&1 &
API_PID=$!

# --- Wait for it, and prove the phone can reach it ---------------------------

READY=0
i=0
while [ "$i" -lt 60 ]; do
    sleep 0.5
    if ! kill -0 "$API_PID" 2>/dev/null; then
        bad 'The API exited. Its last output:'
        echo
        tail -20 "$API_LOG"
        exit 1
    fi
    if curl -fsS -m 3 "http://localhost:$API_PORT/api/fallback" >/dev/null 2>&1; then
        READY=1
        break
    fi
    i=$((i + 1))
done

if [ "$READY" -eq 0 ]; then
    warn "API did not answer on localhost:$API_PORT within 30s. Continuing anyway."
    warn "Its output so far is in $API_LOG"
else
    step "API ready on localhost:$API_PORT (log: $API_LOG)"

    # localhost working but the LAN address not is the firewall signature, and
    # it presents on the phone as a generic network error.
    if curl -fsS -m 5 "$API_URL/api/fallback" >/dev/null 2>&1; then
        step "Reachable on $API_URL - the phone can see it"
    else
        warn "$API_URL is NOT reachable even though localhost is."
        echo '    The phone will fail every stage and the app will silently show'
        echo '    the bundled fallback batch.'
        if [ "$(uname -s)" = 'Darwin' ]; then
            echo '    On macOS this is usually the application firewall: System Settings'
            echo '    -> Network -> Firewall -> Options, and allow incoming connections'
            echo '    for node. It also prompts on the first run - if you clicked Deny,'
            echo '    that choice is sticky.'
        else
            echo '    Check the host firewall allows inbound TCP on this port, e.g.:'
            echo ''
            echo "      sudo ufw allow $API_PORT/tcp"
        fi
        echo ''
    fi
fi

# --- Start Expo in this terminal ---------------------------------------------

EXPO_ARGS=(expo start)
[ "$TUNNEL" -eq 1 ] && EXPO_ARGS+=(--tunnel)
# Metro bakes EXPO_PUBLIC_* in at bundle time, so a changed URL needs a reset.
if [ "$CLEAR" -eq 1 ] || [ "$ENV_CHANGED" -eq 1 ]; then
    EXPO_ARGS+=(--clear)
fi

if [ "$TUNNEL" -eq 1 ]; then
    warn '--tunnel tunnels Metro, not the API. The phone still needs LAN access'
    warn 'to the API URL above, or point mobile/.env at the Vercel deployment.'
fi

step 'Starting Expo here. Ctrl-C stops both.'
echo

cd "$MOBILE_DIR" || exit 1
npx "${EXPO_ARGS[@]}"
