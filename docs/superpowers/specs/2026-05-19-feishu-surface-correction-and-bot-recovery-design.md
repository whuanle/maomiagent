# Feishu Surface Correction And Bot Recovery Design

Date: 2026-05-19
Status: Draft for review
Owner: Codex

## 1. Context

The current Feishu page in [apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.tsx](apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.tsx) exposes three product surfaces:

- `个人文档 MCP`
- `飞书机器人`
- `飞书智能助手`

That is already known to be directionally wrong.

The user explicitly confirmed that `个人文档 MCP` had already been removed from the product direction before the recovery work. However, the current branch reintroduced it through the Feishu recovery commit `9df77d2` with the message:

- `feat(feishu): recover personal docs and simplify desktop auth flow`

At the same time, the Feishu bot surface is visibly not trustworthy yet:

- webhook state is showing failure
- image handling is surfacing `No endpoints found that support image input`
- the UI cannot yet be treated as proof that the bot runtime chain is correctly restored

The smart assistant surface has not been re-verified yet, and the user also suspects multilingual support has regressed or disappeared.

## 2. Problem Statement

The current Feishu recovery mixed together three different concerns:

1. a product-surface rollback that should not have happened (`个人文档 MCP`)
2. a bot runtime chain that is still not credibly restored
3. a smart-assistant / multilingual surface whose completeness is unknown

These cannot continue to be treated as one broad Feishu recovery batch.

This pass must first correct the product surface, then narrow onto bot recoverability, and only after that audit the smart assistant and multilingual state.

## 3. Goals

- Remove `个人文档 MCP` from the Feishu page surface and default page state.
- Keep Feishu product exposure limited to:
  - `飞书机器人`
  - `飞书智能助手`
- Preserve underlying personal-docs compatibility code temporarily where needed, so product-surface correction does not break shared docs capabilities prematurely.
- Recover the Feishu bot toward a minimal credible runtime chain:
  - configuration and state reporting align with actual runtime behavior
  - webhook handling is diagnosable and not falsely optimistic
  - image messages auto-fallback to a visual-capable model when the configured model lacks image support
- Audit, but do not immediately over-expand, the smart assistant and multilingual surfaces after bot work stabilizes.

## 4. Non-Goals

- No attempt to restore or improve `个人文档 MCP` as a user-facing Feishu surface.
- No broad Feishu rewrite.
- No simultaneous redesign of bot, smart assistant, and multilingual UX in one pass.
- No deletion of all personal-docs code on day one if that risks breaking shared docs capability paths.
- No assumption that current visible Feishu UI means the runtime chain is healthy.

## 5. Approaches Considered

### Approach A: Keep personal docs visible and only fix the bot

Pros:

- shortest path to bot-only runtime work
- lower immediate edit count

Cons:

- keeps a known-wrong product surface in front of users
- continues reinforcing a recovery direction the user has already rejected
- makes future Feishu verification noisier because the product surface remains contaminated

### Approach B: Correct the product surface first, then recover the bot, then audit assistant/i18n

Pros:

- immediately removes the clearest product-direction regression
- separates concerns into distinct, testable passes
- prevents further repair work from layering onto a surface that should not exist
- matches the user’s confirmed priority order

Cons:

- requires some short-term compatibility code to stay in place behind the UI
- bot work starts one step later than a purely runtime-first approach

### Approach C: Delete personal-docs UI and all underlying personal-docs code in one pass, then fix bot

Pros:

- most aggressive cleanup
- least chance of hidden personal-docs paths lingering

Cons:

- too risky without first proving which docs capability paths are still shared by smart assistant
- high chance of over-breaking the Feishu module while trying to simplify it

## 6. Recommendation

Choose Approach B.

The user has already provided a strong product-intent correction: `个人文档 MCP` should not be back. That needs to be fixed first at the product surface level. But deleting all personal-docs code immediately would be risky because the smart assistant and docs workbench still appear to share some capability paths. So the correct move is:

