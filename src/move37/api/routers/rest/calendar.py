"""Apple Calendar endpoints for the Move37 API."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from httpx import HTTPError

from move37.api.dependencies import get_current_subject, get_service_container
from move37.api.schemas import (
    AppleCalendarStatusOutput,
    CalendarEventListOutput,
    CalendarEventOutput,
    CalendarReconcileOutput,
)
from move37.services.container import ServiceContainer

router = APIRouter(tags=["calendar"])


@router.get("/calendars/apple/status", response_model=AppleCalendarStatusOutput)
def apple_calendar_status(
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> AppleCalendarStatusOutput:
    """Return the configured Apple Calendar integration status."""

    return AppleCalendarStatusOutput(**services.apple_calendar_service.get_status())


@router.get("/calendars/apple/events", response_model=CalendarEventListOutput)
def apple_calendar_events(
    start: Annotated[datetime, Query()],
    end: Annotated[datetime, Query()],
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> CalendarEventListOutput:
    """List Apple Calendar events in the requested range."""

    try:
        events = services.apple_calendar_service.list_events(subject, start, end)
    except HTTPError as error:
        raise HTTPException(status_code=503, detail="Apple Calendar unavailable.") from error
    return CalendarEventListOutput(events=[CalendarEventOutput(**event) for event in events])


@router.post("/calendars/apple/reconcile", response_model=CalendarReconcileOutput)
def apple_calendar_reconcile(
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> CalendarReconcileOutput:
    """Pull Apple Calendar changes back into the activity graph."""

    try:
        result = services.apple_calendar_service.reconcile(subject)
    except HTTPError as error:
        raise HTTPException(status_code=503, detail="Apple Calendar unavailable.") from error
    return CalendarReconcileOutput(**result)
