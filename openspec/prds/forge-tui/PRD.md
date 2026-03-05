# Forge TUI — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

The Agent Forge System runs agents inside Docker containers with MCP proxies managing tool access. When a proxy requires human approval for a tool call (e.g., deleting a repository, sending a message to a public channel), there is no interface for the operator to see the request and approve or deny it. The approval request sits in a SQLite database with a 5-minute TTL, and unless the operator manually queries the database, the request expires and auto-denies.

Beyond approvals, operators have no unified view of their running agents. Checking agent status requires running `docker ps`, reading audit logs requires SQLite queries, and managing agent lifecycles requires remembering multiple `forge` subcommands. There is no single pane of glass.

The forge TUI fills this gap. It is the operator's primary interface to the forge ecosystem — launched with just `forge` (no subcommand). Initially focused on approval monitoring and agent status, it will grow into the central management console for installing, running, and interacting with agents.

---

## 2. Goals

### User Goals
- See all running agents and their status at a glance.
- Receive and resolve approval requests in real time without leaving the terminal.
- View recent tool call activity across all agents in one place.

### Business Goals
- Complete the governance loop: approvals without the TUI are unanswerable, making the approval feature useless.
- Establish the TUI as the entry point to forge, positioning `forge` (no subcommand) as the primary developer experience.

### Measurable Outcomes
- Time from approval request to operator awareness < 2 seconds.
- Approval resolution requires ≤ 2 keystrokes (navigate + approve/deny).

---

## 3. Non-Goals

- **Agent installation or management (v1):** The TUI will eventually support `forge install`, `forge run`, etc. Not in v1.
- **Agent stdin/stdout interaction (v1):** Connecting to agent runtime containers for interactive sessions is future work.
- **Web-based interface:** The TUI is terminal-only. A web dashboard is a separate product.
- **Log streaming:** Real-time log tailing from proxy or runtime containers is out of scope for v1.
- **Multi-machine:** The TUI reads from `~/.forge/forge.db` on the local machine. Remote agent monitoring is future work.

---

## 4. User Stories

**US-1:** As an agent operator, I want to run `forge` with no arguments and see a dashboard of my running agents, so that I have immediate visibility into my agent infrastructure.

**US-2:** As an agent operator, I want to see pending approval requests appear in real time, so that I can approve or deny them before they expire.

**US-3:** As an agent operator, I want to approve or deny a request with a single keystroke, so that the process is fast and doesn't interrupt my workflow.

**US-4:** As an agent operator, I want to see recent tool call activity across all agents, so that I can understand what my agents are doing.

**US-5:** As an agent operator, I want the approval countdown to be visible, so that I know how much time I have to respond.

---

## 5. Requirements

### P0 — Must-Have

**REQ-001: Default Command**

Running `forge` with no subcommand launches the TUI. The TUI is built with Ink (React for CLI).

Acceptance criteria:
- Given the user runs `forge`, when no subcommand is provided, then the TUI launches.
- Given the user runs `forge --help`, then the TUI is not launched and help text is shown.

**REQ-002: Agent Status Panel**

The TUI displays a panel showing all running agents with their status. Agent status is determined by querying Docker (`docker ps`) for containers matching forge naming conventions.

Acceptance criteria:
- Given 2 agents are running (repo-ops, note-taker), when the TUI starts, then both appear in the agent status panel with status "online".
- Given an agent's proxy container stops, when the TUI refreshes, then the agent's status changes to "offline".
- Given no agents are running, then the panel shows "No agents running".

**REQ-003: Agent Status Detection via Docker**

The TUI uses `docker ps` (via Docker API or CLI) to detect running agents and proxies. It identifies forge containers by their naming convention (e.g., `forge-proxy-<agent-name>`, `forge-<agent-name>-<runtime>`).

Acceptance criteria:
- Given Docker containers `forge-proxy-repo-ops` and `forge-repo-ops-claude-code` are running, when the TUI queries Docker, then it shows agent `repo-ops` as online with runtime `claude-code`.
- Given Docker is not running, when the TUI queries Docker, then it shows a warning "Docker not available" and the agent panel shows no agents.

**REQ-004: Pending Approvals Panel**

The TUI monitors the `approval_requests` table in `~/.forge/forge.db` for rows with `status = 'pending'`. Pending approvals are displayed in a list with: agent name, tool name (prefixed), argument summary, and remaining TTL countdown.