1. remove the visible personal-docs product surface
2. keep compatible underlying code temporarily where necessary
3. then recover the bot runtime chain
4. then audit assistant/i18n completeness

## 7. Proposed Design

### 7.1 Phase 1: Remove `个人文档 MCP` from the Feishu product surface

This phase changes Feishu product exposure, not the whole Feishu backend model.

The Feishu page should no longer present `个人文档 MCP` as a first-class tab.

After this phase, the Feishu page should expose only:

- `飞书机器人`
- `飞书智能助手`

Required frontend changes:

- remove the `personal-docs` tab entry from [apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.tsx](apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.tsx)
- stop mounting `FeishuPersonalDocsPanel` there
- stop defaulting page state to `personal-docs`
- convert the page-state fallback in [apps/desktop/MaomiAgent/src/mainview/modules/feishu/page-state.ts](apps/desktop/MaomiAgent/src/mainview/modules/feishu/page-state.ts) from `personal-docs` to `bot`
- when old persisted page state still contains `personal-docs` or `personal-docs-workspace`, coerce it safely to the new valid visible states instead of reviving removed tabs

The docs workbench route/state may remain, but it must no longer be named or treated as a personal-docs product surface. It becomes an internal docs workspace path only if still required by smart assistant flows.

### 7.2 Phase 1 compatibility boundary

This phase does **not** require immediate deletion of all personal-docs backend and contract code.

The following may remain temporarily for compatibility:

- `personalDocs` fields in [apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts](apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts)
- personal-docs store/service fields in the Feishu backend
- [apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/personal-docs-panel.tsx](apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/personal-docs-panel.tsx), as an unmounted file
- personal-docs bridge methods in the mainview Feishu helper layer

The key constraint is:

- **no visible product surface**
- **no visible user-facing tab**
- **no default navigation into personal docs**

This is a hide-first correction, not a same-pass backend purge.

### 7.3 Phase 2: Recover Feishu bot runtime credibility

Once the product surface is corrected, the next pass focuses only on the Feishu bot.

This phase is considered successful only when the bot page becomes a credible reflection of runtime reality, not merely a configurable form.

The bot recovery is divided into three chains.

#### 7.3.1 Bot configuration and state chain

The following must align:

- saved config
- returned `FeishuBotStateView`
- rendered status fields
- latest webhook / processed-message indicators

The page must not present contradictory signals such as:

- connection appears stopped while processing indicators imply success
- webhook appears failed without a surfaced reason path
- a saved config visually looks usable while critical capabilities remain absent

The main requirement is not “pretty UI”, but accurate state mapping.

#### 7.3.2 Webhook handling chain

The bot does not need every advanced event shape immediately, but the basic webhook chain must be coherent and diagnosable:

1. challenge / verification path works
2. incoming event path is recognized
3. duplicate / ignored / queued / processed / failed states are distinguishable
4. failures can be traced to a meaningful reason instead of collapsing into generic bot-state pessimism

This phase should prefer explicit failure reasons over broad “failed” surfaces that hide the real breakpoint.

#### 7.3.3 Image message chain

The user has already fixed the intended product rule:

- when the configured model does not support image input, the bot should automatically switch to an available image-capable model

Therefore the desired image-message behavior is:

1. inspect the currently selected bot model
2. if it supports image input, use it
3. if it does not, select a compatible visual-capable fallback model from currently available enabled models
4. only if no compatible model exists, return a clear configuration-level error

This means the current user-facing message:

- `No endpoints found that support image input`

is not acceptable as the steady-state outcome for ordinary bot usage.

The desired failure message, if fallback is impossible, must describe a missing available image-capable model, not leak low-level endpoint language as the primary user-facing explanation.

### 7.4 Phase 2 validation scope

Bot validation should stay narrow and behavior-based:

- bot config save / clear path
- webhook status mapping
- processed message status mapping
- image-message fallback selection

This phase does **not** need to solve smart-assistant completeness or multilingual cleanup.

### 7.5 Phase 3: Smart assistant and multilingual audit

