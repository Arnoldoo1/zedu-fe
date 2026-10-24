# AGENT.md — the office rules

This file is for coding agents working on The Office. `AGENTS.md` still governs the
general workflow (branch, commits, checks). This file adds one rule on top of it.

## Read the PRD first, and keep referring back to it

[`OFFICE_PRD.md`](./OFFICE_PRD.md) is the source of truth for what the office is and
how it should feel. Before changing anything under `src/app/office/`,
`src/app/(client)/[org]/office/`, `src/app/api/office/` or `src/lib/office/`:

1. Read the section of `OFFICE_PRD.md` that covers the change.
2. Say which requirement the change serves, and cite it in the PR description.
3. Compare the change against the PRD's design references and rules — especially
   §1.6 (the floor is the product, no overlay-first presentation, the tower must
   earn its place).
4. If the change cannot be justified by the PRD, update the PRD in the same PR and
   explain why. Never let code and PRD drift apart.

## Non-negotiables

- **Do not regress the floor.** Walking, camera follow, click-to-move and collision
  from the original build are the benchmark. Presentation work that makes the floor
  feel worse is a defect, regardless of how it looks in a screenshot.
- **Do not ship overlay-first UI.** Panels and modals that cover the floor are
  defects. Prefer in-world UI and a thin HUD.
- **The tower is optional until it earns its place.** It ships only if it locates
  people and rooms faster than the floor view does.

When in doubt, re-read `OFFICE_PRD.md` rather than guessing.
