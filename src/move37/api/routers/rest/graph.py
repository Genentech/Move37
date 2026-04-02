"""Graph endpoints for the Move37 API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from move37.api.dependencies import get_current_subject, get_service_container
from move37.api.schemas import (
    ActivityGraphOutput,
    ActivityNodeOutput,
    ActivityNodePatch,
    CreateActivityInput,
    InsertBetweenInput,
    ReplaceDependenciesInput,
    ReplaceScheduleInput,
)
from move37.services.activity_graph import SchedulePeer
from move37.services.container import ServiceContainer
from move37.services.errors import ConflictError, NotFoundError

router = APIRouter(tags=["graph"])


def _handle_service_error(error: Exception) -> None:
    if isinstance(error, ConflictError):
        raise HTTPException(status_code=409, detail=error.message) from error
    if isinstance(error, NotFoundError):
        raise HTTPException(status_code=404, detail=error.message) from error
    raise error


@router.get("/graph", response_model=ActivityGraphOutput)
def graph_get(
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityGraphOutput:
    """Return the active user's graph."""

    return ActivityGraphOutput(**services.activity_graph_service.get_graph(subject))


@router.post("/activities", response_model=ActivityGraphOutput)
def activity_create(
    payload: CreateActivityInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityGraphOutput:
    """Create a new activity."""

    try:
        result = services.activity_graph_service.create_activity(
            subject,
            payload.model_dump(exclude={"parentIds"}),
            payload.parentIds,
        )
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityGraphOutput(**result)


@router.post("/activities/{activity_id}/insert-between", response_model=ActivityGraphOutput)
def activity_insert_between(
    activity_id: str,
    payload: InsertBetweenInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityGraphOutput:
    """Insert a node between an existing dependency edge."""

    del activity_id
    try:
        result = services.activity_graph_service.insert_between(
            subject,
            payload.parentId,
            payload.childId,
            payload.model_dump(exclude={"parentId", "childId"}),
        )
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityGraphOutput(**result)


@router.patch("/activities/{activity_id}", response_model=ActivityNodeOutput)
def activity_update(
    activity_id: str,
    payload: ActivityNodePatch,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityNodeOutput:
    """Update a single activity."""

    try:
        result = services.activity_graph_service.update_activity(
            subject,
            activity_id,
            payload.model_dump(exclude_unset=True),
        )
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityNodeOutput(**result)


@router.post("/activities/{activity_id}/work/start", response_model=ActivityNodeOutput)
def activity_start_work(
    activity_id: str,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityNodeOutput:
    """Start work for a node."""

    try:
        result = services.activity_graph_service.start_work(subject, activity_id)
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityNodeOutput(**result)


@router.post("/activities/{activity_id}/work/stop", response_model=ActivityNodeOutput)
def activity_stop_work(
    activity_id: str,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityNodeOutput:
    """Stop work for a node."""

    try:
        result = services.activity_graph_service.stop_work(subject, activity_id)
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityNodeOutput(**result)


@router.post("/activities/{activity_id}/fork", response_model=ActivityGraphOutput)
def activity_fork(
    activity_id: str,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityGraphOutput:
    """Fork an existing activity."""

    try:
        result = services.activity_graph_service.fork_activity(subject, activity_id)
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityGraphOutput(**result)


@router.delete("/activities/{activity_id}", response_model=ActivityGraphOutput)
def activity_delete(
    activity_id: str,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
    delete_tree: bool = Query(False, alias="deleteTree"),
) -> ActivityGraphOutput:
    """Delete an activity."""

    try:
        result = services.activity_graph_service.delete_activity(subject, activity_id, delete_tree)
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityGraphOutput(**result)


@router.put("/activities/{activity_id}/dependencies", response_model=ActivityGraphOutput)
def activity_replace_dependencies(
    activity_id: str,
    payload: ReplaceDependenciesInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityGraphOutput:
    """Replace a node's dependencies."""

    try:
        result = services.activity_graph_service.replace_dependencies(
            subject,
            activity_id,
            payload.parentIds,
        )
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityGraphOutput(**result)


@router.put(
    "/activities/{activity_id}/schedule",
    response_model=ActivityGraphOutput,
    deprecated=True,
    description="Unsupported. Schedule edges are derived from startDate. Always returns 409.",
    responses={409: {"description": "Schedule edges are derived from startDate and cannot be mutated directly."}},
)
def activity_replace_schedule(
    activity_id: str,
    payload: ReplaceScheduleInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityGraphOutput:
    """Replace a node's schedule relations (unsupported -- always returns 409)."""

    try:
        result = services.activity_graph_service.replace_schedule(
            subject,
            activity_id,
            [SchedulePeer(**peer.model_dump()) for peer in payload.peers],
        )
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityGraphOutput(**result)


@router.delete("/dependencies/{parent_id}/{child_id}", response_model=ActivityGraphOutput)
def dependency_delete(
    parent_id: str,
    child_id: str,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityGraphOutput:
    """Delete a dependency edge."""

    try:
        result = services.activity_graph_service.delete_dependency(subject, parent_id, child_id)
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityGraphOutput(**result)


@router.delete(
    "/schedules/{earlier_id}/{later_id}",
    response_model=ActivityGraphOutput,
    deprecated=True,
    description="Unsupported. Schedule edges are derived from startDate. Always returns 409.",
    responses={409: {"description": "Schedule edges are derived from startDate and cannot be mutated directly."}},
)
def schedule_delete(
    earlier_id: str,
    later_id: str,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ActivityGraphOutput:
    """Delete a schedule edge (unsupported -- always returns 409)."""

    try:
        result = services.activity_graph_service.delete_schedule(subject, earlier_id, later_id)
    except Exception as error:  # pragma: no cover - mapped below
        _handle_service_error(error)
    return ActivityGraphOutput(**result)
