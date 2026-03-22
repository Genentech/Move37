"""REST router assembly for Move37."""

from __future__ import annotations

from fastapi import APIRouter

from .auth import router as auth_router
from .calendar import router as calendar_router
from .graph import router as graph_router
from .integrations import router as integrations_router
from .notes import router as notes_router
from .scheduling import router as scheduling_router


def build_rest_router() -> APIRouter:
    """Build the REST router bundle."""

    router = APIRouter()
    router.include_router(auth_router)
    router.include_router(graph_router)
    router.include_router(notes_router)
    router.include_router(calendar_router)
    router.include_router(integrations_router)
    router.include_router(scheduling_router)
    return router
