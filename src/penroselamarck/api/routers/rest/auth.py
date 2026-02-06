"""
Authentication REST endpoints.

Defines REST routes for login and user context.

Public API
----------
- :data:`router`: FastAPI router for auth endpoints.

Attributes
----------
router : APIRouter
    Router exposing authentication endpoints.

Examples
--------
>>> from penroselamarck.api.routers.rest.auth import router
>>> router.prefix
''

See Also
--------
:mod:`penroselamarck.services.auth_service`
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from penroselamarck.api.dependencies import get_current_user, get_service_container
from penroselamarck.api.schemas import LoginInput, LoginOutput
from penroselamarck.repositories.user_repository import UserRecord
from penroselamarck.services.container import ServiceContainer
from penroselamarck.services.errors import ServiceError

router = APIRouter()


@router.post("/auth/login", response_model=LoginOutput)
def auth_login(
    payload: LoginInput,
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> LoginOutput:
    """
    auth_login(payload, services) -> LoginOutput

    Concise (one-line) description of the function.

    Parameters
    ----------
    payload : LoginInput
        Token used to authenticate the user.
    services : ServiceContainer
        Service container dependency.

    Returns
    -------
    LoginOutput
        Authenticated user information.
    """
    try:
        user = services.auth_service.login(payload.token)
    except ServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=exc.message,
        ) from exc
    return LoginOutput(userId=user.user_id, roles=user.roles)


@router.get("/auth/me", response_model=LoginOutput)
def auth_me(
    current_user: Annotated[UserRecord, Depends(get_current_user)],
) -> LoginOutput:
    """
    auth_me(current_user) -> LoginOutput

    Concise (one-line) description of the function.

    Parameters
    ----------
    current_user : UserRecord
        Authenticated user record.

    Returns
    -------
    LoginOutput
        The current user context (demo user).
    """
    return LoginOutput(userId=current_user.user_id, roles=current_user.roles)
