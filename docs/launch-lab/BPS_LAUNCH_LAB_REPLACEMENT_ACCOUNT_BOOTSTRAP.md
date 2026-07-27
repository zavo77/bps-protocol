# Replacement Claude Account — Bootstrap Prompt

Paste this into a brand-new Claude Code Desktop session after selecting the BPS repository as the working folder:

```text
You are taking over an active BPS RWA Launch Lab build with no prior conversation context.

Before changing anything, read these files in full and in this order:
1. docs/launch-lab/BPS_LAUNCH_LAB_BUILD_INTAKE_DESKTOP.md
2. docs/launch-lab/BPS_LAUNCH_LAB_MASTER_PROMPT_DESKTOP.md
3. docs/launch-lab/BPS_LAUNCH_LAB_LIVE_HANDOVER.md
4. docs/launch-lab/BPS_LAUNCH_LAB_STATE.json
5. the latest entries in docs/launch-lab/BPS_LAUNCH_LAB_WORKLOG.md
6. every report linked from the live handover that is relevant to the active milestone

Then run read-only reconciliation commands for repository path, branch, HEAD commit, remotes, git status, package/tool versions, and available Vercel/Railway/GitHub service status. Compare live facts with the handover. If anything differs, update the handover, worklog, and state JSON before modifying code.

Treat the live handover as the authoritative current project state, but never trust it over live repository or service evidence. Continue from its ordered Next exact actions. Do not restart product planning or reopen settled decisions unless live evidence invalidates them.

Maintain the continuous handover protocol after every meaningful action. Never print or store secret values. The handover may record credential names, storage locations, configuration status, and validation timestamps only.

Ask one consolidated blocker question only if safe continuation is impossible. Otherwise continue autonomously through the active milestone and keep the continuity files no more than one meaningful action behind.
```
