---
name: Issue Selection Recommendation
overview: Analysis of all 19 open issues against the user's criteria (fix existing > new features, no dependency blockers, achievable in a few hours) to recommend the best issue for this take-home assessment.
todos:
  - id: update-prompt-log
    content: Update prompt-history.md with this prompt
    status: pending
  - id: confirm-issue
    content: "Confirm issue #23 selection with user before starting implementation"
    status: pending
isProject: false
---

# Issue Selection Recommendation

## Issue landscape (19 open)

### Already taken (PRs exist -- avoid these)

- **#20** "Add negative-path REST tests for note retrieval and import validation" -- open PR #27
- **#21** "Add graph API tests for conflict and not-found mutation paths" -- open PR #28
- **#29** "Apple Calendar settings UX improvements" -- open PR #32

### Too large / external dependencies (eliminate)

- **#43** JVM scheduler backed by Timefold -- requires JVM ecosystem, weeks of work
- **#40** Open Banking integration -- requires third-party API provider, massive scope
- **#41** Embed notes into vector store for MCP semantic search -- requires OPENAI_API_KEY, Milvus, complex pipeline work
- **#47** MCP for conversational interaction with finances -- depends on #40 (Open Banking not built yet)
- **#46** MCP for conversational interaction with calendar -- large feature, MCP + calendar
- **#37** Apple Calendar full connect-to-sync flow -- large multi-service integration
- **#38** Completed nodes orbit as stars -- heavy 3D WebGL/Three.js work in a 176K-char file
- **#39** Notes render as parentless stars -- depends on #38

### Feasible candidates (ranked by your criteria)

#### Tier 1 -- Fixes existing mismatches (highest priority)

**#23: Stop advertising unsupported schedule mutations in SDK and MCP**

- **Why it's the best fit:**
  - This is a **contract-cleanup / bug-fix**, not a new feature. The service layer already rejects `replaceSchedule` and `deleteSchedule` with `ConflictError`, but the SDK, hooks, and MCP tool registry still advertise them. This is a real misleading API surface.
  - **Zero external dependencies.** No Docker needed to develop -- pure code changes + existing unit tests.
  - Touches exactly 4 files: `client.js`, `useActivityGraph.js`, `tool_registry.py`, and their tests.
  - Validation is straightforward: `npm test` (SDK) + `python -m unittest` (Python).
  - Demonstrates **systems thinking** (understanding the REST/SDK/MCP transport boundary) and **engineering judgment** (intentional surface-area reduction).
  - ~2-3 hours of focused work.

**#26: Make the web app show when running on mock fallback data**

- Fixes a **product-quality gap** (confusing silent fallback).
- Frontend-only, no external deps.
- But: the `App.jsx` file is 176K characters -- navigating it is harder and riskier. Less testable with automated checks.

#### Tier 2 -- Test coverage (valuable but less "pressing")

- **#22** Add unit tests for MCP JSON-RPC error handling -- good scope, Python only, ~2-3 hours
- **#24** Expand Move37Client tests -- SDK only, ~2 hours
- **#25** Add useNotes hook tests -- SDK only, ~1-2 hours

These are well-scoped but are purely additive test coverage, not fixing a mismatch in existing functionality.

#### Tier 3 -- Small UI features (feasible but lower priority)

- **#34** Inline URL import input -- small frontend change
- **#35** Direct 3D/linear layout transitions -- frontend, tricky 3D work
- **#36** Auto-fit viewport on linear mode switch -- frontend, depends on understanding 3D layout

## Recommendation

**Issue #23: "Stop advertising unsupported schedule mutations in SDK and MCP"**

This is the strongest choice because:

1. **Fixes existing broken contract** -- the SDK and MCP surfaces promise operations that always fail. This is the most "pressing" issue for anyone consuming the API today.
2. **No dependency blockers** -- no Docker, no OPENAI_API_KEY, no external services needed. Pure code + tests.
3. **Right scope for a take-home** -- ~2-3 hours, touches Python (MCP tool registry) + JavaScript (SDK client + React hooks) + tests on both sides, demonstrating cross-stack competence.
4. **Strong assessment signal** -- shows you understand the architecture (service layer vs. transport surfaces), can make a safe contract reduction, and can validate across both test suites.

### Files you would change

- [src/move37/sdk/node/src/client.js](src/move37/sdk/node/src/client.js) -- remove `replaceSchedule()` and `deleteSchedule()`
- [src/move37/sdk/node/src/hooks/useActivityGraph.js](src/move37/sdk/node/src/hooks/useActivityGraph.js) -- remove from returned hook API
- [src/move37/api/tool_registry.py](src/move37/api/tool_registry.py) -- remove `activity.schedule.replace` and `schedule.delete` tool definitions
- SDK and Python tests to cover the removals

