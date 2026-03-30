from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from move37.api.server import create_app
from move37.models import Base


class ApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.database_dir = tempfile.TemporaryDirectory()
        self.old_env = {
            "MOVE37_DATABASE_URL": os.environ.get("MOVE37_DATABASE_URL"),
            "MOVE37_API_BEARER_TOKEN": os.environ.get("MOVE37_API_BEARER_TOKEN"),
            "MOVE37_API_BEARER_SUBJECT": os.environ.get("MOVE37_API_BEARER_SUBJECT"),
        }
        os.environ["MOVE37_DATABASE_URL"] = (
            f"sqlite+pysqlite:///{self.database_dir.name}/move37-test.db"
        )
        os.environ["MOVE37_API_BEARER_TOKEN"] = "test-token"
        os.environ["MOVE37_API_BEARER_SUBJECT"] = "api-user"
        engine = create_engine(os.environ["MOVE37_DATABASE_URL"], future=True)
        Base.metadata.create_all(engine)
        engine.dispose()
        self.client = TestClient(create_app())

    def tearDown(self) -> None:
        self.database_dir.cleanup()
        for key, value in self.old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_auth_me_requires_token(self) -> None:
        response = self.client.get("/v1/auth/me")

        self.assertEqual(response.status_code, 401)

    def test_auth_me_returns_subject(self) -> None:
        response = self.client.get(
            "/v1/auth/me",
            headers={"Authorization": "Bearer test-token"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["subject"], "api-user")

    def test_graph_bootstraps_default_data(self) -> None:
        response = self.client.get(
            "/v1/graph",
            headers={"Authorization": "Bearer test-token"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertGreater(len(payload["nodes"]), 0)
        self.assertIn("graphId", payload)

    def test_rest_chat_routes_are_not_exposed(self) -> None:
        response = self.client.post(
            "/v1/chat/sessions",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Notes chat"},
        )

        self.assertEqual(response.status_code, 404)

    def test_apple_calendar_status_returns_service_status(self) -> None:
        self.client.app.state.services.apple_calendar_service.get_status = lambda: {
            "enabled": True,
            "connected": True,
            "provider": "apple",
            "writableCalendarId": "calendar://primary",
            "calendars": [
                {"id": "calendar://primary", "name": "primary", "readOnly": False},
            ],
        }

        response = self.client.get("/v1/calendars/apple/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "apple")

    def test_apple_calendar_events_returns_normalized_events(self) -> None:
        self.client.app.state.services.apple_calendar_service.list_events = lambda subject, start, end: [
            {
                "id": "event-1",
                "calendarId": "calendar://primary",
                "calendarName": "primary",
                "title": "Deep work",
                "startsAt": "2026-03-17T00:00:00+00:00",
                "endsAt": "2026-03-18T00:00:00+00:00",
                "allDay": True,
                "linkedActivityId": "wake-early",
                "managedByMove37": True,
            }
        ]

        response = self.client.get(
            "/v1/calendars/apple/events",
            headers={"Authorization": "Bearer test-token"},
            params={"start": "2026-03-17T00:00:00Z", "end": "2026-03-20T00:00:00Z"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["events"][0]["linkedActivityId"], "wake-early")

    def test_apple_calendar_reconcile_returns_summary(self) -> None:
        self.client.app.state.services.apple_calendar_service.reconcile = lambda subject: {
            "updatedActivities": 2,
            "clearedActivities": 1,
        }

        response = self.client.post(
            "/v1/calendars/apple/reconcile",
            headers={"Authorization": "Bearer test-token"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["updatedActivities"], 2)

    def test_scheduling_replan_returns_plan_summary(self) -> None:
        self.client.app.state.services.scheduling_service.replan = lambda subject, mode, parameters: {
            "status": "ok",
            "summary": {
                "movedTasks": 1,
                "conflicts": 0,
                "unscheduled": 1,
                "projectsAffected": 1,
            },
            "changes": [
                {
                    "activityId": "wake-early",
                    "title": "Wake early",
                    "previousStartsAt": "2026-03-17T09:00:00+00:00",
                    "proposedStartsAt": "2026-03-18T09:00:00+00:00",
                    "deltaMinutes": 1440,
                    "branchRootId": "wake-early",
                }
            ],
            "conflicts": [],
            "unscheduled": [
                {
                    "activityId": "buy-shoes",
                    "title": "Buy shoes",
                    "code": "missing_duration",
                    "message": "Expected time is required before this task can be scheduled.",
                }
            ],
            "projectImpacts": [
                {
                    "branchRootId": "wake-early",
                    "projectTitle": "Wake early",
                    "previousCompletionAt": "2026-03-17T17:00:00+00:00",
                    "proposedCompletionAt": "2026-03-18T17:00:00+00:00",
                    "deltaMinutes": 1440,
                }
            ],
            "runMetadata": {
                "engine": "move37-deterministic",
                "engineVersion": "0.1",
                "runMode": mode,
                "computedAt": "2026-03-22T12:00:00+00:00",
                "applied": mode == "apply",
            },
        }

        response = self.client.post(
            "/v1/scheduling/replan",
            headers={"Authorization": "Bearer test-token"},
            json={"mode": "dry_run", "parameters": {}},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"]["movedTasks"], 1)
        self.assertEqual(response.json()["runMetadata"]["runMode"], "dry_run")

    def test_apple_integration_status_returns_owner_scoped_status(self) -> None:
        self.client.app.state.services.apple_calendar_service.get_status = lambda subject=None: {
            "enabled": True,
            "connected": False,
            "provider": "apple",
            "writableCalendarId": None,
            "ownerEmail": None,
            "baseUrl": None,
            "calendars": [],
        }

        response = self.client.get(
            "/v1/integrations/apple/status",
            headers={"Authorization": "Bearer test-token"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["connected"])

    def test_apple_integration_connect_returns_connected_status(self) -> None:
        self.client.app.state.services.apple_calendar_service.connect = (
            lambda subject, username, password, base_url=None, writable_calendar_id=None: {
                "enabled": True,
                "connected": True,
                "provider": "apple",
                "writableCalendarId": writable_calendar_id or "https://calendar.test/cal/work/",
                "ownerEmail": username,
                "baseUrl": base_url or "https://calendar.test",
                "calendars": [
                    {
                        "id": "https://calendar.test/cal/work/",
                        "name": "work",
                        "readOnly": False,
                    }
                ],
            }
        )

        response = self.client.post(
            "/v1/integrations/apple/connect",
            headers={"Authorization": "Bearer test-token"},
            json={
                "username": "user@example.com",
                "password": "app-password",
                "baseUrl": "https://calendar.test",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["connected"])
        self.assertEqual(response.json()["ownerEmail"], "user@example.com")

    def test_create_note_creates_note_and_parentless_graph_node(self) -> None:
        response = self.client.post(
            "/v1/notes",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Recovery notes", "body": "Hydrate after long run."},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["note"]["title"], "Recovery notes")
        self.assertEqual(payload["note"]["ingestStatus"], "pending")
        note_nodes = [node for node in payload["graph"]["nodes"] if node["kind"] == "note"]
        self.assertEqual(len(note_nodes), 1)
        self.assertEqual(note_nodes[0]["title"], "Recovery notes")
        self.assertEqual(note_nodes[0]["linkedNoteId"], payload["note"]["id"])
        parent_edges = [
            edge for edge in payload["graph"]["dependencies"] if edge["childId"] == note_nodes[0]["id"]
        ]
        self.assertEqual(parent_edges, [])

    def test_import_txt_notes_creates_one_note_per_file(self) -> None:
        response = self.client.post(
            "/v1/notes/import",
            headers={"Authorization": "Bearer test-token"},
            files=[
                ("files", ("morning.txt", b"Wake at 06:00", "text/plain")),
                ("files", ("training.txt", b"Tempo run on Thursday", "text/plain")),
            ],
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["notes"]), 2)
        titles = {note["title"] for note in payload["notes"]}
        self.assertEqual(titles, {"morning", "training"})
        note_node_titles = {node["title"] for node in payload["graph"]["nodes"] if node["kind"] == "note"}
        self.assertTrue({"morning", "training"}.issubset(note_node_titles))

    @patch("move37.services.notes.httpx.Client")
    def test_import_url_creates_note_from_plain_text(self, client_cls) -> None:
        request = httpx.Request("GET", "https://example.com/reference.txt")
        response = httpx.Response(
            200,
            headers={"content-type": "text/plain; charset=utf-8"},
            text="linked note body",
            request=request,
        )
        client = client_cls.return_value.__enter__.return_value
        client.get.return_value = response

        api_response = self.client.post(
            "/v1/notes/import-url",
            headers={"Authorization": "Bearer test-token"},
            json={"url": "https://example.com/reference.txt"},
        )

        self.assertEqual(api_response.status_code, 200)
        payload = api_response.json()
        self.assertEqual(len(payload["notes"]), 1)
        self.assertEqual(payload["notes"][0]["title"], "reference")
        note_nodes = [node for node in payload["graph"]["nodes"] if node["kind"] == "note"]
        self.assertEqual(len(note_nodes), 1)
        self.assertEqual(note_nodes[0]["title"], "reference")

    @patch("move37.services.notes.httpx.Client")
    def test_import_url_rejects_non_text_response(self, client_cls) -> None:
        request = httpx.Request("GET", "https://example.com/index")
        response = httpx.Response(
            200,
            headers={"content-type": "application/json"},
            text='{"ok":true}',
            request=request,
        )
        client = client_cls.return_value.__enter__.return_value
        client.get.return_value = response

        api_response = self.client.post(
            "/v1/notes/import-url",
            headers={"Authorization": "Bearer test-token"},
            json={"url": "https://example.com/index"},
        )

        self.assertEqual(api_response.status_code, 400)
        self.assertEqual(api_response.json()["detail"], "URL must return plain text data.")

    @patch("move37.services.notes.httpx.Client")
    def test_import_url_surfaces_fetch_failures(self, client_cls) -> None:
        client = client_cls.return_value.__enter__.return_value
        client.get.side_effect = httpx.ConnectError("boom")

        api_response = self.client.post(
            "/v1/notes/import-url",
            headers={"Authorization": "Bearer test-token"},
            json={"url": "https://example.com/reference.txt"},
        )

        self.assertEqual(api_response.status_code, 503)
        self.assertEqual(api_response.json()["detail"], "AI service unavailable.")
        def test_get_note_returns_404_for_missing_note(self) -> None:
        response = self.client.get(
            "/v1/notes/99999",
            headers={"Authorization": "Bearer test-token"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Note not found.")

    def test_patch_note_returns_404_for_missing_note(self) -> None:
        response = self.client.patch(
            "/v1/notes/99999",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Updated title"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Note not found.")

    def test_import_rejects_non_txt_file(self) -> None:
        response = self.client.post(
            "/v1/notes/import",
            headers={"Authorization": "Bearer test-token"},
            files=[("files", ("data.csv", b"a,b,c", "text/csv"))],
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Only .txt files are supported.")

    def test_import_rejects_unsupported_encoding(self) -> None:
        response = self.client.post(
            "/v1/notes/import",
            headers={"Authorization": "Bearer test-token"},
            files=[("files", ("notes.txt", b"\x80", "text/plain"))],
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Unsupported text encoding. Use UTF-8, UTF-8 BOM, or UTF-16.",
        )


if __name__ == "__main__":
    unittest.main()
