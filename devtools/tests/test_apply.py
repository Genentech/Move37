from __future__ import annotations

import base64
import unittest

from nacl import public

from mv37_devtools.apply import apply_plan
from mv37_devtools.config_schema import ResolvedEnvBindings
from mv37_devtools.planner import PlanChange, PlanResult


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []
        private_key = public.PrivateKey.generate()
        self.public_key = base64.b64encode(bytes(private_key.public_key)).decode("utf-8")

    def create_branch(self, owner: str, repo: str, name: str, sha: str) -> None:
        self.calls.append(("create_branch", name, sha))

    def update_repository(self, owner: str, repo: str, payload: dict[str, object]) -> None:
        self.calls.append(("update_repository", payload))

    def create_label(self, owner: str, repo: str, payload: dict[str, object]) -> None:
        self.calls.append(("create_label", payload))

    def update_label(
        self,
        owner: str,
        repo: str,
        current_name: str,
        payload: dict[str, object],
    ) -> None:
        self.calls.append(("update_label", current_name, payload))

    def delete_label(self, owner: str, repo: str, name: str) -> None:
        self.calls.append(("delete_label", name))

    def create_ruleset(self, owner: str, repo: str, payload: dict[str, object]) -> None:
        self.calls.append(("create_ruleset", payload))

    def update_ruleset(
        self,
        owner: str,
        repo: str,
        ruleset_id: int,
        payload: dict[str, object],
    ) -> None:
        self.calls.append(("update_ruleset", ruleset_id, payload))

    def create_actions_variable(self, owner: str, repo: str, payload: dict[str, object]) -> None:
        self.calls.append(("create_actions_variable", payload))

    def update_actions_variable(
        self,
        owner: str,
        repo: str,
        name: str,
        payload: dict[str, object],
    ) -> None:
        self.calls.append(("update_actions_variable", name, payload))

    def get_actions_public_key(self, owner: str, repo: str) -> dict[str, str]:
        return {"key": self.public_key, "key_id": "key-1"}

    def upsert_actions_secret(
        self,
        owner: str,
        repo: str,
        name: str,
        payload: dict[str, object],
    ) -> None:
        self.calls.append(("upsert_actions_secret", name, payload))


class FailingClient(FakeClient):
    def update_repository(self, owner: str, repo: str, payload: dict[str, object]) -> None:
        raise RuntimeError("boom")


class ApplyPlanTest(unittest.TestCase):
    def test_apply_plan_executes_changes(self) -> None:
        plan = PlanResult(
            owner="Genentech",
            repo="move37",
            changes=[
                PlanChange("branch", "create", "stable", {"name": "stable", "sha": "abc123"}),
                PlanChange("repository", "update", "Genentech/move37", {"default_branch": "stable"}),
                PlanChange("label", "create", "bug", {"name": "bug", "color": "d73a4a"}),
                PlanChange(
                    "variable",
                    "create",
                    "MOVE37_POSTGRES_DB",
                    {"name": "MOVE37_POSTGRES_DB", "value": "move37"},
                ),
                PlanChange(
                    "secret",
                    "create",
                    "MOVE37_API_BEARER_TOKEN",
                    {"name": "MOVE37_API_BEARER_TOKEN", "value": "top-secret"},
                ),
            ],
        )

        result = apply_plan(plan, FakeClient())

        self.assertTrue(result.ok)
        self.assertEqual(len(result.applied), 5)

    def test_apply_plan_reports_partial_failures(self) -> None:
        plan = PlanResult(
            owner="Genentech",
            repo="move37",
            changes=[PlanChange("repository", "update", "Genentech/move37", {"default_branch": "stable"})],
        )

        result = apply_plan(plan, FailingClient())

        self.assertFalse(result.ok)
        self.assertIn("repository update Genentech/move37", result.failures[0])

    def test_apply_plan_refuses_when_plan_has_errors(self) -> None:
        plan = PlanResult(
            owner="Genentech",
            repo="move37",
            errors=["missing required env key: MOVE37_API_BEARER_TOKEN"],
        )

        result = apply_plan(plan, FakeClient())

        self.assertFalse(result.ok)
        self.assertEqual(result.applied, [])
        self.assertEqual(result.failures, plan.errors)
