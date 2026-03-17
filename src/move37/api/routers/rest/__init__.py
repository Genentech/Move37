"""REST router assembly for Move37."""

from __future__ import annotations

from fastapi import APIRouter

from .auth import router as auth_router
from .calendar import router as calendar_router
from .chat import router as chat_router
from .graph import router as graph_router
from .notes import router as notes_router


def build_rest_router() -> APIRouter:
    """Build the REST router bundle."""

    router = APIRouter()
    router.include_router(auth_router)
    router.include_router(graph_router)
    router.include_router(notes_router)
    router.include_router(chat_router)
    router.include_router(calendar_router)
    return router
