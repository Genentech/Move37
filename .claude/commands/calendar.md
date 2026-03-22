---
allowed-tools: Agent, Bash, Read, Write, Edit, Glob, Grep, EnterWorktree, ExitWorktree
---

Calendar integration skill for Move37.

Work on the calendar integration feature -- Apple Calendar connect/disconnect, CalDAV sync, reconciliation, event linking, and the full-stack surface (API, service, repository, SDK hooks, web UI).

## Task

$ARGUMENTS

## Worktree lifecycle

Before starting any implementation work, call `EnterWorktree(name=<branch-name>)` to create an isolated worktree and switch the session into it. Inside the worktree, rename the branch and push:

```
git branch -m <branch-name>
git push -u origin HEAD
```

When the work is complete, call `ExitWorktree(action=remove)` to return to the main directory and remove the worktree, then `git pull` to sync the default branch.

## Guidance

This feature spans the entire stack. When working on it, keep the following layers in mind:

1. **Schemas** -- `src/move37/schemas/calendar.py` defines `CalendarEvent` and `CalendarEventUpdate` (Pydantic, `extra="forbid"`).
2. **Service interface** -- `src/move37/services/calendar.py` defines the `CalendarInterface` ABC and provider adapters (`AppleCalendar`, `GoogleCalendar`).
3. **Apple CalDAV implementation** -- `src/move37/services/apple_calendar.py` contains `CalDavAppleEventStore` (wire protocol), `AppleCalendarConfig`, and `AppleCalendarSyncService` (connect, disconnect, sync, reconcile).
4. **Models** -- `src/move37/models/integrations.py` defines `CalendarConnectionModel`, `CalendarEventLinkModel`, and `AppleCalendarAccountModel`.
5. **Repositories** -- `src/move37/repositories/calendar.py` provides `AppleCalendarAccountRepository`, `CalendarConnectionRepository`, and `CalendarEventLinkRepository`.
6. **API schemas** -- `src/move37/api/schemas.py` holds transport types (`AppleCalendarStatusOutput`, `CalendarEventOutput`, `CalendarEventListOutput`, `CalendarReconcileOutput`, connect/preferences inputs).
7. **REST routers** -- `src/move37/api/routers/rest/integrations.py` (connect/disconnect/preferences) and `src/move37/api/routers/rest/calendar.py` (status/events/reconcile).
8. **Service container** -- `src/move37/services/container.py` wires `AppleCalendarSyncService` and passes it to `SchedulingService`.
9. **SDK hooks** -- `src/move37/sdk/node/src/hooks/useAppleCalendarIntegration.js` (connect/disconnect/preferences) and `useAppleCalendar.js` (events/reconcile).
10. **Web UI** -- `src/move37/web/src/surfaces.jsx` contains `CalendarSurface` and helpers (`getCalendarWindow`, `shiftCalendarAnchor`).
11. **Migrations** -- `src/move37/alembic/versions/20260317_000002_calendar_event_links.py` and `20260322_000003_apple_calendar_accounts.py`.
12. **Tests** -- `src/move37/tests/test_calendar_service.py` uses `FakeAppleEventStore` with in-memory SQLite.

Key domain concepts:
- **CalDAV** -- the wire protocol for Apple Calendar (PROPFIND, REPORT, PUT, DELETE over HTTP with XML payloads and iCalendar bodies).
- **Event links** -- `CalendarEventLinkModel` maps Move37 activity IDs to external calendar event IDs, tracking ownership (`managed_by_move37`) and staleness (`last_seen_etag`).
- **Sync** -- `sync_activity` pushes a single activity to the calendar; `sync_graph` pushes all scheduled activities and removes stale links.
- **Reconcile** -- `reconcile` pulls external changes back into the activity graph (title, date) and clears activities whose calendar events were deleted externally.
- **Credentials** -- stored encrypted via `encrypt_secret`/`decrypt_secret` in `AppleCalendarAccountModel.password_ciphertext`.

Use the analyst, engineer, and tester agents under `.claude/agents/calendar-*.md` for structured work on this feature.
