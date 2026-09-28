---
name: tmux
description: Control interactive terminal programs through isolated tmux sessions when a normal exec command is insufficient.
---

# tmux

Use tmux only for an interactive TTY. Prefer normal `exec` for non-interactive or background commands.

Use an isolated socket under the agent workspace or temporary directory:

```bash
SOCKET_DIR="${TMPDIR:-/tmp}/eido-tmux-sockets"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/eido.sock"
tmux -S "$SOCKET" new-session -d -s <session> -n shell
```

- Send literal input with `tmux -S "$SOCKET" send-keys -t <target> -l -- '<command>'`, then send `Enter` separately.
- Inspect with `capture-pane -p -J -S -200`.
- Target panes explicitly as `session:window.pane`.
- Never reuse or kill an unknown user's tmux server.
- Clean up only sessions created for the current task.
- For parallel repository work, use separate worktrees to avoid conflicting edits.
