"""Service-layer graph mutations and invariants."""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import sessionmaker

from move37.default_graph import build_default_graph
from move37.repositories.activity_graph import ActivityGraphRepository
from move37.services.errors import ConflictError, NotFoundError


@dataclass(slots=True)
class SchedulePeer:
    """Normalized schedule peer relationship update."""

    id: str
    relation: str


def create_node_id(title: str, nodes: list[dict[str, Any]]) -> str:
    """Generate stable node identifiers using the web app algorithm."""

    base = (
        str(title or "activity")
        .strip()
        .lower()
        .replace(" ", "-")
    )
    base = "".join(char if char.isalnum() else "-" for char in base)
    while "--" in base:
        base = base.replace("--", "-")
    base = base.strip("-") or "activity"
    candidate = base
    suffix = 2
    ids = {node["id"] for node in nodes}
    while candidate in ids:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def build_note_preview(body: str, limit: int = 240) -> str:
    """Return a short preview that fits inside the graph node payload."""

    compact = " ".join(str(body or "").split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: max(0, limit - 1)].rstrip()}…"


def build_indexes(
    nodes: list[dict[str, Any]],
    dependencies: list[dict[str, str]],
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Build parent and child adjacency maps."""

    ids = {node["id"] for node in nodes}
    parent_map = {node_id: [] for node_id in ids}
    child_map = {node_id: [] for node_id in ids}
    for edge in dependencies:
        parent_id = edge["parentId"]
        child_id = edge["childId"]
        if parent_id not in ids or child_id not in ids:
            continue
        parent_map[child_id].append(parent_id)
        child_map[parent_id].append(child_id)
    return parent_map, child_map


def collect_descendants(node_id: str, child_map: dict[str, list[str]]) -> set[str]:
    """Collect all descendants of a node."""

    result: set[str] = set()
    queue = deque(child_map.get(node_id, []))
    while queue:
        current = queue.pop()
        if current in result:
            continue
        result.add(current)
        queue.extend(child_map.get(current, []))
    return result


def topological_sort(
    nodes: list[dict[str, Any]],
    dependencies: list[dict[str, str]],
) -> tuple[list[str], bool]:
    """Return ordered node ids and cycle status."""

    ids = [node["id"] for node in nodes]
    adjacency = {node_id: [] for node_id in ids}
    indegree = {node_id: 0 for node_id in ids}
    for edge in dependencies:
        parent_id = edge["parentId"]
        child_id = edge["childId"]
        if parent_id not in adjacency or child_id not in adjacency:
            continue
        adjacency[parent_id].append(child_id)
        indegree[child_id] += 1
    queue = deque(node_id for node_id in ids if indegree[node_id] == 0)
    ordered: list[str] = []
    while queue:
        node_id = queue.popleft()
        ordered.append(node_id)
        for child_id in adjacency[node_id]:
            indegree[child_id] -= 1
            if indegree[child_id] == 0:
                queue.append(child_id)
    return ordered, len(ordered) != len(ids)


def would_create_cycle(
    nodes: list[dict[str, Any]],
    dependencies: list[dict[str, str]],
    next_edge: dict[str, str],
) -> bool:
    """Return whether adding an edge would create a dependency cycle."""

    if next_edge["parentId"] == next_edge["childId"]:
        return True
    _, child_map = build_indexes(nodes, dependencies)
    queue = deque([next_edge["childId"]])
    visited: set[str] = set()
    while queue:
        current = queue.pop()
        if current == next_edge["parentId"]:
            return True
        if current in visited:
            continue
        visited.add(current)
        queue.extend(child_map.get(current, []))
    return False


def compute_base_levels(
    nodes: list[dict[str, Any]],
    dependencies: list[dict[str, str]],
) -> dict[str, int]:
    """Compute base levels matching the web app layout invariant."""

    parent_map, child_map = build_indexes(nodes, dependencies)
    ordered, has_cycle = topological_sort(nodes, dependencies)
    if has_cycle:
        raise ConflictError("Dependency graph contains a cycle.")

    minimal = {node["id"]: 0 for node in nodes}
    for node_id in ordered:
        parents = parent_map.get(node_id, [])
        minimal[node_id] = max((minimal[parent_id] + 1 for parent_id in parents), default=0)

    global_max = max((minimal[node_id] for node_id in ordered), default=0)
    levels: dict[str, int] = {}
    for node_id in reversed(ordered):
        parents = parent_map.get(node_id, [])
        children = child_map.get(node_id, [])
        if not parents and not children:
            levels[node_id] = global_max
        elif not parents:
            levels[node_id] = 0
        elif not children:
            levels[node_id] = global_max
        else:
            max_allowed = min(levels[child_id] for child_id in children) - 1
            levels[node_id] = max(minimal[node_id], max_allowed)
    return levels


def validate_schedule_levels(
    nodes: list[dict[str, Any]],
    dependencies: list[dict[str, str]],
    schedules: list[dict[str, str]],
) -> None:
    """Ensure schedule rules only connect peer nodes and are acyclic per level."""

    base_levels = compute_base_levels(nodes, dependencies)
    levels = sorted(set(base_levels.values()))
    for schedule in schedules:
        if base_levels.get(schedule["earlierId"]) != base_levels.get(schedule["laterId"]):
            raise ConflictError("Scheduling only works between peers on the same base level.")

    for level in levels:
        level_ids = [node["id"] for node in nodes if base_levels.get(node["id"]) == level]
        if not level_ids:
            continue
        adjacency = {node_id: [] for node_id in level_ids}
        indegree = {node_id: 0 for node_id in level_ids}
        level_set = set(level_ids)
        for schedule in schedules:
            if schedule["earlierId"] not in level_set or schedule["laterId"] not in level_set:
                continue
            adjacency[schedule["laterId"]].append(schedule["earlierId"])
            indegree[schedule["earlierId"]] += 1
        queue = deque(node_id for node_id in level_ids if indegree[node_id] == 0)
        seen = 0
        while queue:
            node_id = queue.popleft()
            seen += 1
            for target_id in adjacency[node_id]:
                indegree[target_id] -= 1
                if indegree[target_id] == 0:
                    queue.append(target_id)
        if seen != len(level_ids):
            raise ConflictError(f"Scheduling cycle detected on level {level}.")


def derive_schedule_edges(
    nodes: list[dict[str, Any]],
    dependencies: list[dict[str, str]],
) -> list[dict[str, str]]:
    """Derive rendered schedule edges from nodes that share a start date and base level."""

    base_levels = compute_base_levels(nodes, dependencies)
    ordered_nodes = {node["id"]: index for index, node in enumerate(nodes)}
    grouped: dict[tuple[str, int], list[str]] = {}

    for node in nodes:
        start_date = str(node.get("startDate") or "").strip()
        if not start_date:
            continue
        level = base_levels.get(node["id"])
        if level is None:
            continue
        grouped.setdefault((start_date, level), []).append(node["id"])

    derived_edges: list[dict[str, str]] = []
    for _, node_ids in sorted(grouped.items(), key=lambda entry: (entry[0][0], entry[0][1])):
        ordered_ids = sorted(node_ids, key=lambda node_id: ordered_nodes[node_id])
        for earlier_id, later_id in zip(ordered_ids, ordered_ids[1:]):
            derived_edges.append({"earlierId": earlier_id, "laterId": later_id})

    validate_schedule_levels(nodes, dependencies, derived_edges)
    return derived_edges


class ActivityGraphService:
    """Service that owns all graph mutations and graph invariants."""

    def __init__(self, session_factory: sessionmaker) -> None:
        self._session_factory = session_factory

    def get_graph(self, subject: str) -> dict[str, Any]:
        with self._session_factory() as session:
            repository = ActivityGraphRepository(session)
            snapshot = repository.get_snapshot(subject)
            if snapshot is None:
                snapshot = repository.save_snapshot(subject, self._sanitize_graph(build_default_graph()))
                repository.commit()
            return snapshot

    def create_activity(
        self,
        subject: str,
        payload: dict[str, Any],
        parent_ids: Iterable[str] | None = None,
    ) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        node_id = create_node_id(str(payload["title"]), snapshot["nodes"])
        snapshot["nodes"].append(self._build_node(node_id, payload))
        parent_ids = list(parent_ids or [])
        for parent_id in parent_ids:
            self._find_node(snapshot["nodes"], parent_id)
            next_edge = {"parentId": parent_id, "childId": node_id}
            if would_create_cycle(snapshot["nodes"], snapshot["dependencies"], next_edge):
                raise ConflictError("That dependency would create a cycle.")
            snapshot["dependencies"].append(next_edge)
        return self._save_graph(subject, snapshot)

    def insert_between(
        self,
        subject: str,
        parent_id: str,
        child_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        self._require_edge(snapshot["dependencies"], parent_id, child_id)
        node_id = create_node_id(str(payload["title"]), snapshot["nodes"])
        snapshot["nodes"].append(self._build_node(node_id, payload))
        snapshot["dependencies"] = [
            edge
            for edge in snapshot["dependencies"]
            if not (edge["parentId"] == parent_id and edge["childId"] == child_id)
        ]
        snapshot["dependencies"].extend(
            [
                {"parentId": parent_id, "childId": node_id},
                {"parentId": node_id, "childId": child_id},
            ]
        )
        return self._save_graph(subject, snapshot)

    def update_activity(self, subject: str, activity_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        node = self._find_node(snapshot["nodes"], activity_id)
        self._ensure_activity_node(node)
        for field, value in patch.items():
            if field in {
                "title",
                "notes",
                "startDate",
                "bestBefore",
                "expectedTime",
                "realTime",
                "expectedEffort",
                "realEffort",
                "kind",
                "linkedNoteId",
            }:
                node[field] = value
        saved = self._save_graph(subject, snapshot)
        return self._find_node(saved["nodes"], activity_id)

    def start_work(self, subject: str, activity_id: str, now: datetime | None = None) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        now = now or datetime.now(timezone.utc)
        self._ensure_activity_node(self._find_node(snapshot["nodes"], activity_id))
        for node in snapshot["nodes"]:
            if node["id"] == activity_id:
                if not node.get("workStartedAt"):
                    node["workStartedAt"] = now.isoformat()
                continue
            if node.get("workStartedAt"):
                node["realTime"] = (node.get("realTime") or 0) + self._elapsed_hours(node["workStartedAt"], now)
                node["workStartedAt"] = None
        saved = self._save_graph(subject, snapshot)
        return self._find_node(saved["nodes"], activity_id)

    def stop_work(self, subject: str, activity_id: str, now: datetime | None = None) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        now = now or datetime.now(timezone.utc)
        node = self._find_node(snapshot["nodes"], activity_id)
        self._ensure_activity_node(node)
        if node.get("workStartedAt"):
            node["realTime"] = (node.get("realTime") or 0) + self._elapsed_hours(node["workStartedAt"], now)
            node["workStartedAt"] = None
        saved = self._save_graph(subject, snapshot)
        return self._find_node(saved["nodes"], activity_id)

    def fork_activity(self, subject: str, activity_id: str) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        node = self._find_node(snapshot["nodes"], activity_id)
        self._ensure_activity_node(node)
        fork_id = create_node_id(f"{node['title']} fork", snapshot["nodes"])
        fork_node = deepcopy(node)
        fork_node["id"] = fork_id
        fork_node["title"] = f"{node['title']} fork"
        fork_node["workStartedAt"] = None
        fork_node["startDate"] = ""
        fork_node["bestBefore"] = ""
        snapshot["nodes"].append(fork_node)
        snapshot["dependencies"].extend(
            [
                {"parentId": edge["parentId"], "childId": fork_id}
                for edge in snapshot["dependencies"]
                if edge["childId"] == activity_id
            ]
        )
        snapshot["dependencies"].extend(
            [
                {"parentId": fork_id, "childId": edge["childId"]}
                for edge in snapshot["dependencies"]
                if edge["parentId"] == activity_id
            ]
        )
        return self._save_graph(subject, snapshot)

    def delete_activity(self, subject: str, activity_id: str, delete_tree: bool) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        self._ensure_activity_node(self._find_node(snapshot["nodes"], activity_id))
        parent_map, child_map = build_indexes(snapshot["nodes"], snapshot["dependencies"])
        remove_ids = {activity_id}
        if delete_tree:
            remove_ids.update(collect_descendants(activity_id, child_map))
        else:
            parents = parent_map.get(activity_id, [])
            children = child_map.get(activity_id, [])
            for child_id in children:
                for parent_id in parents:
                    candidate = {"parentId": parent_id, "childId": child_id}
                    if candidate not in snapshot["dependencies"]:
                        snapshot["dependencies"].append(candidate)
        snapshot["nodes"] = [node for node in snapshot["nodes"] if node["id"] not in remove_ids]
        snapshot["dependencies"] = [
            edge
            for edge in snapshot["dependencies"]
            if edge["parentId"] not in remove_ids and edge["childId"] not in remove_ids
        ]
        snapshot["schedules"] = [
            edge
            for edge in snapshot["schedules"]
            if edge["earlierId"] not in remove_ids and edge["laterId"] not in remove_ids
        ]
        return self._save_graph(subject, snapshot)

    def replace_dependencies(
        self,
        subject: str,
        activity_id: str,
        parent_ids: list[str],
    ) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        self._ensure_activity_node(self._find_node(snapshot["nodes"], activity_id))
        next_dependencies = [
            edge for edge in snapshot["dependencies"] if edge["childId"] != activity_id
        ]
        for parent_id in parent_ids:
            self._find_node(snapshot["nodes"], parent_id)
            candidate = {"parentId": parent_id, "childId": activity_id}
            if would_create_cycle(snapshot["nodes"], next_dependencies, candidate):
                raise ConflictError("That dependency would create a cycle.")
            next_dependencies.append(candidate)
        snapshot["dependencies"] = next_dependencies
        return self._save_graph(subject, snapshot)

    def replace_schedule(
        self,
        subject: str,
        activity_id: str,
        peers: list[SchedulePeer],
    ) -> dict[str, Any]:
        del subject, activity_id, peers
        raise ConflictError("Manual schedule rules are derived from startDate and cannot be edited directly.")

    def delete_dependency(self, subject: str, parent_id: str, child_id: str) -> dict[str, Any]:
        snapshot = self.get_graph(subject)
        self._require_edge(snapshot["dependencies"], parent_id, child_id)
        snapshot["dependencies"] = [
            edge
            for edge in snapshot["dependencies"]
            if not (edge["parentId"] == parent_id and edge["childId"] == child_id)
        ]
        return self._save_graph(subject, snapshot)

    def delete_schedule(self, subject: str, earlier_id: str, later_id: str) -> dict[str, Any]:
        del subject, earlier_id, later_id
        raise ConflictError("Manual schedule rules are derived from startDate and cannot be deleted directly.")

    def _save_graph(self, subject: str, snapshot: dict[str, Any]) -> dict[str, Any]:
        sanitized = self._sanitize_graph(snapshot)
        with self._session_factory() as session:
            repository = ActivityGraphRepository(session)
            saved = repository.save_snapshot(subject, sanitized)
            repository.commit()
            return saved

    @staticmethod
    def _elapsed_hours(started_at: str, now: datetime) -> float:
        started = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        return max(0.0, (now - started).total_seconds() / 3600)

    @staticmethod
    def _build_node(node_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": node_id,
            "title": payload["title"],
            "notes": payload.get("notes") or "",
            "kind": payload.get("kind") or "activity",
            "linkedNoteId": payload.get("linkedNoteId"),
            "startDate": payload.get("startDate") or "",
            "bestBefore": payload.get("bestBefore") or "",
            "expectedTime": payload.get("expectedTime"),
            "realTime": payload.get("realTime") or 0,
            "expectedEffort": payload.get("expectedEffort"),
            "realEffort": payload.get("realEffort"),
            "workStartedAt": None,
        }

    @staticmethod
    def _find_node(nodes: list[dict[str, Any]], activity_id: str) -> dict[str, Any]:
        for node in nodes:
            if node["id"] == activity_id:
                return node
        raise NotFoundError("Activity not found.")

    @staticmethod
    def _require_edge(edges: list[dict[str, str]], left_id: str, right_id: str) -> None:
        for edge in edges:
            if edge.get("parentId") == left_id and edge.get("childId") == right_id:
                return
        raise NotFoundError("Dependency edge not found.")

    @staticmethod
    def _ensure_activity_node(node: dict[str, Any]) -> None:
        if node.get("kind") == "note":
            raise ConflictError("Note nodes must be managed through the note APIs.")

    @staticmethod
    def _sanitize_graph(snapshot: dict[str, Any]) -> dict[str, Any]:
        nodes = [deepcopy(node) for node in snapshot["nodes"]]
        dependencies = [deepcopy(edge) for edge in snapshot["dependencies"]]

        for node in nodes:
            node["kind"] = node.get("kind") or "activity"
            node["linkedNoteId"] = node.get("linkedNoteId")
            node["notes"] = node.get("notes") or ""
            node["startDate"] = node.get("startDate") or ""
            node["bestBefore"] = node.get("bestBefore") or ""
            node["realTime"] = node.get("realTime") or 0

        ids = {node["id"] for node in nodes}
        dependencies = [
            edge
            for edge in dependencies
            if edge["parentId"] in ids and edge["childId"] in ids and edge["parentId"] != edge["childId"]
        ]
        unique_dependencies: list[dict[str, str]] = []
        seen_dependencies: set[tuple[str, str]] = set()
        for edge in dependencies:
            key = (edge["parentId"], edge["childId"])
            if key not in seen_dependencies:
                seen_dependencies.add(key)
                unique_dependencies.append(edge)

        unique_schedules = derive_schedule_edges(nodes, unique_dependencies)
        return {
            "nodes": nodes,
            "dependencies": unique_dependencies,
            "schedules": unique_schedules,
        }

    def create_note_node(
        self,
        snapshot: dict[str, Any],
        *,
        title: str,
        note_id: int,
        body: str,
    ) -> str:
        """Add a parentless note node to a snapshot and return its node id."""

        node_id = create_node_id(title, snapshot["nodes"])
        snapshot["nodes"].append(
            self._build_node(
                node_id,
                {
                    "title": title,
                    "notes": build_note_preview(body),
                    "kind": "note",
                    "linkedNoteId": note_id,
                    "startDate": "",
                    "bestBefore": "",
                    "expectedTime": None,
                    "realTime": 0,
                    "expectedEffort": None,
                    "realEffort": None,
                },
            )
        )
        return node_id