Acceptance criteria:
- Given a proxy writes a pending approval request, when the TUI polls the database, then the request appears in the pending approvals panel within 2 seconds.
- Given a pending approval has 3 minutes remaining, then the countdown shows `3:00` and decrements in real time.
- Given no pending approvals exist, then the panel shows "No pending approvals".

**REQ-005: Approval Resolution**

The operator can navigate to a pending approval and approve or deny it with a single keystroke. The TUI updates the `approval_requests` table with the new status, resolution timestamp, and `resolved_by = 'tui'`.

Acceptance criteria:
- Given a pending approval is selected, when the operator presses `a`, then the status is updated to `approved` in SQLite.
- Given a pending approval is selected, when the operator presses `d`, then the status is updated to `denied` in SQLite.
- Given an approval is resolved, then it moves from the pending panel to the recent activity panel.

**REQ-006: Recent Activity Panel**

The TUI displays recent tool calls from the `audit_log` table in `~/.forge/forge.db`. Entries show: timestamp, agent name, tool name (prefixed), status (success/error/denied/timeout), and duration.

Acceptance criteria:
- Given 50 audit log entries exist, when the TUI starts, then the most recent 20 are displayed.
- Given new audit log entries are written, when the TUI polls, then new entries appear at the top of the list.

**REQ-007: SQLite Polling**

The TUI polls `~/.forge/forge.db` at a configurable interval (default: 1 second) for changes to `approval_requests` and `audit_log` tables. It uses WAL mode for non-blocking reads.

Acceptance criteria:
- Given the database is being written to by a proxy, when the TUI polls, then it reads without blocking the proxy's writes.
- Given `~/.forge/forge.db` does not exist, when the TUI starts, then it shows "No database found — start an agent with `forge run`".

**REQ-008: Keyboard Navigation**

The TUI supports keyboard navigation between panels and actions.

| Key | Action |
|-----|--------|
| `↑`/`↓` or `j`/`k` | Navigate within a panel |
| `Tab` | Switch between panels |
| `a` | Approve selected approval request |
| `d` | Deny selected approval request |
| `q` | Quit the TUI |

Acceptance criteria:
- Given the approval panel is focused, when the operator presses `↓`, then the next approval is selected.
- Given the activity panel is focused, when the operator presses `Tab`, then focus moves to the agent panel.

**REQ-009: Graceful Startup**

The TUI starts without errors regardless of system state — no Docker, no database, no running agents. Missing components are shown as informational messages, not errors.

Acceptance criteria:
- Given Docker is not installed, then the agent panel shows "Docker not available".
- Given `~/.forge/forge.db` does not exist, then the approvals and activity panels show appropriate empty-state messages.
- Given everything is available, then all panels populate normally.

### P1 — Nice-to-Have

**REQ-010: Approval Detail View**

Pressing `Enter` on a pending approval expands it to show full tool call arguments (pretty-printed JSON), the requesting agent's role, and the matched approval pattern.

Acceptance criteria:
- Given a pending approval is selected, when the operator presses `Enter`, then a detail view shows the full arguments.
- Given the detail view is open, when the operator presses `Escape`, then it closes and returns to the list.

**REQ-011: Activity Filtering**

The operator can filter the recent activity panel by agent name, app name, or status.

Acceptance criteria:
- Given the activity panel is focused, when the operator presses `/` and types `github`, then only entries with `github` in the tool name are shown.

**REQ-012: Notification Sound/Bell**

When a new approval request arrives, the TUI triggers a terminal bell to alert the operator.

Acceptance criteria:
- Given a new pending approval appears, then the terminal bell character (`\x07`) is written to stdout.

### P2 — Future Consideration

**REQ-013: Agent Lifecycle Management**

The TUI provides commands to install, run, and stop agents directly from the interface.

**REQ-014: Agent Interactive Mode**

Connect to a running agent's runtime container stdin/stdout for interactive sessions from within the TUI.

**REQ-015: Multi-Pane Layout**

Support for split views, resizable panels, and custom layouts.

---

## 6. Architecture

### 6.1 High-Level Architecture

