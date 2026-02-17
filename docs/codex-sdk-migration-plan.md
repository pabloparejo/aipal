# Codex SDK Migration Plan (Phase 1)

## Summary
Migrate Aipal's `codex` execution path from subprocess CLI invocation to an in-process Codex SDK runtime, while preserving behavior for `claude`, `gemini`, and `opencode`.

This phase is intentionally low-risk:
- Feature-flagged rollout
- Automatic fallback to existing CLI path on SDK errors
- No breaking Telegram command UX changes
- No thread persistence schema changes

## Locked Decisions
1. Scope: codex path only.
2. Fallback: SDK-first with automatic CLI fallback behind feature flags.
3. State: keep current `threads.json` mapping and thread key logic.

## Runtime Flags
- `AIPAL_CODEX_RUNTIME=auto|sdk|cli` (default `auto`)
- `AIPAL_CODEX_SDK_FALLBACK=true|false` (default `true`)
- `AIPAL_CODEX_SDK_TIMEOUT_MS=<ms>` (default `AIPAL_AGENT_TIMEOUT_MS`)
- `AIPAL_CODEX_SDK_LOG_VERBOSE=true|false` (default `false`)

## Deliverables
- Runtime abstraction modules under `src/runtimes/`
- Codex SDK runtime adapter with process-level client lifecycle and thread cache
- Codex CLI runtime extraction for fallback path
- Codex runtime manager/factory for mode + fallback policy
- `src/index.js` integration for `runAgentForChat` and `runAgentOneShot`
- Updated docs and env examples
- New tests covering runtime selection and fallback semantics

## Implementation Checklist
- [x] Add runtime modules (`runtime-types`, `codex-cli-runtime`, `codex-sdk-runtime`, `runtime-factory`)
- [x] Wire codex runtime manager into `src/index.js`
- [x] Keep memory/bootstrap/prompt assembly unchanged upstream of runtime execution
- [x] Preserve current thread persistence model and update on resolved SDK thread IDs
- [x] Add structured runtime logs: selected runtime + fallback markers
- [x] Add environment flags to `.env.example`
- [x] Update `README.md` and `docs/configuration.md`
- [x] Add runtime-focused tests in `test/`
- [ ] Validate with `npm install` and full test suite on environment with dependencies available

## Failure Handling Requirements
1. SDK init failure: fallback to CLI in `auto` mode when enabled.
2. SDK timeout: fallback to CLI in `auto` mode when enabled.
3. Stale thread IDs: attempt resume, then start a fresh thread if resume fails.
4. Empty SDK output: treat as runtime failure (eligible for fallback).
5. CLI fallback failure: preserve existing error flow.

## Rollout Strategy
1. Stage 1: deploy with `AIPAL_CODEX_RUNTIME=auto` and fallback enabled.
2. Stage 2: canary on selected chats/topics.
3. Stage 3: monitor fallback rate and error reasons.
4. Stage 4: optionally switch default to `sdk` after stability period.
5. Rollback: set `AIPAL_CODEX_RUNTIME=cli`.

## Notes
- Node baseline remains `>=24`.
- This phase does not migrate non-codex backends.
