#!/bin/bash
# The machine's locks for the native tools (plan 13-tests-release.md 2.2, T14; 20-order.md 1.5). Source it from a bash
# script and take what the run needs, in the script's own shell (never inside $(...): a subshell would free it at once):
#
#   . tests/tools/simlock.sh
#   simlock native-shell          # the paired iPhone + Watch simulators: ~/Library/Caches/FPKit/sim.lock
#   fp_slot "$FP_LOCKS_ROOT/build.slot" 2 fp-build      # one of two build slots (build.slot.1, build.slot.2)
#   fp_lock <dir> <tool> [what]   # any other lock directory
#
#   bash tests/tools/simlock.sh --self-test              # every rule below, on scratch locks in a temporary folder
#
# A lock is a directory: whoever makes it holds it, and an EXIT trap frees what this shell took (INT, TERM and HUP
# exit, so the trap runs; a script that sets its own EXIT trap calls fp_unlock_all in it). Inside it, `owner` holds
# "<pid> <start, epoch seconds> <worktree> <tool>", and `pid`, `at` and `who` the same for the session's fplock helper
# (native-m2/bin/fplock.sh), which shares these directories: each reads the other's holder.
#
# A waiter breaks a lock, and says whose, when its pid is gone, when that pid is another process now (one that started
# after the lock was taken), or when the lock is older than 2 hours (a bare mkdir with no pid inside counts from the
# folder's time). A lock held by this shell or one of its ancestors (an agent's `fplock sim.lock` around the tool, a
# tool calling another) is taken as held: no wait, and it is left for its holder to free.
#
# Overrides, for the self-test: FP_LOCKS_ROOT (default ~/Library/Caches/FPKit), FP_SIM_LOCK (default
# $FP_LOCKS_ROOT/sim.lock), FP_LOCK_MAX_AGE (seconds, default 7200), FP_LOCK_POLL (seconds, default 5).

FP_LOCKS_ROOT=${FP_LOCKS_ROOT:-$HOME/Library/Caches/FPKit}
SIMLOCK=${FP_SIM_LOCK:-$FP_LOCKS_ROOT/sim.lock}
FP_LOCK_MAX_AGE=${FP_LOCK_MAX_AGE:-7200}
FP_LOCK_POLL=${FP_LOCK_POLL:-5}
FP_LOCKS_TAKEN=""

# The checkout's name for the tools' folders: "main" for the main checkout, else the worktree's folder name (the
# ios/App/FPKit/.build link's name, ~/Library/Caches/FPKit/<name>).
fp_tree_name() {
  local top gd cd
  top=$(git rev-parse --show-toplevel 2>/dev/null) || { basename "$PWD" | tr ' ' '-'; return 0; }
  gd=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P || true)
  cd=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P || true)
  if [ -n "$gd" ] && [ "$gd" = "$cd" ]; then echo main; else basename "$top" | tr ' ' '-'; fi
}

# _fpl_read <dir>: the holder into L_PID, L_START, L_TREE, L_TOOL (empty when unknown). Every read may race the
# holder's own writes or its release, so nothing here may fail a `set -e` caller.
_fpl_read() {
  L_PID=""; L_START=""; L_TREE=""; L_TOOL=""
  if [ -f "$1/owner" ]; then read -r L_PID L_START L_TREE L_TOOL < "$1/owner" 2>/dev/null || true; fi
  case "$L_PID" in ''|*[!0-9]*) L_PID=$(cat "$1/pid" 2>/dev/null || true) ;; esac
  case "$L_PID" in ''|*[!0-9]*) L_PID="" ;; esac
  case "$L_START" in ''|*[!0-9]*)
    L_START=""
    if [ -f "$1/at" ]; then
      L_START=$(LC_ALL=C date -j -f '%Y-%m-%d %H:%M:%S' "$(cat "$1/at" 2>/dev/null || true)" +%s 2>/dev/null || true)
    fi
    case "$L_START" in ''|*[!0-9]*) L_START=$(stat -f %m "$1" 2>/dev/null || true) ;; esac ;;
  esac
  case "$L_START" in ''|*[!0-9]*) L_START="" ;; esac
  [ -n "$L_TOOL" ] || L_TOOL=$(cat "$1/who" 2>/dev/null || true)
  return 0
}

