from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from mv37_devtools.cli import app
from mv37_devtools.config_schema import RepoConfig, ResolvedEnvBindings
from mv37_devtools.planner import PlanChange, PlanResult


def sample_config() -> RepoConfig:
    return RepoConfig.model_validate(
        {
            "repo": {
                "owner": "Genentech",
                "name": "move37",
                "default_branch": "main",
            },
            "rulesets": {},
            "labels": [],
            "variables": {"from_env_files": [], "required": {}},
        }
    )


class CliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.runner = CliRunner()

    def test_doctor_exits_non_zero_when_token_missing(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with patch("mv37_devtools.cli._load_runtime_state") as load_runtime_state:
                load_runtime_state.return_value = (
                    sample_config(),
                    ResolvedEnvBindings(values={}, missing_keys=[], loaded_files=[], missing_files=[]),
                )
                result = self.runner.invoke(app, ["doctor"])

        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("GITHUB_TOKEN present: no", result.stdout)

    def test_repo_plan_prints_changes(self) -> None:
        plan = PlanResult(
            owner="Genentech",
            repo="move37",
            changes=[PlanChange("label", "create", "bug", {"name": "bug", "color": "d73a4a"})],
        )
        mock_client = MagicMock()
        mock_client.__enter__.return_value = object()
        mock_client.__exit__.return_value = None

        with patch.dict(os.environ, {"GITHUB_TOKEN": "token"}, clear=True):
            with patch("mv37_devtools.cli._load_runtime_state") as load_runtime_state, patch(
                "mv37_devtools.cli.GitHubClient", return_value=mock_client
            ), patch("mv37_devtools.cli.fetch_live_state"), patch(
                "mv37_devtools.cli.build_plan", return_value=plan
            ):
                load_runtime_state.return_value = (
                    sample_config(),
                    ResolvedEnvBindings(values={}, missing_keys=[], loaded_files=[], missing_files=[]),
                )
                result = self.runner.invoke(app, ["repo", "plan"])

        self.assertEqual(result.exit_code, 0)
        self.assertIn("Changes:", result.stdout)
        self.assertIn("[label] create bug", result.stdout)

    def test_repo_apply_refuses_plan_errors(self) -> None:
        plan = PlanResult(owner="Genentech", repo="move37", errors=["missing required env key: X"])
        mock_client = MagicMock()
        mock_client.__enter__.return_value = object()
        mock_client.__exit__.return_value = None

        with patch.dict(os.environ, {"GITHUB_TOKEN": "token"}, clear=True):
            with patch("mv37_devtools.cli._load_runtime_state") as load_runtime_state, patch(
                "mv37_devtools.cli.GitHubClient", return_value=mock_client
            ), patch("mv37_devtools.cli.fetch_live_state"), patch(
                "mv37_devtools.cli.build_plan", return_value=plan
            ):
                load_runtime_state.return_value = (
                    sample_config(),
                    ResolvedEnvBindings(values={}, missing_keys=[], loaded_files=[], missing_files=[]),
                )
                result = self.runner.invoke(app, ["repo", "apply"])

        self.assertNotEqual(result.exit_code, 0)
        self.assertIn("missing required env key", result.stdout)
