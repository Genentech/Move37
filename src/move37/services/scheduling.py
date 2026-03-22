"""Scheduling orchestration and deterministic placeholder planning."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, date, datetime, time, timedelta
from math import ceil
from typing import Any, Protocol

from sqlalchemy.orm import sessionmaker

from move37.repositories.activity_graph import ActivityGraphRepository

DEFAULT_SCHEDULER_ENGINE = "move37-deterministic"
DEFAULT_SCHEDULER_VERSION = "0.1"
DEFAULT_START_OF_DAY = time(hour=9, tzinfo=UTC)
DEFAULT_LOOKBACK_DAYS = 30
DEFAULT_LOOKAHEAD_DAYS = 365


class SchedulerEngine(Protocol):
    """Contract for pluggable scheduling engines."""

    name: str
    version: str

    def plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Return a proposed schedule for the canonical planning payload."""


class DeterministicSchedulerEngine:
    """Simple dependency-aware scheduler used until the external engine lands."""

    name = DEFAULT_SCHEDULER_ENGINE
    version = DEFAULT_SCHEDULER_VERSION

    def plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        tasks_by_id = payload["tasksById"]
        ordered_ids: list[str] = payload["orderedIds"]
        parent_map: dict[str, list[str]] = payload["parentMap"]
        child_map: dict[str, list[str]] = payload["childMap"]
        blocked_dates: set[date] = payload["blockedDates"]

        placements: dict[str, dict[str, Any]] = {}
        unscheduled: list[dict[str, str]] = []
        conflicts: list[dict[str, str]] = []
        unplanned_ids: set[str] = set()

        for activity_id in ordered_ids:
            task = tasks_by_id[activity_id]
            duration_minutes = task["durationMinutes"]
            if duration_minutes is None or duration_minutes <= 0:
                unscheduled.append(
                    {
                        "activityId": activity_id,
                        "title": task["title"],
                        "code": "missing_duration",
                        "message": "Expected time is required before this task can be scheduled.",
                    }
                )
                unplanned_ids.add(activity_id)
                continue

            parent_ids = parent_map.get(activity_id, [])
            if any(parent_id in unplanned_ids for parent_id in parent_ids):
                unscheduled.append(
                    {
                        "activityId": activity_id,
                        "title": task["title"],
                        "code": "blocked_by_dependency",
                        "message": "A dependency could not be scheduled, so this task was skipped.",
                    }
                )
                unplanned_ids.add(activity_id)
                continue

            candidate_start = max(
                task["anchorStartsAt"],
                max(
                    (placements[parent_id]["endsAt"] for parent_id in parent_ids if parent_id in placements),
                    default=task["anchorStartsAt"],
                ),
            )
            scheduled_start = _find_next_available_start(
                candidate_start,
                duration_minutes,
                blocked_dates,
            )
            if scheduled_start is None:
                conflicts.append(
                    {
                        "activityId": activity_id,
                        "title": task["title"],
                        "code": "no_available_slot",
                        "message": "No available slot was found inside the current planning window.",
                    }
                )
                unplanned_ids.add(activity_id)
                continue
            scheduled_end = scheduled_start + timedelta(minutes=duration_minutes)
            placements[activity_id] = {
                "activityId": activity_id,
                "title": task["title"],
                "startsAt": scheduled_start,
                "endsAt": scheduled_end,
                "durationMinutes": duration_minutes,
                "branchRootIds": _collect_branch_roots(activity_id, parent_map),
            }

        changes = _build_changes(tasks_by_id, placements)
        project_impacts = _build_project_impacts(
            payload["rootIds"],
            child_map,
            tasks_by_id,
            placements,
        )
        return {
            "status": "infeasible" if conflicts else "ok",
            "placements": placements,
            "changes": changes,
            "conflicts": conflicts,
            "unscheduled": unscheduled,
            "projectImpacts": project_impacts,
        }


