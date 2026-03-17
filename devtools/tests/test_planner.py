from __future__ import annotations

import unittest

from mv37_devtools.config_schema import RepoConfig, ResolvedEnvBindings
from mv37_devtools.planner import LiveRepoState, build_plan


def sample_config() -> RepoConfig:
    return RepoConfig.model_validate(
        {
            "repo": {
                "owner": "Genentech",
                "name": "move37",
                "default_branch": "main",
                "description": "Move37",
                "homepage": "",
                "allow_squash_merge": True,
                "allow_merge_commit": False,
                "allow_rebase_merge": False,
                "delete_branch_on_merge": True,
                "allow_auto_merge": True,
            },
            "rulesets": {
                "default_branch": {
                    "name": "default-branch",
                    "patterns": ["main"],
                    "required_status_checks": ["python", "sdk", "web"],
                }
            },
            "labels": [
                {"name": "bug", "color": "d73a4a", "description": "broken"},
            ],
            "variables": {
                "from_env_files": [".env"],
                "required": {
                    "MOVE37_POSTGRES_DB": {"target": "variable"},
                    "MOVE37_API_BEARER_TOKEN": {"target": "secret"},
                },
            },
        }
    )


def matching_live_state() -> LiveRepoState:
    return LiveRepoState(
        repository={
            "description": "Move37",
            "homepage": "",
            "default_branch": "main",
            "allow_squash_merge": True,
            "allow_merge_commit": False,
            "allow_rebase_merge": False,
            "delete_branch_on_merge": True,
            "allow_auto_merge": True,
        },
        labels={
            "bug": {"name": "bug", "color": "d73a4a", "description": "broken"},
        },
        rulesets={
            "default-branch": {
                "id": 1,
                "name": "default-branch",
                "target": "branch",
                "enforcement": "active",
                "patterns": ["main"],
                "require_pull_request": True,
                "required_approvals": 1,
                "dismiss_stale_reviews": True,
                "require_code_owner_review": False,
                "require_last_push_approval": False,
                "require_resolved_conversations": True,
                "require_linear_history": True,
                "require_signed_commits": False,
                "block_force_pushes": True,
                "block_deletions": True,
                "required_status_checks": ["python", "sdk", "web"],
            }
        },
        variables={"MOVE37_POSTGRES_DB": "move37"},
        secrets={"MOVE37_API_BEARER_TOKEN"},
    )


def resolved_env() -> ResolvedEnvBindings:
    return ResolvedEnvBindings(
        values={
            "MOVE37_POSTGRES_DB": "move37",
            "MOVE37_API_BEARER_TOKEN": "secret",
        },
        missing_keys=[],
        loaded_files=[],
        missing_files=[],
    )


class PlannerTest(unittest.TestCase):
    def test_build_plan_reports_noop_when_live_state_matches(self) -> None:
        plan = build_plan(sample_config(), matching_live_state(), resolved_env())

        self.assertFalse(plan.has_changes)
        self.assertEqual(plan.errors, [])

    def test_build_plan_detects_repo_settings_drift(self) -> None:
        live_state = matching_live_state()
        live_state.repository["allow_merge_commit"] = True

        plan = build_plan(sample_config(), live_state, resolved_env())

        self.assertTrue(plan.has_changes)
        self.assertEqual(plan.changes[0].surface, "repository")

    def test_build_plan_detects_missing_label(self) -> None:
        live_state = matching_live_state()
        live_state.labels = {}

        plan = build_plan(sample_config(), live_state, resolved_env())

        self.assertTrue(any(change.surface == "label" for change in plan.changes))

    def test_build_plan_detects_ruleset_drift(self) -> None:
        live_state = matching_live_state()
        live_state.rulesets["default-branch"]["required_approvals"] = 2

        plan = build_plan(sample_config(), live_state, resolved_env())

        self.assertTrue(any(change.surface == "ruleset" for change in plan.changes))

    def test_build_plan_reports_missing_env_keys(self) -> None:
        plan = build_plan(
            sample_config(),
            matching_live_state(),
            ResolvedEnvBindings(
                values={"MOVE37_POSTGRES_DB": "move37"},
                missing_keys=["MOVE37_API_BEARER_TOKEN"],
                loaded_files=[],
                missing_files=[],
            ),
        )

        self.assertIn("missing required env key: MOVE37_API_BEARER_TOKEN", plan.errors)
