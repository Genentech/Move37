"""
FastAPI dependency helpers.

Provides access to service container and MCP transport.

Public API
----------
- :func:`get_service_container`: Retrieve the service container.
- :func:`get_mcp_transport`: Retrieve the MCP transport.
- :func:`get_current_user`: Validate bearer token and return current user.

Attributes
----------
None

Examples
--------
>>> callable(get_service_container)
True

See Also
--------
:mod:`penroselamarck.services.container`
"""

from __future__ import annotations

import os

from fastapi import Request

from penroselamarck.api.transport import McpHttpTransport
from penroselamarck.repositories.user_repository import UserRecord
from penroselamarck.services.container import ServiceContainer
from penroselamarck.services.errors import ServiceError


def _is_truthy_env(name: str) -> bool:
    """
    _is_truthy_env(name) -> bool

    Return True when an environment variable is set to a truthy value.
    """
    value = os.environ.get(name)
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _resource_metadata_url(request: Request) -> str:
    """
    _resource_metadata_url(request) -> str

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.

    Returns
    -------
    str
        Resource metadata URL for OAuth discovery.

    Examples
    --------
    >>> isinstance(_resource_metadata_url.__name__, str)
    True
    """
    return f"{str(request.base_url).rstrip('/')}/.well-known/oauth-protected-resource"


def _www_authenticate_header(request: Request, description: str) -> str:
    """
    _www_authenticate_header(request, description) -> str

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.
    description : str
        Error description for the header.

    Returns
    -------
    str
        WWW-Authenticate header value.

    Examples
    --------
    >>> isinstance(_www_authenticate_header.__name__, str)
    True
    """
    safe_description = description.replace('"', "'")
    resource_metadata = _resource_metadata_url(request)
    return (
        'Bearer realm="mcp", error="invalid_token", '
        f'error_description="{safe_description}", '
        f'resource_metadata="{resource_metadata}"'
    )


def get_service_container(request: Request) -> ServiceContainer:
    """
    get_service_container(request) -> ServiceContainer

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.

    Returns
    -------
    ServiceContainer
        Application service container.
    """
    return request.app.state.services


def get_mcp_transport(request: Request) -> McpHttpTransport:
    """
    get_mcp_transport(request) -> McpHttpTransport

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.

    Returns
    -------
    McpHttpTransport
        MCP transport instance.
    """
    return request.app.state.mcp_transport


def get_current_user(request: Request) -> UserRecord:
    """
    get_current_user(request) -> UserRecord

    Concise (one-line) description of the function.

    Parameters
    ----------
    request : Request
        FastAPI request context.

    Throws
    ------
    HTTPException
        Raised when authentication fails.

    Returns
    -------
    UserRecord
        Authenticated user record.

    Examples
    --------
    >>> callable(get_current_user)
    True
    """
    from fastapi import HTTPException, status

    if _is_truthy_env("AUTH_DISABLED"):
        services = get_service_container(request)
        return services.auth_service.demo_user()

    authorization = request.headers.get("authorization")
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={
                "WWW-Authenticate": _www_authenticate_header(request, "Missing bearer token.")
            },
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header.",
            headers={
                "WWW-Authenticate": _www_authenticate_header(
                    request, "Invalid authorization header."
                )
            },
        )
    services = get_service_container(request)
    try:
        return services.auth_service.login(token)
    except ServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=exc.message,
            headers={"WWW-Authenticate": _www_authenticate_header(request, exc.message)},
        ) from exc


def get_current_user_mcp(request: Request) -> UserRecord:
    """
    get_current_user_mcp(request) -> UserRecord

    Authenticate MCP requests unless explicitly disabled by environment.

    Notes
    -----
    Authentication is bypassed only when ``AUTH_DISABLED`` is truthy.
    """
    if _is_truthy_env("AUTH_DISABLED"):
        services = get_service_container(request)
        return services.auth_service.demo_user()
    return get_current_user(request)