class SchedulingService:
    """Coordinate graph loading, planning, and optional calendar writes."""

    def __init__(
        self,
        session_factory: sessionmaker,
        apple_calendar_service: Any | None = None,
        scheduler_engine: SchedulerEngine | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._apple_calendar_service = apple_calendar_service
        self._scheduler_engine = scheduler_engine or DeterministicSchedulerEngine()

    def replan(
        self,
        subject: str,
        mode: str,
        parameters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        parameters = parameters or {}
        now = datetime.now(UTC)
        snapshot = self._load_graph(subject)
        payload = self._build_canonical_input(subject, snapshot, now, parameters)
        plan = self._scheduler_engine.plan(payload)
        applied = mode == "apply"
        snapshot_for_sync = snapshot
        if applied:
            snapshot_for_sync = self._apply_plan(subject, snapshot, plan["placements"])
            if self._apple_calendar_service is not None:
                self._apple_calendar_service.sync_graph(subject, snapshot_for_sync)
        return {
            "status": plan["status"],
            "summary": {
                "movedTasks": len(plan["changes"]),
                "conflicts": len(plan["conflicts"]),
                "unscheduled": len(plan["unscheduled"]),
                "projectsAffected": len(plan["projectImpacts"]),
            },
            "changes": plan["changes"],
            "conflicts": plan["conflicts"],
            "unscheduled": plan["unscheduled"],
            "projectImpacts": plan["projectImpacts"],
            "runMetadata": {
                "engine": self._scheduler_engine.name,
                "engineVersion": self._scheduler_engine.version,
                "runMode": mode,
                "computedAt": now.isoformat(),
                "applied": applied,
            },
        }

    def _load_graph(self, subject: str) -> dict[str, Any]:
        with self._session_factory() as session:
            repository = ActivityGraphRepository(session)
            snapshot = repository.get_snapshot(subject)
            if snapshot is None:
                raise ValueError("Activity graph not found.")
            return snapshot

    def _apply_plan(
        self,
        subject: str,
        snapshot: dict[str, Any],
        placements: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        next_snapshot = deepcopy(snapshot)
        changed = False
        for node in next_snapshot["nodes"]:
            placement = placements.get(str(node["id"]))
            if placement is None or node.get("kind") == "note":
                continue
            next_start_date = placement["startsAt"].date().isoformat()
            if node.get("startDate") != next_start_date:
                node["startDate"] = next_start_date
                changed = True
        if not changed:
            return snapshot
        with self._session_factory() as session:
            repository = ActivityGraphRepository(session)
            saved = repository.save_snapshot(subject, next_snapshot)
            repository.commit()
            return saved

    def _build_canonical_input(
        self,
        subject: str,
        snapshot: dict[str, Any],
        now: datetime,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        del parameters
        activities = [node for node in snapshot["nodes"] if node.get("kind") != "note"]
        activity_ids = {str(node["id"]) for node in activities}
        parent_map, child_map = _build_dependency_maps(snapshot["dependencies"], activity_ids)
        ordered_ids = _topological_order(activity_ids, child_map, parent_map)
        root_ids = sorted(activity_id for activity_id in activity_ids if not parent_map.get(activity_id))
        external_events = self._list_external_events(subject, now)
        blocked_dates = _build_blocked_dates(external_events)

        tasks_by_id: dict[str, dict[str, Any]] = {}
        for node in activities:
            activity_id = str(node["id"])
            tasks_by_id[activity_id] = {
                "id": activity_id,
                "title": str(node.get("title") or "Untitled task"),
                "previousStartsAt": _parse_start_date(node.get("startDate")),
                "anchorStartsAt": _derive_anchor(node, now),
                "durationMinutes": _duration_minutes(node.get("expectedTime")),
            }
        return {
            "now": now,
            "orderedIds": ordered_ids,
            "rootIds": root_ids,
            "tasksById": tasks_by_id,
            "parentMap": parent_map,
            "childMap": child_map,
            "blockedDates": blocked_dates,
        }

    def _list_external_events(self, subject: str, now: datetime) -> list[dict[str, Any]]:
        if self._apple_calendar_service is None:
            return []
        start = now - timedelta(days=DEFAULT_LOOKBACK_DAYS)
        end = now + timedelta(days=DEFAULT_LOOKAHEAD_DAYS)
        return self._apple_calendar_service.list_events(subject, start, end)


def _derive_anchor(node: dict[str, Any], now: datetime) -> datetime:
    start_date = _parse_start_date(node.get("startDate"))
    if start_date is not None:
        return start_date
    if node.get("workStartedAt"):
        try:
            started_at = datetime.fromisoformat(str(node["workStartedAt"]).replace("Z", "+00:00"))
            return max(started_at.astimezone(UTC), now)
        except ValueError:
            return now
    return now


def _parse_start_date(value: object) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    return datetime.combine(date.fromisoformat(raw), DEFAULT_START_OF_DAY)


def _duration_minutes(value: object) -> int | None:
    if value is None:
        return None
    try:
        hours = float(value)
    except (TypeError, ValueError):
        return None
    if hours <= 0:
        return None
    return max(1, int(round(hours * 60)))


def _build_dependency_maps(
    dependencies: list[dict[str, str]],
    activity_ids: set[str],
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    parent_map = {activity_id: [] for activity_id in activity_ids}
    child_map = {activity_id: [] for activity_id in activity_ids}
    for edge in dependencies:
        parent_id = str(edge.get("parentId") or "")
        child_id = str(edge.get("childId") or "")
        if parent_id not in activity_ids or child_id not in activity_ids:
            continue
        parent_map[child_id].append(parent_id)
        child_map[parent_id].append(child_id)
    return parent_map, child_map


def _topological_order(
    activity_ids: set[str],
    child_map: dict[str, list[str]],
    parent_map: dict[str, list[str]],
) -> list[str]:
    in_degree = {activity_id: len(parent_map.get(activity_id, [])) for activity_id in activity_ids}
    queue = sorted(activity_id for activity_id, count in in_degree.items() if count == 0)
    ordered: list[str] = []
    while queue:
        current = queue.pop(0)
        ordered.append(current)
        for child_id in sorted(child_map.get(current, [])):
            in_degree[child_id] -= 1
            if in_degree[child_id] == 0:
                queue.append(child_id)
                queue.sort()
    remaining = sorted(activity_id for activity_id in activity_ids if activity_id not in ordered)
    return ordered + remaining


def _build_blocked_dates(events: list[dict[str, Any]]) -> set[date]:
    blocked: set[date] = set()
    for event in events:
        if event.get("managedByMove37"):
            continue
        try:
            starts_at = datetime.fromisoformat(str(event["startsAt"]).replace("Z", "+00:00"))
            ends_at = datetime.fromisoformat(str(event["endsAt"]).replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError):
            continue
        current = starts_at.date()
        end_date = ends_at.date()
        if event.get("allDay"):
            end_date = max(current, end_date - timedelta(days=1))
        else:
            end_date = max(current, end_date)
        while current <= end_date:
            blocked.add(current)
            current += timedelta(days=1)
    return blocked


def _find_next_available_start(
    candidate_start: datetime,
    duration_minutes: int,
    blocked_dates: set[date],
) -> datetime | None:
    candidate_date = candidate_start.date()
    required_days = max(1, ceil(duration_minutes / (24 * 60)))
    for _ in range(DEFAULT_LOOKAHEAD_DAYS + 1):
        occupied_dates = {
            candidate_date + timedelta(days=offset)
            for offset in range(required_days)
        }
        if occupied_dates.isdisjoint(blocked_dates):
            if candidate_date == candidate_start.date():
                return candidate_start
            return datetime.combine(candidate_date, DEFAULT_START_OF_DAY)
        candidate_date += timedelta(days=1)
    return None


def _collect_branch_roots(activity_id: str, parent_map: dict[str, list[str]]) -> list[str]:
    roots: set[str] = set()
    stack = [activity_id]
    seen: set[str] = set()
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        parents = parent_map.get(current, [])
        if not parents:
            roots.add(current)
            continue
        stack.extend(parents)
    return sorted(roots)


def _build_changes(
    tasks_by_id: dict[str, dict[str, Any]],
    placements: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []
    for activity_id, placement in placements.items():
        previous_start = tasks_by_id[activity_id]["previousStartsAt"]
        proposed_start = placement["startsAt"]
        if previous_start == proposed_start:
            continue
        delta_minutes = None
        if previous_start is not None:
            delta_minutes = int((proposed_start - previous_start).total_seconds() // 60)
        changes.append(
            {
                "activityId": activity_id,
                "title": placement["title"],
                "previousStartsAt": previous_start.isoformat() if previous_start is not None else None,
                "proposedStartsAt": proposed_start.isoformat(),
                "deltaMinutes": delta_minutes,
                "branchRootId": placement["branchRootIds"][0] if placement["branchRootIds"] else activity_id,
            }
        )
    changes.sort(key=lambda change: (change["proposedStartsAt"], change["title"]))
    return changes


def _build_project_impacts(
    root_ids: list[str],
    child_map: dict[str, list[str]],
    tasks_by_id: dict[str, dict[str, Any]],
    placements: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    impacts: list[dict[str, Any]] = []
    changed_ids = {change["activityId"] for change in _build_changes(tasks_by_id, placements)}
    for root_id in root_ids:
        branch_ids = _collect_branch_nodes(root_id, child_map)
        if changed_ids.isdisjoint(branch_ids):
            continue
        previous_completion = _branch_completion(branch_ids, tasks_by_id, placements=None)
        proposed_completion = _branch_completion(branch_ids, tasks_by_id, placements=placements)
        if previous_completion == proposed_completion:
            continue
        delta_minutes = None
        if previous_completion is not None and proposed_completion is not None:
            delta_minutes = int((proposed_completion - previous_completion).total_seconds() // 60)
        impacts.append(
            {
                "branchRootId": root_id,
                "projectTitle": tasks_by_id[root_id]["title"],
                "previousCompletionAt": previous_completion.isoformat() if previous_completion else None,
                "proposedCompletionAt": proposed_completion.isoformat() if proposed_completion else None,
                "deltaMinutes": delta_minutes,
            }
        )
    impacts.sort(key=lambda impact: impact["projectTitle"])
    return impacts


def _collect_branch_nodes(root_id: str, child_map: dict[str, list[str]]) -> set[str]:
    branch = {root_id}
    stack = [root_id]
    while stack:
        current = stack.pop()
        for child_id in child_map.get(current, []):
            if child_id in branch:
                continue
            branch.add(child_id)
            stack.append(child_id)
    return branch


def _branch_completion(
    branch_ids: set[str],
    tasks_by_id: dict[str, dict[str, Any]],
    placements: dict[str, dict[str, Any]] | None,
) -> datetime | None:
    completion: datetime | None = None
    for activity_id in branch_ids:
        duration_minutes = tasks_by_id[activity_id]["durationMinutes"]
        if duration_minutes is None:
            continue
        if placements is None:
            starts_at = tasks_by_id[activity_id]["previousStartsAt"]
        else:
            starts_at = placements.get(activity_id, {}).get("startsAt")
        if starts_at is None:
            continue
        ends_at = starts_at + timedelta(minutes=duration_minutes)
        if completion is None or ends_at > completion:
            completion = ends_at
    return completion
