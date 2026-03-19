"""Apply plan changes against the GitHub API."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from .planner import PlanChange, PlanResult
from .secrets import encrypt_secret


@dataclass(slots=True)
class ApplyResult:
    """Result of executing plan changes."""

    applied: list[PlanChange] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failures


def apply_plan(plan: PlanResult, client: Any) -> ApplyResult:
    """Execute plan changes. Returns partial results if some operations fail."""

    result = ApplyResult()
    if plan.errors:
        result.failures.extend(plan.errors)
        return result

    public_key: Optional[dict[str, str]] = None
    owner = plan.owner
    repo = plan.repo
    for change in plan.changes:
        try:
            if change.surface == "branch":
                client.create_branch(
                    owner,
                    repo,
                    change.payload["name"],
                    change.payload["sha"],
                )
            elif change.surface == "repository":
                client.update_repository(owner, repo, change.payload)
            elif change.surface == "ruleset":
                payload = dict(change.payload)
                ruleset_id = payload.pop("id", None)
                if change.action == "create":
                    client.create_ruleset(owner, repo, payload)
                else:
                    client.update_ruleset(owner, repo, ruleset_id, payload)
            elif change.surface == "label":
                if change.action == "create":
                    client.create_label(owner, repo, change.payload)
                elif change.action == "update":
                    payload = dict(change.payload)
                    current_name = payload.pop("current_name")
                    client.update_label(owner, repo, current_name, payload)
                elif change.action == "delete":
                    client.delete_label(owner, repo, change.payload["name"])
            elif change.surface == "variable":
                if change.action == "create":
                    client.create_actions_variable(owner, repo, change.payload)
                else:
                    client.update_actions_variable(
                        owner,
                        repo,
                        change.payload["name"],
                        change.payload,
                    )
            elif change.surface == "secret":
                if public_key is None:
                    public_key = client.get_actions_public_key(owner, repo)
                encrypted_value = encrypt_secret(public_key["key"], change.payload["value"])
                client.upsert_actions_secret(
                    owner,
                    repo,
                    change.payload["name"],
                    {
                        "encrypted_value": encrypted_value,
                        "key_id": public_key["key_id"],
                    },
                )
            else:
                raise ValueError(f"unsupported surface: {change.surface}")
        except Exception as exc:  # pragma: no cover - exercised through tests
            result.failures.append(f"{change.surface} {change.action} {change.target}: {exc}")
            continue
        result.applied.append(change)
    return result
