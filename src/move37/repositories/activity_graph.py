"""Repository for loading and saving activity graph snapshots."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.orm import Session, selectinload

from move37.models.activity_graph import (
    ActivityDependencyModel,
    ActivityGraphModel,
    ActivityNodeModel,
    ActivityScheduleModel,
)


class ActivityGraphRepository:
    """Persist and retrieve owner-scoped graph snapshots."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_graph(self, subject: str) -> ActivityGraphModel | None:
        return (
            self._session.query(ActivityGraphModel)
            .options(
                selectinload(ActivityGraphModel.nodes),
                selectinload(ActivityGraphModel.dependencies),
                selectinload(ActivityGraphModel.schedules),
            )
            .filter(ActivityGraphModel.owner_subject == subject)
            .one_or_none()
        )

    def get_snapshot(self, subject: str) -> dict[str, object] | None:
        graph = self.get_graph(subject)
        if graph is None:
            return None
        return self._serialize_graph(graph)

    def save_snapshot(self, subject: str, snapshot: dict[str, object]) -> dict[str, object]:
        graph = self.get_graph(subject)
        if graph is None:
            graph = ActivityGraphModel(owner_subject=subject, version=0)
            self._session.add(graph)
            self._session.flush()

        graph.version = int(graph.version or 0) + 1
        self._session.query(ActivityDependencyModel).filter(
            ActivityDependencyModel.graph_id == graph.id
        ).delete(synchronize_session=False)
        self._session.query(ActivityScheduleModel).filter(
            ActivityScheduleModel.graph_id == graph.id
        ).delete(synchronize_session=False)
        self._session.query(ActivityNodeModel).filter(
            ActivityNodeModel.graph_id == graph.id
        ).delete(synchronize_session=False)
        self._session.flush()

        node_payloads = list(snapshot["nodes"])
        dependency_payloads = list(snapshot["dependencies"])
        schedule_payloads = list(snapshot["schedules"])
        node_ids = {str(node["id"]) for node in node_payloads}

        for edge in dependency_payloads:
            if edge["parentId"] not in node_ids or edge["childId"] not in node_ids:
                raise ValueError(
                    "Activity dependency references a node that is missing from the snapshot."
                )
        for edge in schedule_payloads:
            if edge["earlierId"] not in node_ids or edge["laterId"] not in node_ids:
                raise ValueError(
                    "Activity schedule references a node that is missing from the snapshot."
                )

        nodes = [
            ActivityNodeModel(
                id=node["id"],
                graph_id=graph.id,
                position=index,
                title=node["title"],
                notes=node.get("notes") or "",
                kind=node.get("kind") or "activity",
                linked_note_id=node.get("linkedNoteId"),
                start_date=self._parse_date(node.get("startDate")),
                best_before=self._parse_date(node.get("bestBefore")),
                expected_time=node.get("expectedTime"),
                real_time=node.get("realTime") or 0,
                expected_effort=node.get("expectedEffort"),
                real_effort=node.get("realEffort"),
                work_started_at=self._parse_datetime(node.get("workStartedAt")),
            )
            for index, node in enumerate(node_payloads)
        ]
        self._session.add_all(nodes)
        self._session.flush()

        dependencies = [
            ActivityDependencyModel(
                graph_id=graph.id,
                position=index,
                parent_id=edge["parentId"],
                child_id=edge["childId"],
            )
            for index, edge in enumerate(dependency_payloads)
        ]
        schedules = [
            ActivityScheduleModel(
                graph_id=graph.id,
                position=index,
                earlier_id=edge["earlierId"],
                later_id=edge["laterId"],
            )
            for index, edge in enumerate(schedule_payloads)
        ]
        self._session.add_all(dependencies + schedules)
        self._session.flush()
        self._session.expire(graph, ["nodes", "dependencies", "schedules"])
        return self.get_snapshot(subject) or {
            "graphId": graph.id,
            "version": graph.version,
            "nodes": [],
            "dependencies": [],
            "schedules": [],
        }

    def commit(self) -> None:
        self._session.commit()

    @staticmethod
    def _parse_date(value: object) -> date | None:
        if not value:
            return None
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value))

    @staticmethod
    def _parse_datetime(value: object) -> datetime | None:
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    @staticmethod
    def _serialize_graph(graph: ActivityGraphModel) -> dict[str, object]:
        nodes = sorted(graph.nodes, key=lambda node: node.position)
        return {
            "graphId": graph.id,
            "version": graph.version,
            "nodes": [
                {
                    "id": node.id,
                    "title": node.title,
                    "notes": node.notes,
                    "kind": node.kind,
                    "linkedNoteId": node.linked_note_id,
                    "startDate": node.start_date.isoformat() if node.start_date else "",
                    "bestBefore": node.best_before.isoformat() if node.best_before else "",
                    "expectedTime": node.expected_time,
                    "realTime": node.real_time,
                    "expectedEffort": node.expected_effort,
                    "realEffort": node.real_effort,
                    "workStartedAt": node.work_started_at.isoformat() if node.work_started_at else None,
                }
                for node in nodes
            ],
            "dependencies": [
                {"parentId": edge.parent_id, "childId": edge.child_id}
                for edge in sorted(graph.dependencies, key=lambda edge: edge.position)
            ],
            "schedules": [
                {"earlierId": edge.earlier_id, "laterId": edge.later_id}
                for edge in sorted(graph.schedules, key=lambda edge: edge.position)
            ],
        }
