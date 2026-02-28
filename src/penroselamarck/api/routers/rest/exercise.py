"""
Exercise REST endpoints.

Defines routes for creating and listing exercises.

Public API
----------
- :data:`router`: FastAPI router for exercise endpoints.

Attributes
----------
router : APIRouter
    Router exposing exercise endpoints.

Examples
--------
>>> from penroselamarck.api.routers.rest.exercise import router
>>> router.prefix
''

See Also
--------
:mod:`penroselamarck.services.exercise_service`
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from penroselamarck.api.dependencies import get_service_container
from penroselamarck.api.schemas import (
    ExerciseClassifyOutput,
    ExerciseCreateInput,
    ExerciseGraphOutput,
    ExerciseListFilters,
    ExerciseListItem,
    ExerciseSearchItem,
    ExerciseSearchQuery,
)
from penroselamarck.services.container import ServiceContainer
from penroselamarck.services.errors import ConflictError

router = APIRouter()


@router.post("/exercise", response_model=ExerciseListItem)
def exercise_create(
    payload: ExerciseCreateInput,
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> ExerciseListItem:
    """
    exercise_create(payload, services) -> ExerciseListItem

    Concise (one-line) description of the function.

    Parameters
    ----------
    payload : ExerciseCreateInput
        Fields to create an exercise.
    services : ServiceContainer
        Service container dependency.

    Returns
    -------
    ExerciseListItem
        A summary of the created exercise.
    """
    try:
        row = services.exercise_service.create_exercise(
            question=payload.question,
            answer=payload.answer,
            language=payload.language,
            tags=payload.tags,
            classes=payload.classes,
        )
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=exc.message) from exc
    return ExerciseListItem(**row)


@router.get("/exercise", response_model=list[ExerciseListItem])
def exercise_list(
    filters: Annotated[ExerciseListFilters, Depends()],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> list[ExerciseListItem]:
    """
    exercise_list(filters, services) -> List[ExerciseListItem]

    Concise (one-line) description of the function.

    Parameters
    ----------
    filters : ExerciseListFilters
        Query filters for exercises.
    services : ServiceContainer
        Service container dependency.

    Returns
    -------
    List[ExerciseListItem]
        Exercise summaries matching the filters.
    """
    rows = services.exercise_service.list_exercises(
        language=filters.language,
        tags=filters.tags,
        classes=filters.classes,
        limit=filters.limit or 50,
        offset=filters.offset or 0,
    )
    return [ExerciseListItem(**row) for row in rows]


@router.get("/exercise/graph", response_model=ExerciseGraphOutput)
def exercise_graph(
    services: Annotated[ServiceContainer, Depends(get_service_container)],
    language: str | None = None,
) -> ExerciseGraphOutput:
    graph = services.exercise_service.build_exercise_graph(language=language)
    return ExerciseGraphOutput(**graph)


@router.get("/exercise/search", response_model=list[ExerciseSearchItem])
def exercise_search(
    q: Annotated[ExerciseSearchQuery, Depends()],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> list[ExerciseSearchItem]:
    rows = services.exercise_service.semantic_search_exercises(
        query=q.query,
        language=q.language,
        limit=q.limit or 20,
    )
    return [ExerciseSearchItem(**row) for row in rows]


@router.post("/exercise/classify", response_model=ExerciseClassifyOutput)
def exercise_classify(
    services: Annotated[ServiceContainer, Depends(get_service_container)],
    limit: int = 50,
) -> ExerciseClassifyOutput:
    result = services.exercise_service.classify_unclassified_exercises(limit=limit)
    return ExerciseClassifyOutput(**result)
