"""Planning logic for repo bootstrap operations."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from .config_schema import BranchConfig, RepoConfig, ResolvedEnvBindings, RulesetConfig


REPO_SETTING_FIELDS = (
    "description",
    "homepage",
    "default_branch",
    "allow_squash_merge",
    "allow_merge_commit",
    "allow_rebase_merge",
    "delete_branch_on_merge",
    "allow_auto_merge",
)


@dataclass(slots=True)
class LiveRepoState:
    """Normalized live GitHub repo state."""

    repository: dict[str, Any]
    branches: dict[str, str]
    labels: dict[str, dict[str, Any]]
    rulesets: dict[str, dict[str, Any]]
    variables: dict[str, str]
    secrets: set[str]


@dataclass(slots=True)
class PlanChange:
    """A single repo mutation that would bring state back in sync."""

    surface: str
    action: str
    target: str
    payload: dict[str, Any] = field(default_factory=dict)
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PlanResult:
    """Planner output for a single repository."""

    owner: str
    repo: str
    changes: list[PlanChange] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def has_changes(self) -> bool:
        return bool(self.changes)


def fetch_live_state(config: RepoConfig, client: Any) -> LiveRepoState:
    """Fetch the current live repo state through the client abstraction."""

    owner = config.repo.owner
    repo = config.repo.name
    raw_repository = client.get_repository(owner, repo)
    repository = _normalize_repository(raw_repository)
    branches = {
        branch["name"]: branch.get("commit", {}).get("sha", "")
        for branch in client.list_branches(owner, repo)
    }
    labels = {
        label["name"].lower(): _normalize_label(label)
        for label in client.list_labels(owner, repo)
    }
    rulesets = {}
    for ruleset in client.list_rulesets(owner, repo):
        normalized = _normalize_ruleset(ruleset)
        rulesets[normalized["name"]] = normalized
    variables = {
        variable["name"]: variable.get("value", "")
        for variable in client.list_actions_variables(owner, repo)
    }
    secrets = {secret["name"] for secret in client.list_actions_secrets(owner, repo)}
    return LiveRepoState(
        repository=repository,
        branches=branches,
        labels=labels,
        rulesets=rulesets,
        variables=variables,
        secrets=secrets,
    )


def build_plan(
    config: RepoConfig,
    live_state: LiveRepoState,
    env_bindings: ResolvedEnvBindings,
    *,
    prune_labels: bool = False,
) -> PlanResult:
    """Build a diff between desired and live repository state."""

    result = PlanResult(owner=config.repo.owner, repo=config.repo.name)
    if env_bindings.missing_files:
        result.warnings.extend(
            f"missing env file: {path}" for path in sorted(env_bindings.missing_files)
        )
    if env_bindings.missing_keys:
        result.errors.extend(
            f"missing required env key: {name}" for name in env_bindings.missing_keys
        )

    planned_branch_heads = dict(live_state.branches)
    for branch in config.branches:
        if branch.name in planned_branch_heads:
            continue
        source_sha = _resolve_branch_source_sha(branch, config, live_state, planned_branch_heads)
        if source_sha is None:
            result.errors.append(
                f"cannot determine source ref for branch: {branch.name}"
            )
            continue
        result.changes.append(
            PlanChange(
                surface="branch",
                action="create",
                target=branch.name,
                payload={"name": branch.name, "sha": source_sha},
                details={"source": branch.source or live_state.repository.get("default_branch")},
            )
        )
        planned_branch_heads[branch.name] = source_sha

    repo_payload = _build_repo_payload(config)
    repo_diff = {
        key: {"from": live_state.repository.get(key), "to": value}
        for key, value in repo_payload.items()
        if live_state.repository.get(key) != value
    }
    if repo_diff:
        result.changes.append(
            PlanChange(
                surface="repository",
                action="update",
                target=f"{config.repo.owner}/{config.repo.name}",
                payload=repo_payload,
                details=repo_diff,
            )
        )

    for identifier, ruleset in config.rulesets.items():
        desired_name = ruleset.name or identifier
        desired = _desired_ruleset_state(identifier, ruleset)
        live = live_state.rulesets.get(desired_name)
        payload = _build_ruleset_payload(identifier, ruleset)
        if live is None:
            result.changes.append(
                PlanChange(
                    surface="ruleset",
                    action="create",
                    target=desired_name,
                    payload=payload,
                )
            )
            continue
        comparable_live = {key: value for key, value in live.items() if key != "id"}
        if comparable_live != desired:
            result.changes.append(
                PlanChange(
                    surface="ruleset",
                    action="update",
                    target=desired_name,
                    payload={**payload, "id": live["id"]},
                    details={"from": comparable_live, "to": desired},
                )
            )

    desired_labels = {label.name.lower(): label for label in config.labels}
    for key, label in desired_labels.items():
        payload = {
            "name": label.name,
            "color": label.color,
            "description": label.description,
        }
        live = live_state.labels.get(key)
        if live is None:
            result.changes.append(
                PlanChange(
                    surface="label",
                    action="create",
                    target=label.name,
                    payload=payload,
                )
            )
            continue
        label_diff = {
            field: {"from": live.get(field), "to": value}
            for field, value in payload.items()
            if live.get(field) != value
        }
        if label_diff:
            result.changes.append(
                PlanChange(
                    surface="label",
                    action="update",
                    target=label.name,
                    payload={**payload, "current_name": live["name"]},
                    details=label_diff,
                )
            )

    if prune_labels:
        for live_name, live_label in live_state.labels.items():
            if live_name not in desired_labels:
                result.changes.append(
                    PlanChange(
                        surface="label",
                        action="delete",
                        target=live_label["name"],
                        payload={"name": live_label["name"]},
                    )
                )

    existing_secret_warning = False
    for env_name, binding in config.variables.required.items():
        value = env_bindings.values.get(env_name)
        if value is None:
            continue
        if binding.target == "variable":
            live_value = live_state.variables.get(env_name)
            if live_value is None:
                result.changes.append(
                    PlanChange(
                        surface="variable",
                        action="create",
                        target=env_name,
                        payload={"name": env_name, "value": value},
                    )
                )
            elif live_value != value:
                result.changes.append(
                    PlanChange(
                        surface="variable",
                        action="update",
                        target=env_name,
                        payload={"name": env_name, "value": value},
                        details={"from": live_value, "to": value},
                    )
                )
            continue

        if env_name not in live_state.secrets:
            result.changes.append(
                PlanChange(
                    surface="secret",
                    action="create",
                    target=env_name,
                    payload={"name": env_name, "value": value},
                )
            )
        elif not existing_secret_warning:
            result.warnings.append(
                "existing secrets are treated as converged because GitHub does not expose secret values"
            )
            existing_secret_warning = True

    return result


def render_plan(result: PlanResult) -> str:
    """Render a human-readable plan summary."""

    lines = [f"Plan for {result.owner}/{result.repo}"]
    if result.errors:
        lines.append("Errors:")
        for error in result.errors:
            lines.append(f"  - {error}")
    if result.warnings:
        lines.append("Warnings:")
        for warning in result.warnings:
            lines.append(f"  - {warning}")
    if not result.changes:
        lines.append("No changes.")
        return "\n".join(lines)

    lines.append("Changes:")
    for change in result.changes:
        lines.append(f"  - [{change.surface}] {change.action} {change.target}")
        for key, value in change.details.items():
            lines.append(f"      {key}: {value}")
    return "\n".join(lines)


def _build_repo_payload(config: RepoConfig) -> dict[str, Any]:
    repo = config.repo
    return {field: getattr(repo, field) for field in REPO_SETTING_FIELDS}


def _normalize_repository(repository: dict[str, Any]) -> dict[str, Any]:
    return {field: repository.get(field) for field in REPO_SETTING_FIELDS}


def _resolve_branch_source_sha(
    branch: BranchConfig,
    config: RepoConfig,
    live_state: LiveRepoState,
    planned_branch_heads: dict[str, str],
) -> Optional[str]:
    candidates: list[str] = []
    if branch.source:
        candidates.append(branch.source)
    live_default_branch = live_state.repository.get("default_branch")
    if live_default_branch:
        candidates.append(live_default_branch)
    candidates.append(config.repo.default_branch)

    for candidate in candidates:
        if candidate and candidate in planned_branch_heads and planned_branch_heads[candidate]:
            return planned_branch_heads[candidate]
    return None


def _normalize_label(label: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": label["name"],
        "color": label.get("color", "").lstrip("#").lower(),
        "description": label.get("description") or "",
    }


def _desired_ruleset_state(identifier: str, config: RulesetConfig) -> dict[str, Any]:
    return {
        "name": config.name or identifier,
        "target": config.target,
        "enforcement": config.enforcement,
        "patterns": sorted(config.patterns),
        "require_pull_request": config.require_pull_request,
        "required_approvals": config.required_approvals,
        "dismiss_stale_reviews": config.dismiss_stale_reviews,
        "require_code_owner_review": config.require_code_owner_review,
        "require_last_push_approval": config.require_last_push_approval,
        "require_resolved_conversations": config.require_resolved_conversations,
        "require_linear_history": config.require_linear_history,
        "require_signed_commits": config.require_signed_commits,
        "block_force_pushes": config.block_force_pushes,
        "block_deletions": config.block_deletions,
        "required_status_checks": sorted(config.required_status_checks),
    }


def _build_ruleset_payload(identifier: str, config: RulesetConfig) -> dict[str, Any]:
    rules: list[dict[str, Any]] = []
    if config.block_deletions:
        rules.append({"type": "deletion"})
    if config.block_force_pushes:
        rules.append({"type": "non_fast_forward"})
    if config.require_linear_history:
        rules.append({"type": "required_linear_history"})
    if config.require_signed_commits:
        rules.append({"type": "required_signatures"})
    if config.require_pull_request:
        rules.append(
            {
                "type": "pull_request",
                "parameters": {
                    "required_approving_review_count": config.required_approvals,
                    "dismiss_stale_reviews_on_push": config.dismiss_stale_reviews,
                    "require_code_owner_review": config.require_code_owner_review,
                    "require_last_push_approval": config.require_last_push_approval,
                    "required_review_thread_resolution": config.require_resolved_conversations,
                },
            }
        )
    if config.required_status_checks:
        rules.append(
            {
                "type": "required_status_checks",
                "parameters": {
                    "strict_required_status_checks_policy": True,
                    "required_status_checks": [
                        {"context": status_check} for status_check in config.required_status_checks
                    ],
                },
            }
        )
    return {
        "name": config.name or identifier,
        "target": config.target,
        "enforcement": config.enforcement,
        "conditions": {
            "ref_name": {
                "include": [_pattern_to_ref(pattern) for pattern in config.patterns],
                "exclude": [],
            }
        },
        "bypass_actors": [],
        "rules": rules,
    }


def _normalize_ruleset(ruleset: dict[str, Any]) -> dict[str, Any]:
    rules_by_type = {rule["type"]: rule for rule in ruleset.get("rules", [])}
    pull_request = rules_by_type.get("pull_request", {}).get("parameters", {})
    status_checks = rules_by_type.get("required_status_checks", {}).get("parameters", {})
    include_refs = (
        ruleset.get("conditions", {})
        .get("ref_name", {})
        .get("include", [])
    )
    return {
        "id": ruleset["id"],
        "name": ruleset["name"],
        "target": ruleset.get("target"),
        "enforcement": ruleset.get("enforcement"),
        "patterns": sorted(_ref_to_pattern(ref) for ref in include_refs),
        "require_pull_request": "pull_request" in rules_by_type,
        "required_approvals": pull_request.get("required_approving_review_count", 0),
        "dismiss_stale_reviews": pull_request.get("dismiss_stale_reviews_on_push", False),
        "require_code_owner_review": pull_request.get("require_code_owner_review", False),
        "require_last_push_approval": pull_request.get("require_last_push_approval", False),
        "require_resolved_conversations": pull_request.get(
            "required_review_thread_resolution", False
        ),
        "require_linear_history": "required_linear_history" in rules_by_type,
        "require_signed_commits": "required_signatures" in rules_by_type,
        "block_force_pushes": "non_fast_forward" in rules_by_type,
        "block_deletions": "deletion" in rules_by_type,
        "required_status_checks": sorted(
            item["context"] for item in status_checks.get("required_status_checks", [])
        ),
    }


def _pattern_to_ref(pattern: str) -> str:
    return pattern if pattern.startswith("refs/") else f"refs/heads/{pattern}"


def _ref_to_pattern(ref: str) -> str:
    prefix = "refs/heads/"
    return ref[len(prefix) :] if ref.startswith(prefix) else ref
