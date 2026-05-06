# JRNYFLW License Audit — Phase 4

| Field | Value |
|---|---|
| Status | Initial audit complete — pending dispositions on flagged items |
| Date | 2026-05-04 |
| Repo | jrnyflw (Activepieces fork @ v0.82.1) |
| Auditor | AI-assisted, run by Aadil |
| Tool | `license-checker-rseidelsohn --production --json` |
| Sidecar data | `docs/audits/license-audit-data.json` |

---

## 1. Executive Summary

Full per-workspace audit across **702 workspace packages** (9 core + 27 core pieces + 664 community pieces + framework/common/embed-sdk/cli/tests). Distinct dependency packages: **1,051**, of which **350 are external** (the rest are internal `@activepieces/*` workspace packages).

**Headline findings:**

1. **No GPL, AGPL, or SSPL dependencies.** Zero strong-copyleft, zero commercial-distribution blockers in the third-party tree. This is the most important result.
2. **One commercial-distribution blocker exists in-tree, not in third-party deps:** `packages/ee/` is governed by the proprietary **Activepieces Enterprise License** (see §4.1). This must be addressed before commercial distribution of JRNYFLW.
3. **Two weak-copyleft third-party dependencies** (`openpgp` LGPL-3.0+, `exifreader` MPL-2.0). Both are dynamically-linked Node.js modules — usage is permitted under the LGPL/MPL "library" exception inherent to dynamic linking. No relicensing required; attribution and source-availability obligations apply (see §4.2).
4. **Three pieces** depend on the weak-copyleft libraries. They are usable but the obligations must be tracked. Pruning these pieces would eliminate the obligations entirely (see §4.3).
5. **The upstream LICENSE has a carve-out** stating that `packages/ee/` is non-MIT and that all third-party components retain their original licenses. The carve-out is straightforward and matches our findings.

**Disposition summary:**

| Bucket | Count | Disposition |
|---|---|---|
| Permissive (MIT / Apache-2.0 / BSD / ISC / 0BSD / Unlicense / OFL) | 343 external + 701 internal | **Keep** — no action |
| Permissive via disjunction (MIT OR …) | 2 | **Keep** — choose MIT option |
| Weak-copyleft (LGPL-3.0+, MPL-2.0) | 2 | **Keep with obligations** OR prune dependent pieces |
| Strong-copyleft (GPL/AGPL/SSPL) | 0 | n/a |
| Custom / SEE LICENSE / unrecognised | 1 | **Reviewed** — `pako` is `(MIT AND Zlib)`, both permissive |
| In-tree proprietary (`packages/ee/`) | 1 directory | **Blocker** — exclude or relicense before distribution |

---

## 2. Methodology

1. Confirmed `node_modules` populated by `bun install` (workspaces hoisted).
2. Enumerated every workspace package from the root `package.json` `workspaces` field, plus glob expansion of `packages/pieces/{core,community,custom}/*`.
3. Ran `license-checker-rseidelsohn --production --json --excludePrivatePackages` per workspace, capturing each workspace's transitive prod-dep closure.
4. Aggregated results into a single `package@version → { license, repository, used_by_workspaces }` map.
5. Classified each entry into one of: permissive / weak-copyleft / strong-copyleft / strong-copyleft-commercial-blocker / review / unknown.
   - Disjunctive licenses (`A OR B`) — chose the most permissive option.
   - Conjunctive licenses (`A AND B`) — applied the strictest.
6. Cross-checked against the upstream `LICENSE` file's carve-out language for any specifically-flagged components.
7. The "unknown" bucket (703 packages) consists entirely of internal `@activepieces/*` workspace packages that don't declare a `license` field in their own `package.json`. These inherit the project-level license (MIT for everything outside `packages/ee/`). They are not legally unknown.

---

## 3. License Distribution (External Dependencies)

| License | Count |
|---|---|
| MIT | 257 |
| Apache-2.0 | 50 |
| ISC | 13 |
| BSD-3-Clause | 7 |
| BSD-2-Clause | 5 |
| MIT* (auto-detected) | 4 |
| 0BSD | 2 |
| LGPL-3.0+ | 1 (`openpgp`) |
| MPL-2.0 | 1 (`exifreader`) |
| Unlicense | 1 |
| MIT-0 | 1 |
| (MIT OR GPL-3.0-or-later) | 1 (use MIT option) |
| (Apache-2.0 OR MPL-1.1) | 1 (use Apache-2.0 option) |
| (MIT AND Zlib) | 1 (`pako` — both permissive) |
| (OFL-1.1 AND MIT) | 1 |
| Custom: ./LICENSE | 1 (reviewed — see §4.4) |

(Counts approximate; authoritative per-package data in `docs/audits/license-audit-data.json`.)

---

## 4. Items Requiring Attention

### 4.1 BLOCKER — `packages/ee/` Proprietary License

**Issue.** The upstream `LICENSE` file states:

> *"All content that resides under the `packages/ee/` directory of this repository, if that directory exists, is licensed under the license defined in `packages/ee/LICENSE`"*

`packages/ee/LICENSE` is the **Activepieces Enterprise License** — a proprietary commercial licence that prohibits copy, merge, publish, distribute, sublicense, or sale of the software outside a valid Activepieces Enterprise subscription.

**Affected workspace.**

| Workspace | Package name | Notes |
|---|---|---|
| `packages/ee/embed-sdk` | `ee-embed-sdk` | Currently the only EE-licensed code in-tree |

**Disposition options.**