# _fpl_whose: the holder read last, in words.
_fpl_whose() {
  local s="pid ${L_PID:-unknown}"
  [ -n "$L_TREE$L_TOOL" ] && s="$s (${L_TREE:+$L_TREE, }${L_TOOL:-?})"
  [ -n "$L_START" ] && s="$s since $(date -r "$L_START" '+%F %T')"
  echo "$s"
}

_fpl_dur() {
  local s=$1
  if [ "$s" -ge 3600 ]; then
    if [ $((s % 3600 / 60)) = 0 ]; then echo "$((s / 3600)) h"; else echo "$((s / 3600)) h $((s % 3600 / 60)) min"; fi
  elif [ "$s" -ge 60 ]; then echo "$((s / 60)) min $((s % 60)) s"
  else echo "$s s"; fi
}

# _fpl_pstart <pid>: when that process started (epoch seconds), empty when it is gone.
_fpl_pstart() {
  local t
  t=$(LC_ALL=C ps -o lstart= -p "$1" 2>/dev/null | sed 's/ *$//' || true)
  [ -n "$t" ] && LC_ALL=C date -j -f '%a %b %d %T %Y' "$t" +%s 2>/dev/null
  return 0
}

# _fpl_ancestor <pid>: 0 when it is this shell or one of its ancestors.
_fpl_ancestor() {
  local p=$$ n=0
  [ -n "$1" ] || return 1
  while [ -n "$p" ] && [ "$p" -gt 1 ] && [ "$n" -lt 64 ]; do
    [ "$p" = "$1" ] && return 0
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || true)
    n=$((n + 1))
  done
  return 1
}

# _fpl_reused: 0 when the holder read last names a live pid that started after the lock was taken (prints when).
_fpl_reused() {
  local started
  [ -n "$L_PID" ] && [ -n "$L_START" ] || return 1
  started=$(_fpl_pstart "$L_PID" || true)
  [ -n "$started" ] && [ "$started" -gt $((L_START + 2)) ] || return 1
  date -r "$started" '+%F %T'
}

# _fpl_stale <dir>: prints why and returns 0 when the lock is to be broken (reads its holder first).
_fpl_stale() {
  local now started
  _fpl_read "$1"
  now=$(date +%s)
  if [ -n "$L_PID" ]; then
    if ! ps -p "$L_PID" >/dev/null 2>&1; then echo "its pid is gone"; return 0; fi
    if started=$(_fpl_reused); then
      echo "its pid is another process now (started $started, after the lock was taken)"; return 0
    fi
  fi
  if [ -n "$L_START" ] && [ $((now - L_START)) -gt "$FP_LOCK_MAX_AGE" ]; then
    echo "it is $(_fpl_dur $((now - L_START))) old, past the $(_fpl_dur "$FP_LOCK_MAX_AGE") limit"; return 0
  fi
  return 1
}

_fpl_sig() { cat "$1/owner" "$1/pid" "$1/at" 2>/dev/null; stat -f %m "$1" 2>/dev/null; return 0; }

# _fpl_break <dir> <what>: breaks the lock if it is still the stale one just read, and says whose.
_fpl_break() {
  local d="$1" what="$2" why sig
  why=$(_fpl_stale "$d") || return 1
  sig=$(_fpl_sig "$d")
  sleep 0.2
  [ "$(_fpl_sig "$d")" = "$sig" ] || return 1   # its holder changed meanwhile: judge it again
  rm -rf "$d"
  echo "lock: broke $what, held by $(_fpl_whose): $why" >&2
  return 0
}

# _fpl_own <dir> <tool>: the holder's files, and the release at exit.
_fpl_own() {
  local d="$1" tool="$2" now tree
  now=$(date +%s); tree=$(fp_tree_name)
  printf '%s %s %s %s\n' "$$" "$now" "$tree" "$tool" > "$d/owner"
  echo "$$" > "$d/pid"
  date -r "$now" '+%F %T' > "$d/at"
  echo "$tool $tree $(git rev-parse --short HEAD 2>/dev/null)" > "$d/who"
  FP_LOCKS_TAKEN="$FP_LOCKS_TAKEN$d
"
  trap 'fp_unlock_all' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap 'exit 129' HUP
}

