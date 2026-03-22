from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from move37.models import Base
from move37.services.activity_graph import ActivityGraphService
from move37.services.scheduling import SchedulingService


class FakeAppleCalendarService:
    def __init__(self, events: list[dict[str, object]] | None = None) -> None:
        self.events = list(events or [])
        self.synced: list[tuple[str, dict[str, object]]] = []

    def list_events(self, subject: str, start, end) -> list[dict[str, object]]:
        del subject, start, end
        return list(self.events)

    def sync_graph(self, subject: str, snapshot: dict[str, object]) -> dict[str, int]:
        self.synced.append((subject, snapshot))
        return {"syncedActivities": 0, "deletedActivities": 0}


class SchedulingServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(
            bind=engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
        self.graph_service = ActivityGraphService(self.session_factory)
        self.subject = "scheduling-user"

    def test_dry_run_reports_unscheduled_tasks_without_syncing_calendar(self) -> None:
        created = self.graph_service.create_activity(
            self.subject,
            {
                "title": "Missing estimate",
                "notes": "",
                "startDate": "2026-03-22",
                "bestBefore": "",
                "expectedTime": None,
                "realTime": 0,
                "expectedEffort": None,
                "realEffort": None,
            },
        )
        node = next(entry for entry in created["nodes"] if entry["title"] == "Missing estimate")
        calendar_service = FakeAppleCalendarService()
        service = SchedulingService(self.session_factory, apple_calendar_service=calendar_service)

        result = service.replan(self.subject, "dry_run", {})

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["summary"]["unscheduled"], 1)
        self.assertEqual(result["unscheduled"][0]["activityId"], node["id"])
        self.assertEqual(calendar_service.synced, [])

    def test_apply_updates_graph_dates_and_syncs_calendar(self) -> None:
        root_graph = self.graph_service.create_activity(
            self.subject,
            {
                "title": "Project root",
                "notes": "",
                "startDate": "2026-03-22",
                "bestBefore": "",
                "expectedTime": 8,
                "realTime": 0,
                "expectedEffort": None,
                "realEffort": None,
            },
        )
        root = next(entry for entry in root_graph["nodes"] if entry["title"] == "Project root")
        child_graph = self.graph_service.create_activity(
            self.subject,
            {
                "title": "Child task",
                "notes": "",
                "startDate": "",
                "bestBefore": "",
                "expectedTime": 4,
                "realTime": 0,
                "expectedEffort": None,
                "realEffort": None,
            },
            parent_ids=[root["id"]],
        )
        child = next(entry for entry in child_graph["nodes"] if entry["title"] == "Child task")
        calendar_service = FakeAppleCalendarService(
            events=[
                {
                    "id": "external-1",
                    "title": "Lab booking",
                    "startsAt": "2026-03-22T00:00:00+00:00",
                    "endsAt": "2026-03-23T00:00:00+00:00",
                    "allDay": True,
                    "managedByMove37": False,
                }
            ]
        )
        service = SchedulingService(self.session_factory, apple_calendar_service=calendar_service)

        result = service.replan(self.subject, "apply", {})
        graph = self.graph_service.get_graph(self.subject)
        saved_root = next(entry for entry in graph["nodes"] if entry["id"] == root["id"])
        saved_child = next(entry for entry in graph["nodes"] if entry["id"] == child["id"])

        self.assertTrue(result["runMetadata"]["applied"])
        self.assertEqual(saved_root["startDate"], "2026-03-23")
        self.assertEqual(saved_child["startDate"], "2026-03-23")
        self.assertEqual(len(calendar_service.synced), 1)


if __name__ == "__main__":
    unittest.main()