1. **Exclude `packages/ee/` from JRNYFLW distribution** — modify build to omit, remove from workspaces list, delete the directory in the JRNYFLW fork. Since the integration plan (`/home/linqadmin/repo/jrny/docs/jrnyflw-integration-plan.md`) §3.4 commits to *no embedded designer in JRNY shell*, the embed SDK is not on the V1 critical path. **Recommended.**
2. **Negotiate a commercial agreement with Activepieces Inc.** — retains EE features at a per-seat or revenue-share cost. Conflicts with the JRNY pricing model (transparent bucket pricing, all-inclusive — §7.3 of `jrny-vision.md`).
3. **Relicense / rewrite** the embed SDK from scratch under MIT inside JRNYFLW. Only worth it if embed becomes V1 scope later.

**Recommended action.** Remove `packages/ee/` from the JRNYFLW fork. Update root `package.json` `workspaces` to drop `packages/ee/embed-sdk`. Verify nothing in core depends on it (a quick grep should confirm).

### 4.2 Weak-Copyleft Third-Party Dependencies

#### `openpgp@6.3.0` — LGPL-3.0+

- **Used by:** `@activepieces/piece-amazon-s3`, `@activepieces/piece-crypto`
- **Obligations under LGPL-3.0:**
  - Provide attribution and the LGPL text alongside the distributed software.
  - Allow the end user to replace the LGPL-licensed component with a modified version. In Node.js this is satisfied by dynamic `require()` resolution — users can substitute their own `node_modules/openpgp` and the application will use it.
  - If we modify `openpgp` itself, the modifications must be made available under LGPL.
- **Disposition:** **Keep with obligations.** No source-disclosure obligation on JRNYFLW's own code. We do not modify openpgp.
- **Action:** Include `openpgp` and its LGPL notice in the consolidated NOTICES / THIRD-PARTY-LICENSES file shipped with the distribution.

#### `exifreader@4.20.0` — MPL-2.0

- **Used by:** `@activepieces/piece-image-helper`
- **Obligations under MPL-2.0:**
  - File-level copyleft only — modifications to the MPL files themselves must be released under MPL. Code that merely *uses* the library is unaffected.
  - Source code of `exifreader` must be available to recipients (the published npm package satisfies this).
- **Disposition:** **Keep with obligations.** Same NOTICES treatment as above. We do not modify exifreader.

### 4.3 Pieces That Could Be Pruned to Eliminate Weak-Copyleft Obligations

If the eventual JRNYFLW distribution should be 100% permissive (no LGPL/MPL obligations), prune these three pieces:

| Piece | Path | Reason | Recommendation |
|---|---|---|---|
| `@activepieces/piece-crypto` | `packages/pieces/core/crypto` | Uses `openpgp` (LGPL) | **Likely keep** — encryption is core ERP-adjacent functionality. LGPL obligations are minimal in Node.js. |
| `@activepieces/piece-amazon-s3` | `packages/pieces/community/amazon-s3` | Uses `openpgp` (LGPL) for client-side encryption | **Likely keep** — S3 is widely useful; LGPL applies only to the openpgp use. |
| `@activepieces/piece-image-helper` | `packages/pieces/core/image-helper` | Uses `exifreader` (MPL-2.0) | **Prune candidate** — image EXIF reading is unlikely to be on the JRNY use-case path. Pruning eliminates the only MPL dependency in the tree. |

### 4.4 `pako@2.1.0` — `(MIT AND Zlib)`

- **Used by:** `web` (frontend)
- Both MIT and Zlib are permissive. Conjunctive licensing means both apply; both obligations are minimal (attribution only).
- **Disposition:** **Keep, no action beyond attribution.**

---

## 5. Upstream LICENSE Carve-Out Cross-Check

The root `LICENSE` file states three carve-outs:

1. **`packages/ee/` directory** is non-MIT — covered in §4.1 (blocker).
2. **All third-party components** retain their original licenses — this is the standard "we don't relicense our deps" clause. Our audit covers exactly this set (§3, §4.2, §4.3).
3. **Everything else** is MIT (Expat) — JRNYFLW inherits this for the 701 internal workspace packages that don't carry their own license field.

No additional specifically-flagged components in the carve-out language. The carve-out is consistent with our findings.

---

## 6. Recommended Next Steps

1. **Decide on `packages/ee/embed-sdk` disposition** (Option 1 recommended — remove). Action owner: TBD.
2. **Decide on `piece-image-helper` pruning** — remove the only MPL dep, or keep and add to NOTICES.
3. **Generate a `THIRD-PARTY-LICENSES.md` / `NOTICES`** file aggregating attribution text for all 350 external packages. Tooling: `license-checker-rseidelsohn --customPath ... --files` or similar can dump license texts.
4. **Add a CI gate** that fails the build if a new dependency introduces GPL/AGPL/SSPL. Tooling: `license-checker --failOn 'GPL;AGPL;SSPL'` in pre-merge CI.
5. **Re-run this audit** after any prune/upgrade phase before commercial release.

---

## Appendix A — Internal `@activepieces/*` Workspace Packages (701)

These declare no `license` field in their own `package.json` and inherit the upstream MIT license (since none reside under `packages/ee/`). Listed for completeness.


