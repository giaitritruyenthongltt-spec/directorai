# Bug triage (P4.38)

This doc covers how DirectorAI labels, prioritises, and turns around
bugs during the beta. The workflow runs entirely on GitHub Issues + a
`Triage` GitHub Projects board.

## Lifecycle

```
new issue
   │
   ▼ (auto-label by template)  triage.yml workflow
[bug] [triage] [severity/Pn] [area/X]
   │
   ▼ daily triage call
add to "Triage" project (column = severity)
   │
   ▼ owner assigned + ETA
status: in-progress → in-review → done
   │
   ▼ on merge
linked PR auto-closes issue
```

## Severity SLA

| Severity          | What                                                   | First response    | Target fix        |
| ----------------- | ------------------------------------------------------ | ----------------- | ----------------- |
| **P0** — blocker  | data loss, panel won't open, fully broken for any user | 4 working hours   | same business day |
| **P1** — major    | feature broken, no workaround                          | next business day | within the sprint |
| **P2** — minor    | annoying, workaround exists                            | within 1 week     | next sprint       |
| **P3** — cosmetic | typos, alignment, copy                                 | within 2 weeks    | when convenient   |

The `triage.yml` workflow auto-labels and comments on P0; everything
else is human-assigned in the daily call.

## Area labels

Every issue gets exactly one `area/*` label:

- `area/panel-ui` — React panel + UXP glue
- `area/server` — Node MCP/WebSocket server
- `area/context-engine` — Python sidecar
- `area/style-engine` — DSL, parser, learner, versioning
- `area/cut-planner` — plan + execute
- `area/premiere-adapter` — UXP/Mock adapter, dispatcher, retry
- `area/license` — Stripe, issuer, verifier
- `area/installer` — MSI, CCX, signing
- `area/docs` — docs-site, tutorials, ADRs
- `area/other`

## Daily triage call

15 minutes, every weekday morning. One person owns the queue for the
week.

1. Walk `is:open is:issue label:triage`.
2. Confirm severity (or downgrade with a comment).
3. Assign owner, paste ETA in the issue.
4. Remove `triage`, add `accepted`.
5. Move card on the Triage project to the right column.

## Friday survey loop

`pnpm survey:send` posts the weekly Tally form. Responses land in
Notion (P4.37); items flagged "this blocks me" become P1 issues by
end of day Monday.

## Owner-completed setup

- Create the GitHub Projects board `Triage` with columns
  `triage`, `P0`, `P1`, `P2`, `P3`, `in-progress`, `in-review`,
  `done`.
- Create the label set: `severity/p0..p3`, `area/*` (10 labels),
  `triage`, `accepted`, `bug`, `feature`.
- Configure the Discord `#bugs` channel webhook (used by the
  `bug-reported` GitHub Action — coming in P4.39 marketing infra).