# fp_unlock_all: frees every lock this shell took and still holds (one broken and taken by another meanwhile stays).
fp_unlock_all() {
  local d
  while IFS= read -r d; do
    if [ -n "$d" ] && [ "$(cat "$d/pid" 2>/dev/null || true)" = "$$" ]; then rm -rf "$d"; fi
  done <<EOF
$FP_LOCKS_TAKEN
EOF
  FP_LOCKS_TAKEN=""
  return 0
}

# fp_held <dir>: 0 when this shell or an ancestor holds it (a pid reused since the lock was taken holds nothing).
fp_held() { [ -d "$1" ] && _fpl_read "$1" && _fpl_ancestor "$L_PID" && ! _fpl_reused >/dev/null; }

# _fpl_wait_note <what> <first wait time>: says once that it waits, then every 10 minutes.
_fpl_wait_note() {
  local now; now=$(date +%s)
  if [ -z "$FPL_SAID" ] || [ $((now - FPL_SAID)) -ge 600 ]; then
    echo "lock: waiting for $1: held by $(_fpl_whose) (a lock whose pid is gone or that is over $(_fpl_dur "$FP_LOCK_MAX_AGE") old is broken)" >&2
    FPL_SAID=$now
  fi
}

# fp_lock <dir> <tool> [what]: waits until this shell holds <dir> (or finds an ancestor holding it).
fp_lock() {
  local d="$1" tool="$2" what="${3:-$1}"
  FPL_SAID=""
  mkdir -p "$(dirname "$d")" 2>/dev/null
  while :; do
    if mkdir "$d" 2>/dev/null; then _fpl_own "$d" "$tool"; return 0; fi
    [ -d "$d" ] || continue   # freed between the two: take it now
    if fp_held "$d"; then
      echo "lock: $what is held by this run's own $(_fpl_whose): taken as held" >&2
      return 0
    fi
    _fpl_break "$d" "$what" && continue
    [ -d "$d" ] && _fpl_wait_note "$what"
    sleep "$FP_LOCK_POLL"
  done
}

# fp_slot <base> <n> <tool> [what]: waits for one of <base>.1 .. <base>.<n> (fplock's names for n > 1); FP_SLOT = k.
fp_slot() {
  local base="$1" n="$2" tool="$3" what="${4:-$1}" k d
  FPL_SAID=""
  mkdir -p "$(dirname "$base")" 2>/dev/null
  for k in $(seq 1 "$n"); do
    if fp_held "$base.$k"; then FP_SLOT=$k; echo "lock: $what.$k is held by this run's own $(_fpl_whose): taken as held" >&2; return 0; fi
  done
  while :; do
    for k in $(seq 1 "$n"); do
      d="$base.$k"
      if mkdir "$d" 2>/dev/null; then _fpl_own "$d" "$tool"; FP_SLOT=$k; return 0; fi
      if _fpl_break "$d" "$what.$k" && mkdir "$d" 2>/dev/null; then _fpl_own "$d" "$tool"; FP_SLOT=$k; return 0; fi
    done
    _fpl_read "$base.1"
    _fpl_wait_note "$what (all $n)"
    sleep "$FP_LOCK_POLL"
  done
}

# simlock <tool>: the paired iPhone + Watch simulators, one runner at a time (says so when it takes them).
simlock() {
  fp_lock "$SIMLOCK" "${1:-tool}" "the paired simulators ($SIMLOCK)"
  if [ "$(cat "$SIMLOCK/pid" 2>/dev/null || true)" = "$$" ]; then
    echo "lock: holding the paired simulators ($SIMLOCK) for ${1:-tool}, pid $$" >&2
  fi
  return 0
}

# fp_simlock_held: 0 when this run holds the paired simulators (its own simlock or an ancestor's fplock sim.lock).
fp_simlock_held() { fp_held "$SIMLOCK"; }