| Package | Inherited license |
|---|---|
| `@activepieces/cli@1.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/engine@0.7.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-activecampaign@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-activepieces@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-actualbudget@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-acuity-scheduling@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-acumbamail@0.2.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-afforai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-agentx@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ai@0.4.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-aianswer@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-aidbase@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-aiprise@0.1.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-air-ops@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-aircall@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-airparser@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-airtable@0.6.7` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-airtop@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-alai@0.1.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-algolia@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-alt-text-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-alttextify@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-amazon-bedrock@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-amazon-s3@0.5.8` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-amazon-secrets-manager@0.0.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-amazon-ses@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-amazon-sns@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-amazon-sqs@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-amazon-textract@0.3.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-aminos@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ampeco@0.2.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-anyhook-graphql@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-anyhook-websocket@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-apify@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-apitable@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-apitemplate-io@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-apollo@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-appfollow@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-approval@0.1.19` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-asana@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ashby@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ask-handle@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-asknews@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-assembled@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-assemblyai@1.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-attio@0.1.17` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-autocalls@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-avian@0.0.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-avoma@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-azure-ad@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-azure-blob-storage@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-azure-communication-services@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-azure-openai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-backblaze@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bamboohr@0.2.8` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bannerbear@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-barcode-lookup@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-baremetrics@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-base44@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-baserow@0.9.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-beamer@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-beehiiv@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bettermode@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bexio@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bigcommerce@0.1.7` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bigin-by-zoho@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bika@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-billplz@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-binance@0.4.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bitly@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bland-ai@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-blockscout@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bluesky@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bokio@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bolna@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bonjoro@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bookedin@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-box@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-brave-search@0.0.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-brilliant-directories@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-browse-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-browserless@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bubble@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bumpups@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-bursty-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-buttondown@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cal-com@0.4.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-calendly@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-camb-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-campaign-monitor@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-canny@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-capsule-crm@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-captain-data@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-carbone@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cartloom@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cashfree-payments@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-certopus@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chain-aware@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chainalysis-api@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chaindesk@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chargebee@0.0.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chargekeep@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chartly@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chat-aid@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chat-data@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chatbase@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chatfly@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chatling@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chatnode@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chatsistant@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-chatwoot@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-checkout@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-circle@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clarifai@0.3.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-claude@0.4.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clearout@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clearoutphone@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clicdata@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clickfunnels@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clicksend@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clickup@0.7.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clockify@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-clockodo@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-close@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cloudconvert@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cloudinary@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cloutly@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-coda@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cody@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cognito-forms@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cohere@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cometapi@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-comfyicu@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-confluence@0.2.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-connections@0.5.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-constant-contact@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-contentful@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-contextual-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-contiguity@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-convertkit@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-copper@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-copy-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-coralogix@0.1.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-couchbase@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-crisp@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-crypto@0.0.20` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cryptolens@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-csv@0.4.13` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cursor@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-customer-io@0.3.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-customgpt@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-cyberark@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-dappier@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-dashworks@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-data-mapper@0.3.15` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-data-summarizer@0.0.10` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-datadog@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-datafuel@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-date-helper@0.1.27` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-datocms@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-deepgram@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-deepl@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-deepseek@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-delay@0.3.27` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-denser-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-detecting-ai@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-devin@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-digital-ocean@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-digital-pilot@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-dimo@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-discord@0.5.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-discourse@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-dittofeed@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-docsbot@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-doctly@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-documentpro@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-documerge@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-docusign@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-drip@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-dropbox@0.7.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-drupal@1.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-dub@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-duckdb@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-dumpling-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-dust@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-easy-peasy-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-echowin@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-eden-ai@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-elastic-email@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-elevenlabs@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-emailit@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-emailoctopus@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-enrichlayer@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-esignatures@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-eth-name-service@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-everhour@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-exa@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-extracta-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-facebook-leads@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-facebook-pages@0.2.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-famulor@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fathom-analytics@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fathom@0.2.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-feathery@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fellow@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-figma@0.5.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-file-helper@0.1.23` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fillout-forms@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fireberry@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-firecrawl@0.3.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fireflies-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-flipando@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fliqr-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-flow-helper@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-flow-parser@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-flowise@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-flowlu@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-folk@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-foreplay-co@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-formbricks@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-formitable@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-forms@0.4.14` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-formsite@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-formspark@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-formstack@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fountain@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-fragment@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-frame@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-free-agent@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-freshdesk@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-freshsales@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-freshservice@0.0.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-front@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gameball@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gamma@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gcloud-pubsub@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gender-api@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-generatebanners@0.4.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-getresponse@0.0.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ghostcms@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-giftbit@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gistly@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gitea@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-github@0.7.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gitlab@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gladia@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-glide@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gmail@0.12.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-goodmem@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-bigquery@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-calendar@0.9.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-cloud-storage@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-contacts@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-docs@0.4.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-drive@0.7.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-forms@0.5.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-gemini@0.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-my-business@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-search-console@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-search@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-sheets@0.14.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-slides@0.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-tasks@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-google-vertexai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-googlechat@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gotify@0.4.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gptzero-detect-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-granola@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-graphql@0.0.11` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-gravityforms@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-greenhouse@0.0.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-greenpt@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-greip@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-griptape@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-grist@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-grok-xai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-groq@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-guidelite@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hackernews@0.4.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-harvest@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hashi-corp-vault@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hastewire@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-heartbeat@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hedy@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-help-scout@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-heygen@0.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-heymarket-sms@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-housecall-pro@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-http-oauth2@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-http@0.11.9` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hubspot@0.8.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hugging-face@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hume-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hunter@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-hystruct@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ibm-cognose@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-image-helper@0.1.12` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-image-router@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-imap@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-influencers-club@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-insightly@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-insighto-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-insta-charts@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-instabase@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-instagram-business@0.2.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-instantly-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-instasent@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-intercom@0.7.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-intruder@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-invoiceninja@0.3.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-jina-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-jira-cloud@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-jira-data-center@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-jogg-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-jotform@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-json@0.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-just-invoice@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-kallabot-ai@0.4.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-kapso@0.0.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-katana@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-kimai@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-kissflow@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-kizeo-forms@0.4.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-klaviyo@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-klenty@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-knack@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-knock@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ko-fi@0.0.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-kommo@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-krisp-call@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-kudosity@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-kustomer@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lead-connector@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-leap-ai@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-leexi@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lemlist@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lemon-squeezy@0.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lets-calendar@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-letta@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lever@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lightfunnels@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-line@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-linear@0.4.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-linka@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-linkedin@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-linkup@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-livesession@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-llmrails@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lobstermail@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-localai@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lofty@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-logrocket@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-logsnag@0.0.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lokalise@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-loops@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lucidya@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-lusha@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-luxury-presence@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-magical-api@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-magicslides@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mailchain@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mailchimp@0.5.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mailer-lite@0.6.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mailercheck@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-maileroo@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mailgun@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mailjet@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-manual-trigger@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-manus@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-manychat@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mastodon@0.5.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-math-helper@0.0.21` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-matomo@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-matrix@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mattermost@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mautic@0.5.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mcp@0.0.17` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-medullar@0.3.3` | MIT* |
| `@activepieces/piece-meetgeek-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-meistertask@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mem@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mempool-space@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-messagebird@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-metabase@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-metatext@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-365-people@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-365-planner@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-copilot@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-dynamics-365-business-central@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-dynamics-crm@0.3.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-excel-365@0.6.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-onedrive@0.3.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-onenote@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-outlook-calendar@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-outlook@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-power-bi@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-sharepoint@0.3.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-teams@0.5.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-microsoft-todo@0.3.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-millionverifier@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mind-studio@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mindee@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-missive@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mistral-ai@0.2.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mixmax@0.0.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mixpanel@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-modelslab@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mollie@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-monday@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mongodb@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-moonclerk@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mooninvoice@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-motion@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-motiontools@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-moveo-ai@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-moxie-crm@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-murf-api@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mycase-piece@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mysendingbox@0.0.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-mysql@0.2.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-netlify@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-netsuite@0.1.7` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-neverbounce@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-nifty@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ninjapipe@0.0.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ninox@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-nocodb@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-notion@0.6.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ntfy@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-nuelink@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-octopush-sms@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-odoo@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-okta@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-omni-co@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-omnihr@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-oncehub@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-oneclickimpact@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-onfleet@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-open-phone@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-open-router@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-openai@0.8.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-openmic-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-opnform@0.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-opportify@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-oracle-database@0.1.8` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-oracle-fusion-cloud-erp@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-orimon@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-outseta@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-paddle@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pagerduty@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pandadoc@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-paperform@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-parser-expert@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-parseur@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pastebin@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pastefy@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-paywhirl@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pdf-co@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pdf@0.5.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pdfcrowd@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pdfmonkey@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-peekshot@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-perplexity-ai@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-personal-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-phantombuster@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-phone-validator@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-photoroom@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pinch-payments@0.0.7` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pinecone@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pinterest@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pipedrive@0.8.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-placid@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-plausible@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pocketbase@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-podio@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pollybot-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-poper@0.2.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-postgres@0.2.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-posthog@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-postiz@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-predict-leads@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-predis-ai@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-presentation@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-productboard@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-promotekit@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-prompthub@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-promptmate@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pushbullet@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pushover@0.2.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-pylon@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-qawafel@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-qdrant@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-qrcode@0.0.12` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-quaderno@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-queue@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-quickbase@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-quickbooks@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-quickzu@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-qwilr@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-rabbitmq@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-raia-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-rapidtext-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-razorpay@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-reachinbox@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-recall-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-recurly@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-reddit@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-reoon-verifier@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-reply-io@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-resend@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-respaid@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-respond-io@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-retable@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-retell-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-retune@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-returning-ai@0.2.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-robolly@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-roe-ai@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-rounded-studio@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-rss@0.5.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-runware@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-runway@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-saastic@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-saleor@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-salesforce@0.7.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sap-ariba@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sardis@0.1.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-savvycal@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-scenario@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-schedule@0.1.17` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-scrapegrapghai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-scrapeless@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-seek-table@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-segment@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-send-it@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sender@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sendfox@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sendgrid@0.5.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sendinblue@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sendpulse@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sendy@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-senja@0.0.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-serp-api@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-serpstat@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-service-now@0.2.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sessions-us@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-seven@0.1.3` | MIT* |
| `@activepieces/piece-sftp@0.5.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-shippo@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-shopify@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-short-io@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sign-now@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-signrequest@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-simplepdf@1.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-simpliroute@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-simplybookme@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sitespeakai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-skyprep@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-skyvern@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-slack@0.17.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-slidespeak@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-smaily@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-smartlead@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-smartsheet@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-smartsuite@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-smoove@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-smsmode@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-smtp@0.4.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-snowflake@0.3.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-soap@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-socialkit@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-softr@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-sperse@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-splitwise@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-spotify@0.5.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-square@0.4.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-stability-ai@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-stable-diffusion-webui@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-store@0.6.14` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-straico@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-strale@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-stripe@0.6.7` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-subflows@0.4.12` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-supabase@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-supadata@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-surrealdb@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-surveymonkey@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-surveytale@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-swarmnode@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-synthesia@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-systeme-io@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tableau@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tables@0.3.0` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tags@0.0.17` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-talkable@0.2.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tally@0.4.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tapfiliate@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tarvent@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-taskade@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tavily@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-teable@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-teamleader@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-teamwork@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-telegram-bot@0.5.7` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-telnyx@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tenzo@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-text-helper@0.4.15` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-textcortex-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-thankster@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-ticktick@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tidely@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tidycal@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-time-ops@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-timelines-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tiny-talk-ai@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-tl-dv@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-todoist@0.4.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-toggl-track@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-totalcms@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-trello@0.4.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-truelayer@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-twenty@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-twilio@0.4.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-twin-labs@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-twitch@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-twitter@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-typeform@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-typefully@0.1.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-umami@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-upgradechat@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-uscreen@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vadoo-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-validatedmails@0.0.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-valyu@0.0.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vapi@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vbout@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vercel@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vero@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-videoask@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vidlab7@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vidnoz@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-village@0.3.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vimeo@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-visible@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vlm-run@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-voipstudio@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vouchery-io@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vtex@0.2.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-vtiger@1.3.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-wafeq@0.0.1` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-waitwhile@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-wealthbox@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-webex@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-webflow@0.2.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-webhook@0.1.33` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-webling@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-webscraping-ai@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-wedof@1.4.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-week-done@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-what-converts@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-whatsable@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-whatsapp@0.2.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-whatsscale@0.0.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-wonderchat@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-woocommerce@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-woodpecker@0.0.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-wootric@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-wordpress@0.4.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-workable@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-workday@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-wrike@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-writesonic-bulk@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-wufoo@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-xero@0.6.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-xml@0.1.13` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-youcanbookme@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-youform@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-youtube@0.4.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zagomail@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zendesk-sell@0.1.4` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zendesk@0.2.7` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zeplin@0.0.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zerobounce@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoho-bookings@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoho-books@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoho-campaigns@0.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoho-crm@0.2.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoho-desk@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoho-invoice@0.1.5` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoho-mail@0.1.6` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoo@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zoom@0.6.2` | MIT (inherited, root LICENSE) |
| `@activepieces/piece-zuora@0.1.3` | MIT (inherited, root LICENSE) |
| `@activepieces/pieces-common@0.12.1` | MIT (inherited, root LICENSE) |
| `@activepieces/pieces-common@0.12.3` | MIT (inherited, root LICENSE) |
| `@activepieces/pieces-framework@0.26.2` | MIT (inherited, root LICENSE) |
| `@activepieces/pieces-framework@0.28.1` | MIT (inherited, root LICENSE) |
| `@activepieces/server-utils@0.1.2` | MIT (inherited, root LICENSE) |
| `@activepieces/shared@0.57.2` | MIT (inherited, root LICENSE) |
| `@activepieces/shared@0.67.1` | MIT (inherited, root LICENSE) |
| `@activepieces/shared@0.70.0` | MIT (inherited, root LICENSE) |