```
┌───────────────────────────────────────────────────────────┐
│  forge (TUI)  —  Ink (React for CLI)                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Agent Status Panel                                  │ │
│  │  ┌──────────┬──────────┬───────────┬──────────────┐ │ │
│  │  │ Agent    │ Status   │ Runtime   │ Uptime       │ │ │
│  │  ├──────────┼──────────┼───────────┼──────────────┤ │ │
│  │  │ repo-ops │ ● online │ claude    │ 2h 14m       │ │ │
│  │  │ ops-bot  │ ○ offline│ codex     │ —            │ │ │
│  │  └──────────┴──────────┴───────────┴──────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Pending Approvals (1)                    [a]pprove │ │
│  │  ┌──────────────────────────────────────────────┐   │ │
│  │  │ ▶ repo-ops → github_delete_repo(acme/old) │   │ │
│  │  │                                     2:41 ⏱  │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Recent Activity                                     │ │
│  │  14:23  repo-ops  github_create_pr        ✓  1.2s   │ │
│  │  14:22  repo-ops  github_list_repos       ✓  0.8s   │ │
│  │  14:21  ops-bot   slack_send_message      ✓  0.4s   │ │
│  │  14:20  repo-ops  github_delete_repo      ✗  denied │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  [Tab] switch panel  [a]pprove  [d]eny  [q]uit      │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
         │                              │
         │ docker ps                    │ SQLite reads/writes
         ▼                              ▼
   ┌───────────┐               ┌─────────────────┐
   │  Docker   │               │ ~/.forge/        │
   │  Engine   │               │   forge.db       │
   └───────────┘               └─────────────────┘
                                    ▲        ▲
                               writes    writes
                                 │          │
                          ┌──────┘          └──────┐
                    ┌─────────────┐         ┌─────────────┐
                    │ Proxy A     │         │ Proxy B     │
                    │ (repo-ops)  │         │ (ops-bot)   │
                    └─────────────┘         └─────────────┘
```

### 6.2 Component Structure (Ink/React)

```
<App>
  ├── <AgentStatusPanel>         # Docker-sourced agent list
  │     └── <AgentRow>           # Per-agent status line
  ├── <ApprovalPanel>            # SQLite-sourced pending approvals
  │     ├── <ApprovalItem>       # Selectable approval with countdown
  │     └── <ApprovalDetail>     # Expanded view (P1)
  ├── <ActivityPanel>            # SQLite-sourced audit log
  │     └── <ActivityRow>        # Single audit entry
  └── <StatusBar>                # Keyboard hints, connection status
```

### 6.3 Data Sources

| Source | Method | Interval | Data |
|--------|--------|----------|------|
| Docker | `docker ps --filter name=forge- --format json` | 5 seconds | Container names, status, uptime |
| SQLite `approval_requests` | `SELECT * WHERE status = 'pending'` | 1 second | Pending approvals |
| SQLite `audit_log` | `SELECT * ORDER BY timestamp DESC LIMIT 20` | 2 seconds | Recent activity |

### 6.4 Docker Container Naming Convention

The TUI relies on forge's Docker container naming convention to identify agents:

| Container Name Pattern | Meaning |
|----------------------|---------|
| `forge-proxy-<agent>` | MCP proxy for agent |
| `forge-<agent>-<runtime>` | Runtime container for agent |

From `docker ps`, the TUI extracts:
- Agent name: parsed from container name
- Runtime: parsed from runtime container name
- Status: from Docker container status (running/exited/restarting)
- Uptime: from Docker container started timestamp

### 6.5 Integration with forge CLI

The TUI is the default action when `forge` is run with no subcommand. All existing subcommands (`forge install`, `forge run`, `forge proxy`, etc.) continue to work as before.

```typescript
// cli/index.ts
program
  .name("forge")
  .description("Agent Forge System")
  .action(async () => {
    // No subcommand → launch TUI
    await launchTui();
  });
```

---

## 7. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should the TUI auto-refresh on terminal resize, or should panels have fixed minimum widths? | Engineering | No |
| Q2 | Should `forge` with no arguments but outside a forge workspace still launch the TUI (global mode), or require being in a workspace? | Product | Yes |
| Q3 | Should the TUI show approval history (recently resolved), or only pending requests? | Product | No |

---

## 8. Timeline Considerations

### Phase 1: Approval Monitor (P0)
- Ink-based TUI with three panels (agents, approvals, activity)
- Docker-based agent status detection
- SQLite polling for approvals and audit log
- Keyboard navigation and approval resolution
- Default `forge` command

### Phase 2: Enhanced UX (P1)
- Approval detail view
- Activity filtering
- Notification bell

### Phase 3: Agent Management (P2)
- Install/run/stop agents from TUI
- Interactive agent sessions
- Custom layouts
