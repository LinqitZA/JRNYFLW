# Piece Archive & Restoration Playbook

| Field | Value |
|---|---|
| Status | Draft — pending review 2026-05-04 |
| Date | 2026-05-04 |
| Repo | jrnyflw |
| Companion docs | `LICENSE-AUDIT.md`, `piece-prune-manifest.json` |

---

## Why an Archive

JRNYFLW prunes from 691 to ~144 pieces because most upstream Activepieces pieces serve marketing/CRM/AI-content/social-media use cases that have no role in an ERP product. But customer demand can still surface a need for a pruned piece (e.g. "we need the Mailchimp piece for a one-off marketing flow"). Throwing pruned pieces away outright would force a code-rewrite at that point. An archive is cheaper insurance.

The archive is **not** a static snapshot. Activepieces upstream keeps maintaining these pieces — security patches, action additions, breaking-change fixes. A frozen 2026-05 snapshot rots within a year. The archive must track upstream.

## Archive Topology

| Mechanism | Purpose | Lifecycle |
|---|---|---|
| Tag `archive/pre-prune-<date>` | Time-frozen reference of pre-prune state. Cheap insurance. Diff against to see exactly what was removed. | Created once at prune time; never updated. |
| Branch `upstream/full-pieces` | Living archive containing **all** upstream pieces. Refreshed periodically from Activepieces upstream. | Long-running; never merged into main; rebased forward on upstream sync. |
| Branch `main` | Keep-set only (~144 pieces). What ships. | Active development. |
| File `docs/audits/piece-prune-manifest.json` | Single source of truth: which piece in which state, why, and how to restore. | Updated on every prune/restore decision. |

### Why a tracking branch over a separate repo

Considered alternatives:

| Alternative | Why rejected |
|---|---|
| Separate `jrnyflw-archive` git repo | Doubles the upstream-sync overhead; restore requires cross-repo cherry-pick; two CI configs to maintain. |
| Git submodule | Submodule UX is universally disliked; restoration requires submodule init/update juggling. |
| Tag-only snapshot | Stale within a year. Restored piece would carry unpatched security issues from prune date. |
| Sparse checkout / git LFS | Doesn't reduce build/lint surface; doesn't satisfy the prune intent (still ships in tarball). |

A long-running branch is the simplest mechanism that retains upstream sync.

## Initial Setup (one-time, at first prune)

```bash
# 1. Tag the pre-prune state for posterity
git tag archive/pre-prune-2026-05-04 main
git push origin archive/pre-prune-2026-05-04

# 2. Create the tracking branch from current main (still has all 691 pieces)
git checkout -b upstream/full-pieces
git push -u origin upstream/full-pieces

# 3. Switch back to main and execute the prune (separate playbook)
git checkout main
# ... run prune script that consumes piece-prune-manifest.json ...
git commit -m "Phase 4.x: Prune 547 pieces per manifest; archived in upstream/full-pieces"
```

After this, `main` and `upstream/full-pieces` diverge — main has only the keep-set; the tracking branch has everything.

## Periodic Upstream Sync (quarterly)

Goal: pull new pieces and bug fixes from Activepieces upstream into `upstream/full-pieces` without touching main.

```bash
# 1. Add upstream remote (one-time)
git remote add upstream-ap https://github.com/activepieces/activepieces.git
git remote update upstream-ap

# 2. On each refresh
git checkout upstream/full-pieces
git pull origin upstream/full-pieces

# Strategy A — merge (easier, retains JRNYFLW rebrand commits)
git merge upstream-ap/main --no-ff -m "Quarterly upstream sync $(date +%Y-%m-%d)"

# Strategy B — pristine reset (loses JRNYFLW-specific patches on this branch;
# only safe because we never modify pieces on the tracking branch)
# git reset --hard upstream-ap/main

git push origin upstream/full-pieces
```

**Decide once and stick with it:** merge if the tracking branch carries JRNYFLW-specific commits (e.g. piece directory renames from `activepieces` to `jrnyflw` namespacing). Reset if the tracking branch is a pure mirror.

The current rebrand is committed on main only (commit `4a3db1a2e9 chore(rebrand)`); the tracking branch should be a pure mirror, so **Strategy B (reset)** is appropriate.

Recommended refresh cadence: **quarterly** (Q1, Q2, Q3, Q4). More frequent is wasted effort; less frequent risks security drift.

## Restoring a Pruned Piece

When a customer or product decision requires bringing back a pruned piece:

```bash
# 1. Identify the piece in the manifest
jq '.pieces[] | select(.dir == "mailchimp")' docs/audits/piece-prune-manifest.json

# 2. Cherry-pick the directory from the tracking branch
git checkout upstream/full-pieces -- packages/pieces/community/mailchimp

# 3. Re-add to the workspaces array in root package.json
#    (only required if workspaces glob excludes this dir explicitly; the
#    'packages/pieces/community/*' glob auto-includes it on next install)

# 4. Re-install and re-audit
bun install
license-checker-rseidelsohn --production --json --excludePrivatePackages \
  --start packages/pieces/community/mailchimp \
  > /tmp/mailchimp-license.json

# 5. Update the manifest
jq '(.pieces[] | select(.dir == "mailchimp")) |= (
      .decision = "keep" |
      .category = "<chosen-category>" |
      .rationale = "Restored YYYY-MM-DD: <reason>" |
      .restored_at = "YYYY-MM-DD"
    )' docs/audits/piece-prune-manifest.json > /tmp/m.json && \
  mv /tmp/m.json docs/audits/piece-prune-manifest.json

# 6. Commit
git add packages/pieces/community/mailchimp docs/audits/piece-prune-manifest.json
git commit -m "Restore @activepieces/piece-mailchimp from archive"
```

The license re-audit at step 4 catches any new copyleft/proprietary deps the upstream piece might have picked up since the prune. **Always re-audit before merging a restoration.**

## Bulk Restoration (e.g. enabling Phase 2 eCommerce)

The 5 eCommerce pieces in the manifest carry `category: ecommerce-phase2` and `decision: keep`. They're already on main, just dormant in V1 (not exposed in the piece picker). When Phase 2 starts, no archive operation is needed — just feature-flag them on.

For a category-wide restore from archive (e.g. "marketing-email is now in scope"):

```bash
# Pull every piece in the marketing-email category from the manifest
jq -r '.pieces[] | select(.category == "marketing-email") | .path' \
  docs/audits/piece-prune-manifest.json | \
  xargs -I {} git checkout upstream/full-pieces -- {}
```

Then bulk-update the manifest entries to `keep`, run `bun install`, and re-run the full license audit (`license-checker-rseidelsohn` per workspace, as in the audit doc methodology §2).

## Manifest as Source of Truth

The manifest at `docs/audits/piece-prune-manifest.json` is canonical. Any prune script, restore script, or CI gate must consume the manifest — not hardcode piece names. This means:

- A new pruned piece gets one entry added to the manifest, then the prune script removes its directory.
- A restored piece gets its manifest entry flipped to `keep`, then the restore command runs.
- Drift detection (CI job): for each `decision: keep` entry, verify the directory exists; for each `decision: prune` entry, verify it does not. Fail the build on drift.

A simple drift check:

```bash
jq -r '.pieces[] | "\(.decision) \(.path)"' docs/audits/piece-prune-manifest.json | \
while read decision path; do
  case "$decision" in
    keep|keep-with-action-prune)
      [ -d "$path" ] || echo "DRIFT: $path missing but manifest says keep" ;;
    prune)
      [ ! -d "$path" ] || echo "DRIFT: $path exists but manifest says prune" ;;
  esac
done
```

Worth wiring into pre-merge CI once the prune executes.

## What NOT to Do

- **Don't** delete pruned pieces from `upstream/full-pieces`. That's the archive — keep it complete.
- **Don't** modify pruned pieces on `main` (you can't — they're not there). If you find yourself wanting to patch a pruned piece, restore it first.
- **Don't** rebase `upstream/full-pieces` onto `main` (or vice versa). They are intentionally divergent.
- **Don't** let the tracking branch fall more than a year behind upstream — security drift accumulates fast in a 691-piece library.
- **Don't** skip the license re-audit on restoration. Upstream pieces add new dependencies between releases.

## Open Items

1. **Quarterly sync ownership.** Who runs the upstream pull? Default to whoever holds JRNYFLW maintenance.
2. **Drift CI.** Wire the drift check into pre-merge CI once the first prune executes.
3. **Archive retention horizon.** If a piece has been pruned for 3+ years and never restored, is it worth keeping in the tracking branch? Probably yes — cost is near zero. Revisit at year 3.
4. **Customer restoration request workflow.** When a customer asks for a pruned piece, what's the SLA / approval gate? (Founding-team approval seems right for V1 — every restore expands the support surface.)

---

*End of playbook.*
