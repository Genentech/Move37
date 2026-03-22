from __future__ import annotations

import os
import unittest
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from move37.models import Base
from move37.repositories.calendar import CalendarEventLinkRepository
from move37.services.activity_graph import ActivityGraphService
from move37.services.apple_calendar import AppleCalendarSyncService


class FakeAppleEventStore:
    def __init__(self) -> None:
        self.events: dict[str, object] = {}

    def list_events(self, start: datetime, end: datetime, calendar_id: str | None = None) -> list[object]:
        del calendar_id
        results = []
        for event in self.events.values():
            if event.ends_at >= start and event.starts_at <= end:
                results.append(event)
        return sorted(results, key=lambda event: event.starts_at)

    def create_event(self, event: object, calendar_id: str | None = None) -> str:
        next_id = event.id or f"https://calendar.test/{len(self.events) + 1}.ics"
        self.events[next_id] = event.model_copy(
            update={
                "id": next_id,
                "calendar_id": calendar_id,
                "calendar_name": "move37",
                "metadata": {**event.metadata, "href": next_id},
            }
        )
        return next_id

    def update_event(self, event_id: str, updates: object, calendar_id: str | None = None) -> object:
        current = self.events[event_id]
        next_event = current.model_copy(
            update={
                "title": updates.title or current.title,
                "starts_at": updates.starts_at or current.starts_at,
                "ends_at": updates.ends_at or current.ends_at,
                "all_day": current.all_day if updates.all_day is None else updates.all_day,
                "description": current.description if updates.description is None else updates.description,
                "calendar_id": calendar_id or current.calendar_id,
            }
        )
        self.events[event_id] = next_event
        return next_event

    def delete_event(self, event_id: str, calendar_id: str | None = None) -> None:
        del calendar_id
        self.events.pop(event_id, None)


class AppleCalendarSyncServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.old_env = {
            "MOVE37_APPLE_CALENDAR_ENABLED": os.environ.get("MOVE37_APPLE_CALENDAR_ENABLED"),
            "MOVE37_APPLE_CALENDAR_BASE_URL": os.environ.get("MOVE37_APPLE_CALENDAR_BASE_URL"),
            "MOVE37_APPLE_CALENDAR_USERNAME": os.environ.get("MOVE37_APPLE_CALENDAR_USERNAME"),
            "MOVE37_APPLE_CALENDAR_PASSWORD": os.environ.get("MOVE37_APPLE_CALENDAR_PASSWORD"),
            "MOVE37_APPLE_CALENDAR_WRITE_CALENDAR": os.environ.get("MOVE37_APPLE_CALENDAR_WRITE_CALENDAR"),
            "MOVE37_APPLE_CALENDAR_READ_CALENDARS": os.environ.get("MOVE37_APPLE_CALENDAR_READ_CALENDARS"),
        }
        os.environ["MOVE37_APPLE_CALENDAR_ENABLED"] = "true"
        os.environ["MOVE37_APPLE_CALENDAR_BASE_URL"] = "https://calendar.test"
        os.environ["MOVE37_APPLE_CALENDAR_USERNAME"] = "user@example.com"
        os.environ["MOVE37_APPLE_CALENDAR_PASSWORD"] = "password"
        os.environ["MOVE37_APPLE_CALENDAR_WRITE_CALENDAR"] = "/calendars/move37/"
        os.environ["MOVE37_APPLE_CALENDAR_READ_CALENDARS"] = "/calendars/move37/"
        engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
        Base.metadata.create_all(engine)
        self.session_factory = sessionmaker(
            bind=engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
        self.store = FakeAppleEventStore()
        self.calendar_service = AppleCalendarSyncService(self.session_factory, event_store=self.store)
        self.graph_service = ActivityGraphService(self.session_factory)
        self.subject = "calendar-user"

    def tearDown(self) -> None:
        for key, value in self.old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_sync_activity_creates_linked_all_day_event(self) -> None:
        self.calendar_service.sync_activity(
            self.subject,
            {
                "id": "wake-early",
                "title": "Wake early",
                "notes": "Prepare for the day.",
                "startDate": "2026-03-17",
                "kind": "activity",
            },
        )

        self.assertEqual(len(self.store.events), 1)
        event = next(iter(self.store.events.values()))
        self.assertTrue(event.all_day)
        self.assertEqual(event.starts_at.date().isoformat(), "2026-03-17")
        with self.session_factory() as session:
            link = CalendarEventLinkRepository(session).get_by_activity(
                "apple",
                self.subject,
                "wake-early",
            )
            self.assertIsNotNone(link)

    def test_sync_activity_deletes_event_when_start_date_is_cleared(self) -> None:
        self.test_sync_activity_creates_linked_all_day_event()

        self.calendar_service.sync_activity(
            self.subject,
            {
                "id": "wake-early",
                "title": "Wake early",
                "notes": "",
                "startDate": "",
                "kind": "activity",
            },
        )

        self.assertEqual(self.store.events, {})
        with self.session_factory() as session:
            link = CalendarEventLinkRepository(session).get_by_activity(
                "apple",
                self.subject,
                "wake-early",
            )
            self.assertIsNone(link)

    def test_sync_graph_removes_stale_linked_events(self) -> None:
        self.test_sync_activity_creates_linked_all_day_event()

        result = self.calendar_service.sync_graph(
            self.subject,
            snapshot={
                "graphId": 1,
                "version": 1,
                "nodes": [
                    {
                        "id": "wake-early",
                        "title": "Wake early",
                        "notes": "",
                        "startDate": "",
                        "kind": "activity",
                    }
                ],
                "dependencies": [],
                "schedules": [],
            },
        )

        self.assertEqual(result["deletedActivities"], 1)
        self.assertEqual(self.store.events, {})

    def test_reconcile_updates_activity_from_external_changes(self) -> None:
        self.graph_service.update_activity(
            self.subject,
            "wake-early",
            {"startDate": "2026-03-17", "title": "Wake early"},
        )
        self.calendar_service.sync_activity(
            self.subject,
            {
                "id": "wake-early",
                "title": "Wake early",
                "notes": "",
                "startDate": "2026-03-17",
                "kind": "activity",
            },
        )
        event_id = next(iter(self.store.events))
        current = self.store.events[event_id]
        self.store.events[event_id] = current.model_copy(
            update={
                "title": "Wake earlier",
                "starts_at": current.starts_at + timedelta(days=1),
                "ends_at": current.ends_at + timedelta(days=1),
                "etag": "v2",
            }
        )

        result = self.calendar_service.reconcile(self.subject)
        graph = self.graph_service.get_graph(self.subject)
        wake_early = next(node for node in graph["nodes"] if node["id"] == "wake-early")

        self.assertEqual(result["updatedActivities"], 2)
        self.assertEqual(wake_early["title"], "Wake earlier")
        self.assertEqual(wake_early["startDate"], "2026-03-18")

    def test_reconcile_clears_task_when_external_event_is_deleted(self) -> None:
        self.graph_service.update_activity(
            self.subject,
            "wake-early",
            {"startDate": "2026-03-17"},
        )
        self.calendar_service.sync_activity(
            self.subject,
            {
                "id": "wake-early",
                "title": "Wake early",
                "notes": "",
                "startDate": "2026-03-17",
                "kind": "activity",
            },
        )
        self.store.events.clear()

        result = self.calendar_service.reconcile(self.subject)
        graph = self.graph_service.get_graph(self.subject)
        wake_early = next(node for node in graph["nodes"] if node["id"] == "wake-early")

        self.assertEqual(result["clearedActivities"], 1)
        self.assertEqual(wake_early["startDate"], "")


if __name__ == "__main__":
    unittest.main()