---

## Appendix B — External Permissive Dependencies (343)

| Package | License |
|---|---|
| `@1password/sdk@0.4.0` | MIT |
| `@actual-app/api@25.3.1` | MIT |
| `@ai-sdk/amazon-bedrock@3.0.97` | Apache-2.0 |
| `@ai-sdk/anthropic@3.0.67` | Apache-2.0 |
| `@ai-sdk/anthropic@3.0.72` | Apache-2.0 |
| `@ai-sdk/azure@3.0.52` | Apache-2.0 |
| `@ai-sdk/azure@3.0.55` | Apache-2.0 |
| `@ai-sdk/google-vertex@3.0.133` | Apache-2.0 |
| `@ai-sdk/google@3.0.59` | Apache-2.0 |
| `@ai-sdk/google@3.0.65` | Apache-2.0 |
| `@ai-sdk/mcp@1.0.11` | Apache-2.0 |
| `@ai-sdk/openai-compatible@2.0.16` | Apache-2.0 |
| `@ai-sdk/openai@3.0.51` | Apache-2.0 |
| `@ai-sdk/openai@3.0.54` | Apache-2.0 |
| `@ai-sdk/provider-utils@4.0.23` | Apache-2.0 |
| `@ai-sdk/provider@3.0.9` | Apache-2.0 |
| `@ai-sdk/react@3.0.156` | Apache-2.0 |
| `@ai-sdk/replicate@2.0.8` | Apache-2.0 |
| `@anthropic-ai/sdk@0.39.0` | MIT |
| `@atlaskit/adf-schema@50.4.0` | Apache-2.0 |
| `@atlaskit/editor-json-transformer@8.27.2` | Apache-2.0 |
| `@atlaskit/editor-markdown-transformer@5.16.6` | MIT |
| `@atproto/api@0.16.0` | MIT |
| `@authenio/samlify-node-xmllint@2.0.0` | MIT |
| `@aws-crypto/sha256-js@5.2.0` | Apache-2.0 |
| `@aws-sdk/client-bedrock-runtime@3.1039.0` | Apache-2.0 |
| `@aws-sdk/client-bedrock@3.1017.0` | Apache-2.0 |
| `@aws-sdk/client-s3@3.974.0` | Apache-2.0 |
| `@aws-sdk/client-secrets-manager@3.989.0` | Apache-2.0 |
| `@aws-sdk/client-secrets-manager@3.997.0` | Apache-2.0 |
| `@aws-sdk/client-ses@3.864.0` | Apache-2.0 |
| `@aws-sdk/client-sns@3.726.1` | Apache-2.0 |
| `@aws-sdk/client-sqs@3.1039.0` | Apache-2.0 |
| `@aws-sdk/client-textract@3.1039.0` | Apache-2.0 |
| `@aws-sdk/s3-request-presigner@3.894.0` | Apache-2.0 |
| `@azure/communication-email@1.0.0` | MIT |
| `@azure/identity@4.13.0` | MIT |
| `@azure/openai@1.0.0-beta.11` | MIT |
| `@azure/storage-blob@12.29.1` | MIT |
| `@base44/sdk@0.8.27` | MIT |
| `@bull-board/api@6.10.1` | MIT |
| `@bull-board/fastify@6.10.1` | MIT |
| `@codemirror/commands@6.10.3` | MIT |
| `@codemirror/lang-javascript@6.2.2` | MIT |
| `@codemirror/lang-json@6.0.1` | MIT |
| `@codemirror/language@6.12.3` | MIT |
| `@codemirror/state@6.6.0` | MIT |
| `@codemirror/view@6.40.0` | MIT |
| `@datadog/datadog-api-client@1.57.0` | Apache-2.0 |
| `@dnd-kit/core@6.1.0` | MIT |
| `@dnd-kit/modifiers@7.0.0` | MIT |
| `@dnd-kit/sortable@8.0.0` | MIT |
| `@dnd-kit/utilities@3.2.2` | MIT |
| `@duckdb/node-api@1.4.3-r.2` | MIT |
| `@dust-tt/client@1.0.57` | ISC |
| `@electric-sql/pglite@0.3.14` | Apache-2.0 |
| `@elevenlabs/elevenlabs-js@2.4.1` | MIT |
| `@fastify/basic-auth@6.2.0` | MIT |
| `@fastify/cors@11.0.1` | MIT |
| `@fastify/formbody@8.0.2` | MIT |
| `@fastify/http-proxy@11.3.0` | MIT |
| `@fastify/multipart@9.0.3` | MIT |
| `@fastify/otel@0.9.3` | MIT |
| `@fastify/rate-limit@10.3.0` | MIT |
| `@fastify/reply-from@12.6.1` | MIT |
| `@fastify/static@8.1.0` | MIT |
| `@fastify/swagger@9.5.1` | MIT |
| `@google/genai@1.29.0` | Apache-2.0 |
| `@google/genai@1.43.0` | Apache-2.0 |
| `@google/generative-ai@0.21.0` | Apache-2.0 |
| `@hookform/resolvers@5.2.2` | MIT |
| `@hubspot/api-client@12.0.1` | ISC |
| `@huggingface/inference@4.7.1` | MIT |
| `@huggingface/tasks@0.19.85` | MIT |
| `@hyperdx/node-opentelemetry@0.8.2` | MIT |
| `@kapso/whatsapp-cloud-api@0.1.1` | MIT |
| `@letta-ai/letta-client@1.3.1` | Apache-2.0 |
| `@linear/sdk@7.0.1` | MIT |
| `@mailchain/sdk@0.31.0` | Apache-2.0 |
| `@mailchimp/mailchimp_marketing@3.0.80` | Apache-2.0* |
| `@mailerlite/mailerlite-nodejs@1.1.0` | MIT |
| `@microsoft/microsoft-graph-client@3.0.7` | MIT |
| `@microsoft/microsoft-graph-types@2.40.0` | MIT |
| `@modelcontextprotocol/sdk@1.26.0` | MIT |
| `@modelcontextprotocol/sdk@1.27.1` | MIT |
| `@notionhq/client@2.2.14` | MIT |
| `@onfleet/node-onfleet@1.3.3` | MIT |
| `@openrouter/ai-sdk-provider@2.1.1` | Apache-2.0 |
| `@openrouter/sdk@0.2.9` | Apache-2.0 |
| `@opentelemetry/api-logs@0.206.0` | Apache-2.0 |
| `@opentelemetry/api@1.9.0` | Apache-2.0 |
| `@opentelemetry/auto-instrumentations-node@0.65.0` | Apache-2.0 |
| `@opentelemetry/exporter-metrics-otlp-http@0.206.0` | Apache-2.0 |
| `@opentelemetry/exporter-metrics-otlp-proto@0.206.0` | Apache-2.0 |
| `@opentelemetry/exporter-trace-otlp-http@0.206.0` | Apache-2.0 |
| `@opentelemetry/resources@2.1.0` | Apache-2.0 |
| `@opentelemetry/sdk-logs@0.206.0` | Apache-2.0 |
| `@opentelemetry/sdk-metrics@2.1.0` | Apache-2.0 |
| `@opentelemetry/sdk-node@0.206.0` | Apache-2.0 |
| `@opentelemetry/sdk-trace-base@2.1.0` | Apache-2.0 |
| `@opentelemetry/semantic-conventions@1.37.0` | Apache-2.0 |
| `@pinecone-database/pinecone@6.1.4` | Apache-2.0 |
| `@qdrant/js-client-rest@1.7.0` | Apache-2.0 |
| `@radix-ui/react-use-controllable-state@1.2.2` | MIT |
| `@runware/sdk-js@1.1.44` | ISC |
| `@runwayml/sdk@2.9.0` | Apache-2.0 |
| `@scrapeless-ai/sdk@1.5.1` | MIT |
| `@segment/analytics-next@1.72.0` | MIT |
| `@segment/analytics-node@2.2.0` | MIT |
| `@sentry/node@7.120.0` | MIT |
| `@slack/web-api@7.9.0` | MIT |
| `@smithy/node-http-handler@4.4.14` | Apache-2.0 |
| `@smithy/protocol-http@5.3.8` | Apache-2.0 |
| `@smithy/signature-v4@5.3.8` | Apache-2.0 |
| `@socket.io/redis-adapter@8.3.0` | MIT |
| `@supabase/supabase-js@2.49.9` | MIT |
| `@tanstack/query-db-collection@1.0.12` | MIT |
| `@tanstack/react-db@0.1.60` | MIT |
| `@tanstack/react-query@5.51.1` | MIT |
| `@tanstack/react-table@8.19.2` | MIT |
| `@tanstack/react-virtual@3.13.11` | MIT |
| `@tiptap/core@3.15.3` | MIT |
| `@tiptap/extension-bold@3.15.3` | MIT |
| `@tiptap/extension-document@3.15.3` | MIT |
| `@tiptap/extension-hard-break@3.15.3` | MIT |
| `@tiptap/extension-history@3.15.3` | MIT |
| `@tiptap/extension-image@3.15.3` | MIT |
| `@tiptap/extension-italic@3.15.3` | MIT |
| `@tiptap/extension-list@3.15.3` | MIT |
| `@tiptap/extension-mention@3.15.3` | MIT |
| `@tiptap/extension-paragraph@3.15.3` | MIT |
| `@tiptap/extension-placeholder@3.15.3` | MIT |
| `@tiptap/extension-strike@3.15.3` | MIT |
| `@tiptap/extension-table@3.15.3` | MIT |
| `@tiptap/extension-text@3.15.3` | MIT |
| `@tiptap/extension-underline@3.15.3` | MIT |
| `@tiptap/extensions@3.15.3` | MIT |
| `@tiptap/markdown@3.15.3` | MIT |
| `@tiptap/react@3.15.3` | MIT |
| `@tiptap/starter-kit@3.15.3` | MIT |
| `@tryfabric/martian@1.2.4` | ISC |
| `@uiw/codemirror-theme-github@4.25.7` | MIT |
| `@uiw/react-codemirror@4.25.7` | MIT |
| `@xyflow/react@12.3.5` | MIT |
| `@zip.js/zip.js@2.8.26` | BSD-3-Clause |
| `ai-gateway-provider@3.1.1` | MIT |
| `ai@6.0.149` | Apache-2.0 |
| `ai@6.0.170` | Apache-2.0 |
| `airtable@0.11.6` | MIT |
| `ajv@8.18.0` | MIT |
| `amqplib@0.10.7` | MIT |
| `apify-client@2.22.2` | Apache-2.0 |
| `assemblyai@4.7.0` | MIT |
| `async-mutex@0.4.0` | MIT |
| `axios-retry@4.4.1` | Apache-2.0 |
| `axios@1.15.0` | MIT |
| `basic-ftp@5.2.2` | MIT |
| `bcrypt@6.0.0` | MIT |
| `boring-avatars@1.11.2` | MIT |
| `buffer@6.0.3` | MIT |
| `bullmq-otel@1.0.1` | MIT |
| `bullmq@5.61.0` | MIT |
| `canvas-confetti@1.9.4` | ISC |
| `chalk@4.1.2` | MIT |
| `check-disk-space@3.4.0` | MIT |
| `cheerio@1.0.0-rc.12` | MIT |
| `chokidar@4.0.3` | MIT |
| `clarifai-nodejs-grpc@11.3.3` | Apache-2.0 |
| `class-variance-authority@0.7.1` | Apache-2.0 |
| `clear-module@4.1.2` | MIT |
| `clsx@2.1.1` | MIT |
| `cmdk@1.1.1` | MIT |
| `commander@11.1.0` | MIT |
| `content-disposition@0.5.4` | MIT |
| `contentful-management@11.48.1` | MIT |
| `contextual-client@0.10.0` | Apache-2.0 |
| `couchbase@4.7.0` | Apache-2.0 |
| `cron-validator@1.3.1` | MIT |
| `cronstrue@2.31.0` | MIT |
| `crypto-js@4.2.0` | MIT |
| `csv-parse@5.6.0` | MIT |
| `csv-stringify@6.5.2` | MIT |
| `date-fns@4.1.0` | MIT |
| `dayjs@1.11.9` | MIT |
| `decompress@4.2.1` | MIT |
| `deep-equal@2.2.2` | MIT |
| `deepmerge-ts@7.1.0` | BSD-3-Clause |
| `docusign-esign@8.1.0` | MIT |
| `dotenv@16.4.7` | BSD-2-Clause |
| `dotenv@17.2.3` | BSD-2-Clause |
| `embla-carousel-react@8.6.0` | MIT |
| `env-var@7.5.0` | MIT |
| `ethers@6.15.0` | MIT |
| `fast-average-color@9.5.0` | MIT |
| `fast-xml-parser@4.5.5` | MIT |
| `fast-xml-parser@5.5.7` | MIT |
| `fast-xml-parser@5.7.2` | MIT |
| `fastify-favicon@5.0.0` | Apache-2.0 |
| `fastify-plugin@5.0.1` | MIT |
| `fastify-raw-body@5.0.0` | MIT |
| `fastify-socket@5.1.2` | MIT* |
| `fastify-type-provider-zod@6.1.0` | MIT |
| `fastify@5.8.3` | MIT |
| `feedparser@2.2.10` | MIT |
| `fetch-retry@6.0.0` | MIT |
| `firebase-scrypt@2.2.0` | MIT |
| `form-data@4.0.4` | MIT |
| `fuse.js@7.0.0` | Apache-2.0 |
| `gaxios@6.7.1` | Apache-2.0 |
| `google-auth-library@10.6.1` | Apache-2.0 |
| `google-auth-library@8.9.0` | Apache-2.0 |
| `googleapis-common@7.2.0` | Apache-2.0 |
| `googleapis@129.0.0` | Apache-2.0 |
| `http-proxy-agent@7.0.2` | MIT |
| `http-status-codes@2.2.0` | MIT |
| `https-proxy-agent@7.0.4` | MIT |
| `https-proxy-agent@7.0.6` | MIT |
| `hume@0.15.16` | MIT* |
| `i18next-browser-languagedetector@8.0.0` | MIT |
| `i18next-http-backend@2.5.2` | MIT |
| `i18next-icu@2.3.0` | MIT |
| `i18next@23.13.0` | MIT |
| `imapflow@1.0.200` | MIT |
| `inquirer@8.2.7` | MIT |
| `intercom-client@6.2.0` | Apache-2.0 |
| `ioredis@5.4.1` | MIT |
| `ipaddr.js@2.3.0` | MIT |
| `isolated-vm@6.0.2` | ISC |
| `jimp@0.22.12` | MIT |
| `jsdom@24.1.3` | MIT |
| `json2xml@0.1.3` | MIT |
| `jsonata@2.1.0` | MIT |
| `jsonwebtoken@9.0.1` | MIT |
| `jszip@3.10.1` | (MIT OR GPL-3.0-or-later) |
| `jwks-rsa@3.1.0` | MIT |
| `jwt-decode@4.0.0` | MIT |
| `lodash@4.18.1` | MIT |
| `lottie-web@5.12.2` | MIT |
| `lucide-react@0.576.0` | ISC |
| `mailparser@3.9.3` | MIT |
| `mammoth@1.11.0` | BSD-2-Clause |
| `marked@18.0.2` | MIT |
| `marked@4.3.0` | MIT |
| `mime-types@2.1.35` | MIT |
| `monday-sdk-js@0.5.2` | MIT |
| `mongodb@6.15.0` | Apache-2.0 |
| `motion@12.35.0` | MIT |
| `mustache@4.2.0` | MIT |
| `nanoid@3.3.8` | MIT |
| `node-cache@5.1.2` | MIT |
| `node-cron@3.0.3` | ISC |
| `nodemailer@8.0.5` | MIT-0 |
| `notion-to-md@3.1.1` | ISC |
| `object-sizeof@2.6.3` | MIT |
| `openai@4.67.1` | Apache-2.0 |
| `oracledb@6.10.0` | (Apache-2.0 OR UPL-1.0) |
| `p-limit@2.3.0` | MIT |
| `papaparse@5.5.3` | MIT |
| `pdf-lib@1.17.1` | MIT |
| `pg-format@1.0.4` | MIT |
| `pg@8.11.3` | MIT |
| `pino-loki@2.1.3` | MIT |
| `pino-pretty@13.0.0` | MIT |
| `pino@10.1.0` | MIT |
| `playwright@1.56.0` | Apache-2.0 |
| `posthog-js@1.195.0` | MIT |
| `pretty-bytes@7.1.0` | MIT |
| `promise-mysql@5.2.0` | MIT |
| `proxy-chain@2.7.1` | Apache-2.0 |
| `qrcode@1.5.4` | MIT |
| `qs@6.14.2` | BSD-3-Clause |
| `radix-ui@1.4.3` | MIT |
| `react-colorful@5.6.1` | MIT |
| `react-data-grid@7.0.0-beta.47` | MIT |
| `react-day-picker@9.14.0` | MIT |
| `react-dom@19.2.5` | MIT |
| `react-error-boundary@5.0.0` | MIT |
| `react-hook-form@7.71.2` | MIT |
| `react-i18next@15.0.1` | MIT |
| `react-json-view@1.21.3` | MIT |
| `react-markdown@9.0.1` | MIT |
| `react-resizable-panels@4.7.0` | MIT |
| `react-router-dom@6.11.2` | MIT |
| `react-textarea-autosize@8.5.5` | MIT |
| `react-use@17.5.1` | Unlicense |
| `react@19.2.5` | MIT |
| `recharts@2.15.4` | MIT |
| `recurly@4.73.0` | MIT |
| `redis-memory-server@0.15.0` | MIT |
| `redlock@5.0.0-beta.2` | MIT |
| `remark-breaks@4.0.0` | MIT |
| `remark-gfm@4.0.0` | MIT |
| `request-filtering-agent@3.2.0` | MIT |
| `safe-flat@2.1.0` | MIT |
| `samlify@2.10.0` | MIT |
| `semver@7.6.0` | ISC |
| `shiki@4.0.2` | MIT |
| `showdown@2.1.0` | MIT |
| `simple-git@3.33.0` | MIT |
| `slackify-markdown@4.4.0` | MIT |
| `slugify@1.6.6` | MIT |
| `snowflake-sdk@2.3.4` | Apache-2.0 |
| `soap@1.1.10` | MIT |
| `socket.io-client@4.8.1` | MIT |
| `socket.io@4.7.5` | MIT |
| `socket.io@4.8.1` | MIT |
| `sonner@2.0.7` | MIT |
| `sql-formatter@15.6.10` | MIT |
| `sqlite3@5.1.7` | BSD-3-Clause |
| `sqlstring@2.3.3` | MIT |
| `ssh2-sftp-client@9.1.0` | Apache-2.0 |
| `ssh2@1.16.0` | MIT |
| `string-strip-html@8.5.0` | MIT |
| `stripe@18.2.1` | MIT |
| `supergateway@3.4.3` | MIT* |
| `systeminformation@5.25.11` | MIT |
| `tailwind-merge@2.4.0` | MIT |
| `tailwind-scrollbar@4.0.2` | MIT |
| `tiktoken@1.0.11` | MIT |
| `tiny-lru@11.4.7` | BSD-3-Clause |
| `tinycolor2@1.6.0` | MIT |
| `tree-kill@1.2.2` | MIT |
| `tslib@2.6.2` | 0BSD |
| `turndown@7.2.0` | MIT |
| `tw-animate-css@1.4.0` | MIT |
| `twitter-api-v2@1.15.1` | Apache-2.0 |
| `typeorm-pglite@0.3.2` | MIT |
| `typeorm@0.3.28` | MIT |
| `undici@7.24.6` | MIT |
| `unpdf@1.4.0` | MIT |
| `url@0.11.3` | MIT |
| `use-debounce@10.0.1` | MIT |
| `use-deep-compare-effect@1.8.1` | MIT |
| `use-ripple-hook@1.0.24` | ISC |
| `use-stick-to-bottom@1.1.3` | MIT |
| `vaul@1.1.2` | MIT |
| `wav@1.0.2` | MIT |
| `write-file-atomic@5.0.1` | ISC |
| `xml2js@0.6.2` | MIT |
| `xmlrpc@1.3.2` | MIT |
| `zod@3.25.76` | MIT |
| `zod@4.3.6` | MIT |
| `zustand@4.5.4` | MIT |

---

*End of license audit. Authoritative machine-readable data in `docs/audits/license-audit-data.json`.*