This phase is intentionally audit-first, not immediate broad feature work.

It answers two questions.

#### 7.5.1 Smart assistant completeness

We need to identify:

- which smart-assistant capability chains are already truly restored
- which are only present as UI or contract shape but are not behaviorally closed

Priority audit targets:

- OAuth / token state path
- docs workbench entry behavior
- action registry wiring
- docs-search execution
- action execution behavior
- whether button surfaces map to real backend capability, not just placeholders

The output of this phase should be a clear list of:

- already-credible behaviors
- missing or misleading behaviors
- any separate recovery batch that would be required

#### 7.5.2 Multilingual regression audit

This phase should not begin as a prose-cleanup effort.

Instead, it should identify:

- which Feishu page strings are correctly routed through `t(...)`
- which strings are hardcoded Chinese that should be translatable
- whether the regression came from:
  - visible UI rollback
  - translation key loss
  - bypassing existing i18n helpers

The main goal is to distinguish structural i18n regressions from normal untranslated leftovers.

## 8. Affected Areas

### Phase 1 likely files

- [apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.tsx](apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.tsx)
- [apps/desktop/MaomiAgent/src/mainview/modules/feishu/page-state.ts](apps/desktop/MaomiAgent/src/mainview/modules/feishu/page-state.ts)
- possibly minor adjustments in docs-workbench return behavior

### Phase 2 likely files

- [apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/bot-config-panel.tsx](apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/bot-config-panel.tsx)
- [apps/desktop/MaomiAgent/src/mainview/lib/feishu.ts](apps/desktop/MaomiAgent/src/mainview/lib/feishu.ts)
- [apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts](apps/desktop/MaomiAgent/src/shared/desktop-feishu.ts)
- [apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts](apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts)
- bot webhook/runtime handling files under `apps/desktop/MaomiAgent/src/bun/modules/feishu/**`
- model selection or runtime-compatibility helpers if image-model fallback is implemented there

### Phase 3 likely files

- [apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/smart-assistant-panel.tsx](apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/smart-assistant-panel.tsx)
- action registry / executor files in `bun/modules/feishu/implementation/services/**`
- Feishu page and component copy that bypasses translation helpers

## 9. Testing and Validation

### Phase 1 validation

The surface-correction phase is complete only when:

1. Feishu page shows only `飞书机器人` and `飞书智能助手`
2. refreshing the page does not restore `个人文档 MCP`
3. old persisted Feishu page state that references personal-docs values is safely normalized to visible current tabs
4. smart-assistant docs workspace access, if still present, is not exposed as a personal-docs product surface

### Phase 2 validation

The bot-recovery phase is complete only when:

1. config save / clear updates state consistently
2. webhook state rendering matches actual backend state transitions
3. webhook failures surface actionable reasons
4. text message handling is code-level closed
5. image messages auto-fallback to a visual-capable model when possible
6. if no compatible image-capable model exists, the user gets a clear configuration error rather than a raw endpoint-style failure

### Phase 3 validation

The smart-assistant / i18n audit phase is complete only when:

1. assistant behaviors are categorized into restored vs incomplete
2. multilingual regressions are categorized into hardcoded copy vs missing translation coverage
3. any follow-up work is narrow and behavior-specific, not another broad Feishu recovery

### Recommended verification layers

- `bun run typecheck`
- focused Feishu service tests
- bot-specific focused tests for state mapping and image-model fallback
- manual page smoke validation for tab visibility and bot panel behavior

## 10. Success Criteria

This design succeeds when:

1. `个人文档 MCP` is no longer presented as a Feishu product surface
2. the Feishu bot becomes the next explicit recovery focus, with its runtime credibility improved rather than merely configured
3. the smart assistant and multilingual surfaces are evaluated on their own terms instead of being silently assumed restored

The first visible success is **not** “all Feishu features are perfect.”

The first visible success is:

- the wrong Feishu surface is removed
- the bot is recovered as the next real runtime target
- assistant/i18n are no longer left in an unverified gray area
