"""Configuration schema and env-file loading helpers."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import re
import tomllib
from typing import Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


_LABEL_COLOR_RE = re.compile(r"^[0-9a-fA-F]{6}$")
_ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class RepoSettingsConfig(BaseModel):
    """Repository metadata and merge-policy settings."""

    model_config = ConfigDict(extra="forbid")

    owner: str = Field(min_length=1)
    name: str = Field(min_length=1)
    default_branch: str = Field(min_length=1)
    description: Optional[str] = None
    homepage: Optional[str] = None
    allow_squash_merge: bool = True
    allow_merge_commit: bool = False
    allow_rebase_merge: bool = False
    delete_branch_on_merge: bool = True
    allow_auto_merge: bool = True


class RulesetConfig(BaseModel):
    """Normalized branch ruleset configuration."""

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    enforcement: Literal["active", "disabled", "evaluate"] = "active"
    target: Literal["branch"] = "branch"
    patterns: list[str] = Field(min_length=1)
    require_pull_request: bool = True
    required_approvals: int = Field(default=1, ge=0)
    dismiss_stale_reviews: bool = True
    require_code_owner_review: bool = False
    require_last_push_approval: bool = False
    require_resolved_conversations: bool = True
    require_linear_history: bool = True
    require_signed_commits: bool = False
    block_force_pushes: bool = True
    block_deletions: bool = True
    required_status_checks: list[str] = Field(default_factory=list)

    @field_validator("patterns")
    @classmethod
    def validate_patterns(cls, patterns: list[str]) -> list[str]:
        cleaned = [pattern.strip() for pattern in patterns if pattern.strip()]
        if not cleaned:
            raise ValueError("at least one branch pattern is required")
        return cleaned

    @field_validator("required_status_checks")
    @classmethod
    def validate_status_checks(cls, values: list[str]) -> list[str]:
        cleaned = []
        for value in values:
            item = value.strip()
            if item:
                cleaned.append(item)
        return sorted(dict.fromkeys(cleaned))


class LabelConfig(BaseModel):
    """GitHub label configuration."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    color: str
    description: str = ""

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        color = value.lstrip("#")
        if not _LABEL_COLOR_RE.match(color):
            raise ValueError("label color must be a 6 character hex value")
        return color.lower()


class EnvBindingConfig(BaseModel):
    """How a local env key maps to GitHub repo storage."""

    model_config = ConfigDict(extra="forbid")

    target: Literal["variable", "secret"]


class VariableBindingsConfig(BaseModel):
    """Environment-file sources and required keys."""

    model_config = ConfigDict(extra="forbid")

    from_env_files: list[str] = Field(default_factory=list)
    required: dict[str, EnvBindingConfig] = Field(default_factory=dict)

    @field_validator("required")
    @classmethod
    def validate_required(cls, values: dict[str, EnvBindingConfig]) -> dict[str, EnvBindingConfig]:
        for key in values:
            if not _ENV_KEY_RE.match(key):
                raise ValueError(f"invalid env key: {key}")
        return values


class RepoConfig(BaseModel):
    """Top-level config document."""

    model_config = ConfigDict(extra="forbid")

    repo: RepoSettingsConfig
    rulesets: dict[str, RulesetConfig] = Field(default_factory=dict)
    labels: list[LabelConfig] = Field(default_factory=list)
    variables: VariableBindingsConfig = Field(default_factory=VariableBindingsConfig)


@dataclass(slots=True)
class ResolvedEnvBindings:
    """Resolved env values and file metadata."""

    values: dict[str, str]
    missing_keys: list[str]
    loaded_files: list[Path]
    missing_files: list[Path]


def load_config(path: Union[str, Path]) -> RepoConfig:
    """Load and validate a repo bootstrap config."""

    config_path = Path(path)
    with config_path.open("rb") as handle:
        raw_data = tomllib.load(handle)
    try:
        return RepoConfig.model_validate(raw_data)
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc


def parse_env_file(path: Union[str, Path]) -> dict[str, str]:
    """Parse a simple dotenv file without shell interpolation."""

    values: dict[str, str] = {}
    env_path = Path(path)
    if not env_path.exists():
        raise FileNotFoundError(env_path)

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        value = raw_value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        values[key] = value
    return values


def resolve_env_bindings(config: RepoConfig, repo_root: Union[str, Path]) -> ResolvedEnvBindings:
    """Resolve required env keys from configured files and process env."""

    root = Path(repo_root)
    merged_values: dict[str, str] = {}
    loaded_files: list[Path] = []
    missing_files: list[Path] = []

    for env_file in config.variables.from_env_files:
        candidate = Path(env_file)
        if not candidate.is_absolute():
            candidate = root / candidate
        if candidate.exists():
            merged_values.update(parse_env_file(candidate))
            loaded_files.append(candidate)
        else:
            missing_files.append(candidate)

    for key in config.variables.required:
        if key in os.environ:
            merged_values[key] = os.environ[key]

    missing_keys = sorted(
        key for key in config.variables.required if key not in merged_values or merged_values[key] == ""
    )
    return ResolvedEnvBindings(
        values=merged_values,
        missing_keys=missing_keys,
        loaded_files=loaded_files,
        missing_files=missing_files,
    )
