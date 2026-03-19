"""Thin GitHub REST client used by the repo bootstrap CLI."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any
from urllib.parse import quote

import httpx


class GitHubAPIError(RuntimeError):
    """Raised when the GitHub API returns an unexpected response."""


class GitHubClient:
    """Minimal GitHub REST API wrapper."""

    def __init__(
        self,
        token: str,
        base_url: str = "https://api.github.com",
        timeout: float = 30.0,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "mv37-devtools/0.1.0",
            },
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "GitHubClient":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        expected_statuses: Iterable[int] = (200,),
        **kwargs: Any,
    ) -> Any:
        response = self._client.request(method, path, **kwargs)
        if response.status_code not in set(expected_statuses):
            message = response.text.strip() or response.reason_phrase
            raise GitHubAPIError(
                f"{method} {path} failed with {response.status_code}: {message}"
            )
        if response.status_code == 204 or not response.content:
            return None
        if "application/json" in response.headers.get("Content-Type", ""):
            return response.json()
        return response.text

    def get_repository(self, owner: str, repo: str) -> dict[str, Any]:
        return self._request("GET", f"/repos/{owner}/{repo}")

    def update_repository(self, owner: str, repo: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "PATCH",
            f"/repos/{owner}/{repo}",
            expected_statuses=(200,),
            json=payload,
        )

    def list_branches(self, owner: str, repo: str) -> list[dict[str, Any]]:
        return self._request(
            "GET",
            f"/repos/{owner}/{repo}/branches",
            params={"per_page": 100},
        )

    def create_branch(self, owner: str, repo: str, name: str, sha: str) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/repos/{owner}/{repo}/git/refs",
            expected_statuses=(201,),
            json={"ref": f"refs/heads/{name}", "sha": sha},
        )

    def list_labels(self, owner: str, repo: str) -> list[dict[str, Any]]:
        return self._request(
            "GET",
            f"/repos/{owner}/{repo}/labels",
            params={"per_page": 100},
        )

    def create_label(self, owner: str, repo: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/repos/{owner}/{repo}/labels",
            expected_statuses=(201,),
            json=payload,
        )

    def update_label(
        self,
        owner: str,
        repo: str,
        current_name: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return self._request(
            "PATCH",
            f"/repos/{owner}/{repo}/labels/{quote(current_name, safe='')}",
            expected_statuses=(200,),
            json=payload,
        )

    def delete_label(self, owner: str, repo: str, name: str) -> None:
        self._request(
            "DELETE",
            f"/repos/{owner}/{repo}/labels/{quote(name, safe='')}",
            expected_statuses=(204,),
        )

    def list_rulesets(self, owner: str, repo: str) -> list[dict[str, Any]]:
        return self._request(
            "GET",
            f"/repos/{owner}/{repo}/rulesets",
            params={"includes_parents": "false"},
        )

    def create_ruleset(self, owner: str, repo: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/repos/{owner}/{repo}/rulesets",
            expected_statuses=(200, 201),
            json=payload,
        )

    def update_ruleset(
        self,
        owner: str,
        repo: str,
        ruleset_id: int,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return self._request(
            "PUT",
            f"/repos/{owner}/{repo}/rulesets/{ruleset_id}",
            expected_statuses=(200,),
            json=payload,
        )

    def list_actions_variables(self, owner: str, repo: str) -> list[dict[str, Any]]:
        payload = self._request("GET", f"/repos/{owner}/{repo}/actions/variables")
        return payload.get("variables", [])

    def create_actions_variable(self, owner: str, repo: str, payload: dict[str, Any]) -> None:
        self._request(
            "POST",
            f"/repos/{owner}/{repo}/actions/variables",
            expected_statuses=(201, 204),
            json=payload,
        )

    def update_actions_variable(self, owner: str, repo: str, name: str, payload: dict[str, Any]) -> None:
        self._request(
            "PATCH",
            f"/repos/{owner}/{repo}/actions/variables/{quote(name, safe='')}",
            expected_statuses=(204,),
            json=payload,
        )

    def list_actions_secrets(self, owner: str, repo: str) -> list[dict[str, Any]]:
        payload = self._request("GET", f"/repos/{owner}/{repo}/actions/secrets")
        return payload.get("secrets", [])

    def get_actions_public_key(self, owner: str, repo: str) -> dict[str, Any]:
        return self._request("GET", f"/repos/{owner}/{repo}/actions/secrets/public-key")

    def upsert_actions_secret(self, owner: str, repo: str, name: str, payload: dict[str, Any]) -> None:
        self._request(
            "PUT",
            f"/repos/{owner}/{repo}/actions/secrets/{quote(name, safe='')}",
            expected_statuses=(201, 204),
            json=payload,
        )
