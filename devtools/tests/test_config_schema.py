from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from mv37_devtools.config_schema import load_config, parse_env_file, resolve_env_bindings


class ConfigSchemaTest(unittest.TestCase):
    def test_load_config_rejects_missing_default_branch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "invalid.toml"
            config_path.write_text(
                """
[repo]
owner = "Genentech"
name = "move37"
""".strip(),
                encoding="utf-8",
            )

            with self.assertRaises(ValueError):
                load_config(config_path)

    def test_load_config_rejects_invalid_label_color(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "invalid.toml"
            config_path.write_text(
                """
[repo]
owner = "Genentech"
name = "move37"
default_branch = "main"

[[labels]]
name = "bug"
color = "bad"
description = "broken"
""".strip(),
                encoding="utf-8",
            )

            with self.assertRaises(ValueError):
                load_config(config_path)

    def test_parse_env_file_supports_export_and_comments(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            env_path = Path(tmpdir) / ".env"
            env_path.write_text(
                """
export FOO=bar
BAR="baz"
BAZ=qux # inline comment
""".strip(),
                encoding="utf-8",
            )

            values = parse_env_file(env_path)

        self.assertEqual(values["FOO"], "bar")
        self.assertEqual(values["BAR"], "baz")
        self.assertEqual(values["BAZ"], "qux")

    def test_resolve_env_bindings_reports_missing_keys(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            config_path = tmp / "config.toml"
            config_path.write_text(
                """
[repo]
owner = "Genentech"
name = "move37"
default_branch = "main"

[variables]
from_env_files = [".env"]

[variables.required]
MOVE37_API_BEARER_TOKEN = { target = "secret" }
MOVE37_POSTGRES_DB = { target = "variable" }
""".strip(),
                encoding="utf-8",
            )
            (tmp / ".env").write_text("MOVE37_POSTGRES_DB=move37\n", encoding="utf-8")

            config = load_config(config_path)
            resolved = resolve_env_bindings(config, tmp)

        self.assertEqual(resolved.values["MOVE37_POSTGRES_DB"], "move37")
        self.assertEqual(resolved.missing_keys, ["MOVE37_API_BEARER_TOKEN"])
