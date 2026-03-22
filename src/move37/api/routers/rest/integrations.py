"""Integration-management endpoints for Move37."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from httpx import HTTPError

from move37.api.dependencies import get_current_subject, get_service_container
from move37.api.schemas import (
    AppleCalendarConnectInput,
    AppleCalendarPreferencesInput,
    AppleCalendarStatusOutput,
)
from move37.services.container import ServiceContainer

router = APIRouter(tags=["integrations"])


@router.get("/integrations/apple/status", response_model=AppleCalendarStatusOutput)
def apple_integration_status(
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> AppleCalendarStatusOutput:
    """Return the active user's Apple Calendar integration status."""

    return AppleCalendarStatusOutput(**services.apple_calendar_service.get_status(subject))


@router.post("/integrations/apple/connect", response_model=AppleCalendarStatusOutput)
def apple_integration_connect(
    payload: AppleCalendarConnectInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> AppleCalendarStatusOutput:
    """Connect Apple Calendar using CalDAV credentials."""

    try:
        result = services.apple_calendar_service.connect(
            subject,
            payload.username,
            payload.password,
            base_url=payload.baseUrl,
            writable_calendar_id=payload.writableCalendarId,
        )
    except HTTPError as error:
        raise HTTPException(status_code=503, detail="Apple Calendar unavailable.") from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return AppleCalendarStatusOutput(**result)


@router.post("/integrations/apple/disconnect", response_model=AppleCalendarStatusOutput)
def apple_integration_disconnect(
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> AppleCalendarStatusOutput:
    """Disconnect Apple Calendar for the active user."""

    return AppleCalendarStatusOutput(**services.apple_calendar_service.disconnect(subject))


@router.put("/integrations/apple/preferences", response_model=AppleCalendarStatusOutput)
def apple_integration_update_preferences(
    payload: AppleCalendarPreferencesInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> AppleCalendarStatusOutput:
    """Update Apple Calendar preferences for the active user."""

    try:
        result = services.apple_calendar_service.update_preferences(subject, payload.writableCalendarId)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return AppleCalendarStatusOutput(**result)
