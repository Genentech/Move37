"""
REST router assembly.

Aggregates REST sub-routers for versioned API mounting.

Public API
----------
- :data:`router`: Aggregated REST router.
- :func:`build_rest_router`: Return the aggregated router.

Attributes
----------
router : APIRouter
    Aggregated router for REST endpoints.

Examples
--------
>>> from penroselamarck.api.routers.rest import router
>>> router.prefix
''

See Also
--------
:mod:`penroselamarck.api.routers.rest.auth`
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from penroselamarck.api.dependencies import get_current_user
from penroselamarck.api.routers.rest import auth, context, exercise, metrics, practice, train

router = APIRouter()
router.include_router(auth.router)
router.include_router(context.router, dependencies=[Depends(get_current_user)])
router.include_router(exercise.router, dependencies=[Depends(get_current_user)])
router.include_router(train.router, dependencies=[Depends(get_current_user)])
router.include_router(practice.router, dependencies=[Depends(get_current_user)])
router.include_router(metrics.router, dependencies=[Depends(get_current_user)])


def build_rest_router() -> APIRouter:
    """
    build_rest_router() -> APIRouter

    Concise (one-line) description of the function.

    Parameters
    ----------
    None
        This function does not accept parameters.

    Returns
    -------
    APIRouter
        Aggregated REST router.
    """
    return router
