# Agent Shell — routes unknown non-command input to Claude Code
# Source this from ~/.bashrc and/or ~/.zshrc:
#   source ~/agent-shell/agent-shell.sh
#
# Options (export before or after sourcing):
#   AGENT_THINK=1          — enable extended thinking (default: 0)
#   AGENT_SHOW_THINK=1     — stream thinking + response to terminal (default: 0)
#
# Dependencies:
#   cd ~/agent-shell && npm install

: "${AGENT_THINK:=0}"
: "${AGENT_SHOW_THINK:=0}"

# Resolve the directory this script lives in
AGENT_SHELL_DIR="${0:a:h}" 2>/dev/null || AGENT_SHELL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Disable history expansion so ! doesn't break prompts ──
set +H 2>/dev/null  # bash
setopt NO_BANG_HIST 2>/dev/null  # zsh

# ── Run claude ──

_agent_run() {
  if [[ "$AGENT_SHOW_THINK" == "1" ]]; then
    node "$AGENT_SHELL_DIR/agent-run.mjs" "$1"
  elif [[ "$AGENT_THINK" == "1" ]]; then
    claude --print --max-thinking-tokens 31999 "$1"
  else
    claude --print "$1"
  fi
}

# ── @ function: explicit agent invocation with slash-command support ──

_agent_at() {
  local input="$*"

  # No args — show available commands
  if [[ -z "$input" ]]; then
    echo "Usage: @ <prompt or /command> [args...]"
    echo ""
    _agent_list_commands
    return 0
  fi

  # Slash command: @ /cleanup-docs [extra context]
  if [[ "$input" == /* ]]; then
    local slash_cmd="${input%% *}"
    local cmd_name="${slash_cmd#/}"
    local extra="${input#"$slash_cmd"}"
    extra="${extra# }"

    local cmd_file=""
    for dir in ".claude/commands" "$HOME/.claude/commands"; do
      if [[ -f "$dir/$cmd_name.md" ]]; then
        cmd_file="$dir/$cmd_name.md"
        break
      fi
    done

    if [[ -z "$cmd_file" ]]; then
      echo "Unknown command: $slash_cmd" >&2
      echo "Available commands:" >&2
      _agent_list_commands >&2
      return 1
    fi

    if [[ -n "$extra" ]]; then
      _agent_run "$slash_cmd $extra"
    else
      _agent_run "$slash_cmd"
    fi
  else
    _agent_run "$input"
  fi
}

# ── @ alias / function ──

if [[ -n "$ZSH_VERSION" ]]; then
  alias @='noglob _agent_at'

  # Intercept @nospace before the shell parses (and globs) the line
  _agent_accept_line() {
    if [[ "$BUFFER" == @* && "$BUFFER" != "@ "* ]]; then
      BUFFER="@ ${BUFFER#@}"
    fi
    zle .accept-line
  }
  zle -N accept-line _agent_accept_line

elif [[ -n "$BASH_VERSION" ]]; then
  eval '@() { _agent_at "$@"; }'
fi

# ── List available commands ──

_agent_list_commands() {
  local found=0

  for dir in ".claude/commands" "$HOME/.claude/commands"; do
    if [[ -d "$dir" ]]; then
      local label="project"
      [[ "$dir" == "$HOME"* ]] && label="global"

      for f in "$dir"/*.md; do
        [[ -f "$f" ]] || continue
        found=1
        local name
        name=$(basename "$f" .md)
        local desc
        desc=$(head -1 "$f" 2>/dev/null)
        printf "  /%s  (%s) — %s\n" "$name" "$label" "$desc"
      done
    fi
  done

  if (( found == 0 )); then
    echo "  No commands found in .claude/commands/"
  fi
}

# ── Tab completion ──

_agent_completions() {
  local commands=()

  for dir in ".claude/commands" "$HOME/.claude/commands"; do
    if [[ -d "$dir" ]]; then
      for f in "$dir"/*.md; do
        [[ -f "$f" ]] || continue
        commands+=("/$(basename "$f" .md)")
      done
    fi
  done

  if [[ -n "$ZSH_VERSION" ]]; then
    compadd -a commands
  elif [[ -n "$BASH_VERSION" ]]; then
    local cur="${COMP_WORDS[COMP_CWORD]}"
    COMPREPLY=()
    for cmd in "${commands[@]}"; do
      [[ "$cmd" == "$cur"* ]] && COMPREPLY+=("$cmd")
    done
  fi
}

if [[ -n "$ZSH_VERSION" ]]; then
  compdef _agent_completions _agent_at
elif [[ -n "$BASH_VERSION" ]]; then
  complete -F _agent_completions @
fi

# ── command-not-found: natural language fallback ──

_agent_handler() {
  local cmd="$1"
  shift

  # @something (no space) — strip the @ and route to agent
  if [[ "$cmd" == @* ]]; then
    local stripped="${cmd#@}"
    _agent_at "$stripped" "$@"
    return
  fi

  local full_input="$cmd $*"

  # If 6 or fewer args, it might be a typo — check command-not-found
  if (( $# <= 6 )) && [[ -x /usr/lib/command-not-found ]]; then
    /usr/lib/command-not-found -- "$cmd" 2>&1 && return 127
  fi

  _agent_run "$full_input"
}

if [[ -n "$ZSH_VERSION" ]]; then
  command_not_found_handler() { _agent_handler "$@"; }
elif [[ -n "$BASH_VERSION" ]]; then
  command_not_found_handle() { _agent_handler "$@"; }
fi