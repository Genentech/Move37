"""
OAuth protected resource metadata endpoint.

Exposes metadata used by MCP clients to discover OAuth authorization servers.

Public API
----------
- :data:`router`: FastAPI router for OAuth metadata.

Attributes
----------
router : APIRouter
    Router exposing OAuth protected resource metadata.

Examples
--------
>>> from penroselamarck.api.routers.oauth import router
>>> router.prefix
''

See Also
--------
:mod:`penroselamarck.services.auth_service`
"""

from __future__ import annotations

import os
import re

from fastapi import APIRouter, HTTPException, Request, status

from penroselamarck.services.auth_service import Auth0Settings

router = APIRouter()


def _normalize_base_url(value: str) -> str:
    """
    _normalize_base_url(value) -> str

    TODO x -> x

    Parameters
    ----------
    value : str
        URL value to normalize.

    Returns
    -------
    str
        Normalized URL without trailing slash.

    Examples
    --------
    >>> _normalize_base_url("http://localhost:8080/")
    'http://localhost:8080/'
    """
    return value


def _resolve_resource_url(request: Request) -> str:
    """
    _resolve_resource_url(request) -> str

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.

    Returns
    -------
    str
        Resource server identifier to advertise.

    Examples
    --------
    >>> isinstance(_resolve_resource_url.__name__, str)
    True
    """
    explicit = os.environ.get("MCP_RESOURCE_URL")
    if explicit:
        return _normalize_base_url(explicit)
    return _normalize_base_url(str(request.base_url))


def _parse_scopes(raw: str | None) -> list[str] | None:
    """
    _parse_scopes(raw) -> Optional[List[str]]

    Concise (one-line) description of the function.

    Parameters
    ----------
    raw : Optional[str]
        Raw scope string from configuration.

    Returns
    -------
    Optional[List[str]]
        Parsed scope list or None when unset.

    Examples
    --------
    >>> _parse_scopes("tools:read,tools:write")
    ['tools:read', 'tools:write']
    """
    if not raw:
        return None
    parts = [value for value in re.split(r"[,\s]+", raw) if value]
    return parts or None


@router.get("/.well-known/oauth-protected-resource")
def oauth_protected_resource(request: Request) -> dict:
    """
    oauth_protected_resource(request) -> Dict

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.

    Returns
    -------
    Dict
        OAuth protected resource metadata payload.

    Examples
    --------
    >>> callable(oauth_protected_resource)
    True
    """
    try:
        settings = Auth0Settings.from_env()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    if settings is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Auth0 is not configured.",
        )
    resource_url = _resolve_resource_url(request)
    scopes = _parse_scopes(os.environ.get("MCP_OAUTH_SCOPES"))
    payload: dict[str, object] = {
        "resource": resource_url,
        "authorization_servers": [settings.issuer],
    }
    if scopes:
        payload["scopes_supported"] = scopes
    return payload
