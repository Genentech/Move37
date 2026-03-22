"""Scheduling endpoints for explicit sync/replan flows."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from httpx import HTTPError

from move37.api.dependencies import get_current_subject, get_service_container
from move37.api.schemas import SchedulingReplanInput, SchedulingReplanOutput
from move37.services.container import ServiceContainer

router = APIRouter(tags=["scheduling"])


@router.post("/scheduling/replan", response_model=SchedulingReplanOutput)
def scheduling_replan(
    payload: SchedulingReplanInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> SchedulingReplanOutput:
    """Compute or apply a schedule plan."""

    try:
        result = services.scheduling_service.replan(
            subject,
            payload.mode,
            payload.parameters.model_dump(),
        )
    except HTTPError as error:
        raise HTTPException(status_code=503, detail="Scheduling dependencies unavailable.") from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return SchedulingReplanOutput(**result)
