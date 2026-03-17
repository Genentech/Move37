from __future__ import annotations

from pathlib import Path
import subprocess
import tempfile
import unittest


WRAPPER_PATH = Path(__file__).resolve().parents[1] / "bin" / "mv37-devtools"


class WrapperTest(unittest.TestCase):
    def test_wrapper_builds_and_runs_container(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            log_path = tmp / "log.txt"
            bin_dir = tmp / "bin"
            bin_dir.mkdir()

            (bin_dir / "gh").write_text(
                f"""#!/usr/bin/env bash
set -euo pipefail
case "$1 $2" in
  "auth status")
    exit 0
    ;;
  "auth token")
    printf 'fake-token\\n'
    ;;
  *)
    exit 1
    ;;
esac
""",
                encoding="utf-8",
            )
            (bin_dir / "docker").write_text(
                f"""#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
  exit 1
fi
printf '%s\\n' "$*" >> "{log_path}"
exit 0
""",
                encoding="utf-8",
            )
            (bin_dir / "gh").chmod(0o755)
            (bin_dir / "docker").chmod(0o755)

            env = {
                "PATH": f"{bin_dir}:{Path('/usr/bin')}:{Path('/bin')}",
            }
            result = subprocess.run(
                [str(WRAPPER_PATH), "doctor"],
                check=False,
                capture_output=True,
                text=True,
                env=env,
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            log_text = log_path.read_text(encoding="utf-8")
            self.assertIn("build -t mv37-devtools:local", log_text)
            self.assertIn("run --rm", log_text)
            self.assertIn("doctor", log_text)
            self.assertIn("MV37_DEVTOOLS_DEFAULT_CONFIG=devtools/config/move37.repo.toml", log_text)

    def test_wrapper_requires_gh_auth(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            bin_dir = tmp / "bin"
            bin_dir.mkdir()

            (bin_dir / "gh").write_text(
                """#!/usr/bin/env bash
exit 1
""",
                encoding="utf-8",
            )
            (bin_dir / "docker").write_text(
                """#!/usr/bin/env bash
exit 0
""",
                encoding="utf-8",
            )
            (bin_dir / "gh").chmod(0o755)
            (bin_dir / "docker").chmod(0o755)

            result = subprocess.run(
                [str(WRAPPER_PATH), "doctor"],
                check=False,
                capture_output=True,
                text=True,
                env={"PATH": f"{bin_dir}:{Path('/usr/bin')}:{Path('/bin')}"},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("gh auth is required", result.stderr)
