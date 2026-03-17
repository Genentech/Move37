from __future__ import annotations

import json
import os
from pathlib import Path

from move37.api.server import create_app


def main() -> None:
    os.environ.setdefault("MOVE37_DATABASE_URL", "sqlite+pysqlite:////tmp/move37-openapi.db")
    os.environ.setdefault("MOVE37_API_BEARER_TOKEN", "move37-docs-token")
    os.environ.setdefault("MOVE37_API_BEARER_SUBJECT", "docs-user")

    app = create_app()
    output_path = Path(__file__).resolve().parent.parent / "openapi" / "move37.openapi.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(app.openapi(), handle, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()
