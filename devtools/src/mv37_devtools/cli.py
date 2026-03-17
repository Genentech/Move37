"""Typer CLI for repository bootstrap operations."""

from __future__ import annotations

import os
from pathlib import Path
import sys
from typing import Optional

import typer

from .apply import apply_plan
from .config_schema import load_config, resolve_env_bindings
from .github_client import GitHubClient, GitHubAPIError
from .planner import build_plan, fetch_live_state, render_plan


app = typer.Typer(help="Move37 repository bootstrap tooling.", no_args_is_help=True)
repo_app = typer.Typer(help="Plan or apply repo bootstrap changes.", no_args_is_help=True)
bootstrap_app = typer.Typer(help="Aliases for the default Move37 repo config.", no_args_is_help=True)
app.add_typer(repo_app, name="repo")
app.add_typer(bootstrap_app, name="bootstrap")


def _default_config_path() -> Path:
    return Path(os.environ.get("MV37_DEVTOOLS_DEFAULT_CONFIG", "devtools/config/move37.repo.toml"))


def _load_runtime_state(config_path: Path, repo_root: Path):
    config = load_config(config_path)
    env_bindings = resolve_env_bindings(config, repo_root)
    return config, env_bindings


def _require_token() -> str:
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        typer.echo(
            "GITHUB_TOKEN is required. Run through devtools/bin/mv37-devtools.",
            err=True,
        )
        raise typer.Exit(code=1)
    return token


def _run_plan(
    *,
    config_path: Path,
    repo_root: Path,
    strict: bool,
    prune_labels: bool,
) -> None:
    try:
        config, env_bindings = _load_runtime_state(config_path, repo_root)
    except (FileNotFoundError, ValueError) as exc:
        typer.echo(f"Config error: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    token = _require_token()
    try:
        with GitHubClient(token) as client:
            live_state = fetch_live_state(config, client)
    except GitHubAPIError as exc:
        typer.echo(f"GitHub API error: {exc}", err=True)
        raise typer.Exit(code=1) from exc

    plan = build_plan(config, live_state, env_bindings, prune_labels=prune_labels)
    typer.echo(render_plan(plan))
    if plan.errors:
        raise typer.Exit(code=1)
    if strict and plan.has_changes:
        raise typer.Exit(code=1)


def _run_apply(
    *,
    config_path: Path,
    repo_root: Path,
    prune_labels: bool,
) -> None:
    try:
        config, env_bindings = _load_runtime_state(config_path, repo_root)
    except (FileNotFoundError, ValueError) as exc:
        typer.echo(f"Config error: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    token = _require_token()
    with GitHubClient(token) as client:
        live_state = fetch_live_state(config, client)
        plan = build_plan(config, live_state, env_bindings, prune_labels=prune_labels)
        typer.echo(render_plan(plan))
        if plan.errors:
            raise typer.Exit(code=1)
        result = apply_plan(plan, client)
    if result.failures:
        typer.echo("Apply failures:", err=True)
        for failure in result.failures:
            typer.echo(f"  - {failure}", err=True)
        raise typer.Exit(code=1)
    typer.echo(f"Applied {len(result.applied)} change(s).")


@app.command()
def doctor(
    config: Optional[Path] = typer.Option(
        None,
        "--config",
        exists=False,
        file_okay=True,
        dir_okay=False,
        resolve_path=False,
        help="Config file to validate.",
    ),
    repo_root: Path = typer.Option(
        Path("."),
        "--repo-root",
        file_okay=False,
        dir_okay=True,
        resolve_path=True,
        help="Repository root used to resolve env files.",
    ),
) -> None:
    """Validate config, token presence, and local env files."""

    config_path = config or _default_config_path()
    try:
        loaded_config, env_bindings = _load_runtime_state(config_path, repo_root)
    except ValueError as exc:
        typer.echo(f"Config error: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except FileNotFoundError as exc:
        typer.echo(f"Config file not found: {exc}", err=True)
        raise typer.Exit(code=1) from exc

    token_present = bool(os.environ.get("GITHUB_TOKEN"))
    typer.echo(f"Config: {config_path}")
    typer.echo(f"Repository: {loaded_config.repo.owner}/{loaded_config.repo.name}")
    typer.echo(f"GITHUB_TOKEN present: {'yes' if token_present else 'no'}")
    typer.echo(
        f"Env files loaded: {', '.join(str(path) for path in env_bindings.loaded_files) or 'none'}"
    )
    if env_bindings.missing_files:
        typer.echo("Missing env files:")
        for path in env_bindings.missing_files:
            typer.echo(f"  - {path}")
    if env_bindings.missing_keys:
        typer.echo("Missing env keys:")
        for key in env_bindings.missing_keys:
            typer.echo(f"  - {key}")
        raise typer.Exit(code=1)
    if not token_present:
        raise typer.Exit(code=1)


@repo_app.command("plan")
def repo_plan(
    config: Optional[Path] = typer.Option(None, "--config", help="Config file to plan against."),
    repo_root: Path = typer.Option(Path("."), "--repo-root", help="Repository root."),
    strict: bool = typer.Option(False, "--strict", help="Exit non-zero if drift exists."),
    prune_labels: bool = typer.Option(
        False, "--prune-labels", help="Delete labels that are not present in config."
    ),
) -> None:
    """Plan repo settings drift."""

    _run_plan(
        config_path=config or _default_config_path(),
        repo_root=repo_root.resolve(),
        strict=strict,
        prune_labels=prune_labels,
    )


@repo_app.command("apply")
def repo_apply(
    config: Optional[Path] = typer.Option(None, "--config", help="Config file to apply."),
    repo_root: Path = typer.Option(Path("."), "--repo-root", help="Repository root."),
    prune_labels: bool = typer.Option(
        False, "--prune-labels", help="Delete labels that are not present in config."
    ),
) -> None:
    """Apply repo settings drift."""

    _run_apply(
        config_path=config or _default_config_path(),
        repo_root=repo_root.resolve(),
        prune_labels=prune_labels,
    )


@bootstrap_app.command("plan")
def bootstrap_plan(
    repo_root: Path = typer.Option(Path("."), "--repo-root", help="Repository root."),
    strict: bool = typer.Option(False, "--strict", help="Exit non-zero if drift exists."),
    prune_labels: bool = typer.Option(
        False, "--prune-labels", help="Delete labels that are not present in config."
    ),
) -> None:
    """Plan against the default Move37 repo config."""

    _run_plan(
        config_path=_default_config_path(),
        repo_root=repo_root.resolve(),
        strict=strict,
        prune_labels=prune_labels,
    )


@bootstrap_app.command("apply")
def bootstrap_apply(
    repo_root: Path = typer.Option(Path("."), "--repo-root", help="Repository root."),
    prune_labels: bool = typer.Option(
        False, "--prune-labels", help="Delete labels that are not present in config."
    ),
) -> None:
    """Apply against the default Move37 repo config."""

    _run_apply(
        config_path=_default_config_path(),
        repo_root=repo_root.resolve(),
        prune_labels=prune_labels,
    )


def main() -> None:
    """Console entrypoint."""

    if len(sys.argv) >= 2 and sys.argv[1] == "help":
        sys.argv[1] = "--help"
    app()
