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

    def test_replace_dependencies_rejects_cycle(self) -> None:
        # Create two activities with A -> B dependency
        create_a = self.client.post(
            "/v1/activities",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Activity A"},
        )
        self.assertEqual(create_a.status_code, 200)
        activity_a_id = [n for n in create_a.json()["nodes"] if n["title"] == "Activity A"][0]["id"]

        create_b = self.client.post(
            "/v1/activities",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Activity B", "parentIds": [activity_a_id]},
        )
        self.assertEqual(create_b.status_code, 200)
        activity_b_id = [n for n in create_b.json()["nodes"] if n["title"] == "Activity B"][0]["id"]

        # Try to replace A's dependencies to depend on B, creating a cycle
        response = self.client.put(
            f"/v1/activities/{activity_a_id}/dependencies",
            headers={"Authorization": "Bearer test-token"},
            json={"parentIds": [activity_b_id]},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "That dependency would create a cycle.")

    def test_delete_dependency_returns_not_found_for_missing_edge(self) -> None:
        # Create two activities without any dependency between them
        create_a = self.client.post(
            "/v1/activities",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Activity X"},
        )
        self.assertEqual(create_a.status_code, 200)
        activity_x_id = [n for n in create_a.json()["nodes"] if n["title"] == "Activity X"][0]["id"]

        create_b = self.client.post(
            "/v1/activities",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Activity Y"},
        )
        self.assertEqual(create_b.status_code, 200)
        activity_y_id = [n for n in create_b.json()["nodes"] if n["title"] == "Activity Y"][0]["id"]

        # Try to delete a non-existent dependency edge
        response = self.client.delete(
            f"/v1/dependencies/{activity_x_id}/{activity_y_id}",
            headers={"Authorization": "Bearer test-token"},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Dependency edge not found.")

    def test_replace_schedule_rejects_manual_edit(self) -> None:
        # Create an activity
        create_response = self.client.post(
            "/v1/activities",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Scheduled Activity"},
        )
        self.assertEqual(create_response.status_code, 200)
        activity_id = [n for n in create_response.json()["nodes"] if n["title"] == "Scheduled Activity"][0]["id"]

        # Try to replace the activity's schedule (always rejected)
        response = self.client.put(
            f"/v1/activities/{activity_id}/schedule",
            headers={"Authorization": "Bearer test-token"},
            json={"peers": []},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Manual schedule rules are derived from startDate and cannot be edited directly.",
        )

    def test_delete_schedule_rejects_manual_deletion(self) -> None:
        # Create two activities (schedule edge existence doesn't matter)
        create_a = self.client.post(
            "/v1/activities",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Earlier Task"},
        )
        self.assertEqual(create_a.status_code, 200)
        earlier_id = [n for n in create_a.json()["nodes"] if n["title"] == "Earlier Task"][0]["id"]

        create_b = self.client.post(
            "/v1/activities",
            headers={"Authorization": "Bearer test-token"},
            json={"title": "Later Task"},
        )
        self.assertEqual(create_b.status_code, 200)
        later_id = [n for n in create_b.json()["nodes"] if n["title"] == "Later Task"][0]["id"]

        # Try to delete a schedule edge (always rejected)
        response = self.client.delete(
            f"/v1/schedules/{earlier_id}/{later_id}",
            headers={"Authorization": "Bearer test-token"},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Manual schedule rules are derived from startDate and cannot be deleted directly.",
        )


if __name__ == "__main__":
    unittest.main()
