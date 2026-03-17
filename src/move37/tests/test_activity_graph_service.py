from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from move37.models import Base
from move37.services.activity_graph import ActivityGraphService
from move37.services.errors import ConflictError


class ActivityGraphServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
        Base.metadata.create_all(engine)
        session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
        self.service = ActivityGraphService(session_factory)
        self.subject = "test-user"

    def test_get_graph_seeds_default_graph(self) -> None:
        graph = self.service.get_graph(self.subject)

        self.assertGreater(len(graph["nodes"]), 0)
        self.assertGreater(graph["version"], 0)

    def test_create_and_delete_activity_reconnects_parents(self) -> None:
        created = self.service.create_activity(
            self.subject,
            {
                "title": "Bridge node",
                "notes": "",
                "startDate": "",
                "bestBefore": "",
                "expectedTime": 1,
                "realTime": 0,
                "expectedEffort": None,
                "realEffort": None,
            },
            parent_ids=["run-workout"],
        )
        new_node = next(node for node in created["nodes"] if node["title"] == "Bridge node")

        updated = self.service.replace_dependencies(self.subject, "long-run", [new_node["id"]])
        self.assertIn(
            {"parentId": new_node["id"], "childId": "long-run"},
            updated["dependencies"],
        )

        deleted = self.service.delete_activity(self.subject, new_node["id"], delete_tree=False)
        self.assertIn(
            {"parentId": "run-workout", "childId": "long-run"},
            deleted["dependencies"],
        )

    def test_replace_dependencies_rejects_cycles(self) -> None:
        with self.assertRaises(ConflictError):
            self.service.replace_dependencies(self.subject, "wake-early", ["run-workout"])

    def test_same_day_nodes_derive_schedule_edges_per_level(self) -> None:
        graph = self.service.update_activity(
            self.subject,
            "wake-early",
            {"startDate": "2026-03-17"},
        )
        self.assertEqual(graph["startDate"], "2026-03-17")

        full_graph = self.service.get_graph(self.subject)
        self.assertIn(
            {"earlierId": "wake-early", "laterId": "buy-shoes"},
            full_graph["schedules"],
        )

    def test_fork_clears_scheduling_fields(self) -> None:
        self.service.update_activity(
            self.subject,
            "wake-early",
            {"startDate": "2026-03-17", "bestBefore": "2026-03-18"},
        )

        graph = self.service.fork_activity(self.subject, "wake-early")
        fork = next(node for node in graph["nodes"] if node["id"] == "wake-early-fork")

        self.assertEqual(fork["startDate"], "")
        self.assertEqual(fork["bestBefore"], "")


if __name__ == "__main__":
    unittest.main()