# ---------------------------------------------------------------------------------------------------------------------
# The self-test: every rule above on scratch locks (FP_LOCKS_ROOT in a temporary folder), with a 1 s poll.
_fpl_self_test() {
  local me root n=0 bad=0 out t0 t1 pid dead
  me="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  root=$(mktemp -d "${TMPDIR:-/tmp}/simlock.XXXXXX") || exit 2
  FPL_ST_ROOT=$root
  trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$FPL_ST_ROOT"' EXIT
  export FP_LOCKS_ROOT="$root" FP_SIM_LOCK="$root/sim.lock" FP_LOCK_POLL=1
  ok() { n=$((n + 1)); echo "  ok   $1"; }
  no() { n=$((n + 1)); bad=$((bad + 1)); echo "  BAD  $1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/       /'; }
  # a pid that is surely gone
  sleep 0 & dead=$!; wait "$dead" 2>/dev/null
  echo "simlock self-test (scratch locks in $root)"

  # 1. taken, recorded, freed at exit
  out=$(bash -c ". '$me'; simlock t1; cat '$root/sim.lock/owner'; cat '$root/sim.lock/pid'" 2>&1)
  if [ ! -d "$root/sim.lock" ] && printf '%s' "$out" | grep -qE '^[0-9]+ [0-9]+ [^ ]+ t1$' \
     && printf '%s' "$out" | grep -q "^lock: holding the paired simulators .* for t1, pid "; then ok "taken (and said) with its owner line, freed at exit"; else no "taken (and said) with its owner line, freed at exit" "$out"; fi

  # 2. a dead holder (the acceptance's line: pid gone, 2.5 h old) is broken, and said
  mkdir "$root/sim.lock"; echo "$dead $(( $(date +%s) - 9000 )) scratch test" > "$root/sim.lock/owner"
  out=$(bash -c ". '$me'; simlock t2; echo took" 2>&1)
  if printf '%s' "$out" | grep -q "broke the paired simulators" && printf '%s' "$out" | grep -q "pid $dead (scratch, test)" \
     && printf '%s' "$out" | grep -q "its pid is gone" && printf '%s' "$out" | grep -q '^took$'; then ok "a dead holder's lock is broken, saying whose"; else no "a dead holder's lock is broken, saying whose" "$out"; fi

  # 3. a live holder past the age limit is broken
  sleep 30 & pid=$!
  mkdir "$root/sim.lock"; echo "$pid $(date +%s) scratch old" > "$root/sim.lock/owner"
  out=$(FP_LOCK_MAX_AGE=2 bash -c "sleep 3; . '$me'; simlock t3; echo took" 2>&1)
  { kill "$pid"; wait "$pid"; } 2>/dev/null
  if printf '%s' "$out" | grep -q "old, past the" && printf '%s' "$out" | grep -q '^took$'; then ok "a lock past the age limit is broken"; else no "a lock past the age limit is broken" "$out"; fi

  # 4. a pid that is another process now (it started after the lock was taken) is broken
  sleep 30 & pid=$!
  mkdir "$root/sim.lock"; echo "$pid $(( $(date +%s) - 100 )) scratch reused" > "$root/sim.lock/owner"
  out=$(bash -c ". '$me'; simlock t4; echo took" 2>&1)
  { kill "$pid"; wait "$pid"; } 2>/dev/null
  if printf '%s' "$out" | grep -q "another process now" && printf '%s' "$out" | grep -q '^took$'; then ok "a reused pid's lock is broken"; else no "a reused pid's lock is broken" "$out"; fi

  # 5. fplock's own files (pid, at, who; no owner) with a dead pid are broken
  mkdir "$root/sim.lock"; echo "$dead" > "$root/sim.lock/pid"; date '+%F %T' > "$root/sim.lock/at"; echo "T99 abc1234" > "$root/sim.lock/who"
  out=$(bash -c ". '$me'; simlock t5; echo took" 2>&1)
  if printf '%s' "$out" | grep -q "pid $dead (T99 abc1234)" && printf '%s' "$out" | grep -q '^took$'; then ok "an fplock holder's files are read"; else no "an fplock holder's files are read" "$out"; fi

  # 6. a live holder makes the next one wait until it frees the lock; the waiter says whose
  bash -c ". '$me'; simlock holder; sleep 3" 2>/dev/null & pid=$!
  sleep 1
  t0=$(date +%s); out=$(bash -c ". '$me'; simlock t6; echo took" 2>&1); t1=$(date +%s)
  wait "$pid" 2>/dev/null
  if [ $((t1 - t0)) -ge 1 ] && printf '%s' "$out" | grep -q "waiting for the paired simulators" && printf '%s' "$out" | grep -q "holder)" \
     && ! printf '%s' "$out" | grep -q 'lock: broke ' && printf '%s' "$out" | grep -q '^took$'; then ok "a live holder is waited for ($((t1 - t0)) s), never broken"; else no "a live holder is waited for, never broken" "$out"; fi

  # 7. a bare mkdir (no pid) younger than the limit is waited for; once gone the waiter takes it
  mkdir "$root/sim.lock"
  bash -c ". '$me'; simlock t7; echo took > '$root/t7'" 2>/dev/null & pid=$!
  sleep 2
  if [ ! -f "$root/t7" ]; then rm -rf "$root/sim.lock"; sleep 2; wait "$pid" 2>/dev/null; fi
  if [ "$(cat "$root/t7" 2>/dev/null)" = took ]; then ok "a bare mkdir lock is waited for, then taken"; else no "a bare mkdir lock is waited for, then taken"; kill "$pid" 2>/dev/null; fi

  # 8. held by an ancestor: the child goes on at once and leaves the lock to its holder
  out=$(bash -c ". '$me'; simlock parent; bash -c \". '$me'; simlock child; echo child-took\"; [ -d '$root/sim.lock' ] && echo still-held; fp_simlock_held && echo held-by-us" 2>&1)
  if printf '%s' "$out" | grep -q "held by this run's own" && printf '%s' "$out" | grep -q '^child-took$' && printf '%s' "$out" | grep -q '^still-held$' \
     && printf '%s' "$out" | grep -q '^held-by-us$' && [ ! -d "$root/sim.lock" ]; then ok "an ancestor's hold is taken as held and left to it"; else no "an ancestor's hold is taken as held and left to it" "$out"; fi

  # 9. a lock broken and taken by another meanwhile is not freed by its first holder's exit
  out=$(bash -c ". '$me'; simlock first; echo 1 > '$root/sim.lock/pid'; echo \"1 0 other x\" > '$root/sim.lock/owner'" 2>&1)
  if [ -d "$root/sim.lock" ]; then ok "only a lock still this shell's is freed at exit"; else no "only a lock still this shell's is freed at exit" "$out"; fi
  rm -rf "$root/sim.lock"

  # 10. two slots: two holders, the third waits for the first one freed, then takes that slot
  bash -c ". '$me'; fp_slot '$root/build.slot' 2 a; sleep 2" & pid=$!
  bash -c ". '$me'; fp_slot '$root/build.slot' 2 b; sleep 5" & t1=$!
  sleep 1
  out=$(bash -c ". '$me'; fp_slot '$root/build.slot' 2 c; echo slot \$FP_SLOT" 2>&1)
  wait "$pid" "$t1" 2>/dev/null
  if printf '%s' "$out" | grep -q "waiting for $root/build.slot (all 2)" && printf '%s' "$out" | grep -qE '^slot [12]$'; then ok "a third build waits for a free slot"; else no "a third build waits for a free slot" "$out"; fi

  # 11. a slot broken and taken by another before this one's mkdir: no set -e exit, the next slot is taken
  rm -rf "$root"/build.slot.*
  out=$(bash -c "set -e; . '$me'; mkdir '$root/build.slot.1'; _fpl_break() { rm -rf \"\$1\"; command mkdir \"\$1\"; echo 1 > \"\$1/pid\"; return 0; }; fp_slot '$root/build.slot' 2 race; echo slot \$FP_SLOT" 2>&1)
  if printf '%s' "$out" | grep -q '^slot 2$'; then ok "a slot lost right after its break: on to the next one (set -e)"; else no "a slot lost right after its break: on to the next one (set -e)" "$out"; fi
  rm -rf "$root"/build.slot.*

  # 12. this shell's own pid named by a lock taken before it started (a reused pid) is no hold of its own
  out=$(bash -c ". '$me'; mkdir '$root/sim.lock'; echo \"\$\$ $(( $(date +%s) - 100 )) scratch reused\" > '$root/sim.lock/owner'; simlock t12; echo took" 2>&1)
  if printf '%s' "$out" | grep -q "another process now" && ! printf '%s' "$out" | grep -q "taken as held" && printf '%s' "$out" | grep -q '^took$'; then
    ok "a reused pid of its own is broken, not taken as held"; else no "a reused pid of its own is broken, not taken as held" "$out"; fi

  if [ "$bad" = 0 ]; then echo "simlock self-test: $n cases, every rule held"; return 0; fi
  echo "simlock self-test: $bad of $n cases wrong"; return 1
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    --self-test) _fpl_self_test; exit $? ;;
    *) echo "usage: . $0 (then simlock <tool>), or bash $0 --self-test" >&2; exit 2 ;;
  esac
fi
