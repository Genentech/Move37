"""
MCP API schemas.

Pydantic models for REST and MCP transport inputs/outputs.

Public API
----------
- :class:`LoginInput`: Login request.
- :class:`LoginOutput`: Login response.
- :class:`EmptyInput`: Empty request payload.
- :class:`ContextInput`: Context update request.
- :class:`ContextOutput`: Context response.
- :class:`ExerciseCreateInput`: Exercise creation request.
- :class:`ExerciseListFilters`: Exercise listing filters.
- :class:`ExerciseListItem`: Exercise summary.
- :class:`TrainImportItem`: Training import input.
- :class:`TrainImportRequest`: Training import wrapper.
- :class:`TrainImportOutput`: Training import summary.
- :class:`PracticeStartInput`: Practice start request.
- :class:`PracticeStartOutput`: Practice start response.
- :class:`PracticeNextInput`: Practice next request.
- :class:`PracticeSubmitInput`: Practice submission request.
- :class:`PracticeSubmitOutput`: Practice submission response.
- :class:`PracticeEndInput`: Practice end request.
- :class:`PerformanceQuery`: Performance query filters.
- :class:`PerformanceOutput`: Performance summary response.

Attributes
----------
None

Examples
--------
>>> LoginInput(token="demo")
LoginInput(token='demo')

See Also
--------
:mod:`penroselamarck.schemas.performance_summary`
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from penroselamarck.schemas.performance_summary import PerformanceSummary


class LoginInput(BaseModel):
    """
    LoginInput(token) -> LoginInput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    token : str
        Token used to authenticate the user.

    Returns
    -------
    LoginInput
        Login request payload.
    """

    token: str


class LoginOutput(BaseModel):
    """
    LoginOutput(userId, roles) -> LoginOutput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    userId : str
        Unique user identifier.
    roles : List[str]
        Roles assigned to the user.

    Returns
    -------
    LoginOutput
        Login response payload.
    """

    userId: str
    roles: list[str]


class EmptyInput(BaseModel):
    """
    EmptyInput() -> EmptyInput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    None
        This schema does not accept parameters.

    Returns
    -------
    EmptyInput
        Empty payload schema.
    """

    pass


class ContextInput(BaseModel):
    """
    ContextInput(language) -> ContextInput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    language : str
        Language code to set.

    Returns
    -------
    ContextInput
        Context update payload.
    """

    language: str


class ContextOutput(BaseModel):
    """
    ContextOutput(activeContextId, language) -> ContextOutput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    activeContextId : str
        Identifier for the active context.
    language : str
        Active language.

    Returns
    -------
    ContextOutput
        Context response payload.
    """

    activeContextId: str
    language: str


class ExerciseCreateInput(BaseModel):
    """
    ExerciseCreateInput(question, answer, language, tags=None) -> ExerciseCreateInput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    question : str
        Exercise prompt.
    answer : str
        Expected answer.
    language : str
        Language code.
    tags : Optional[List[str]]
        Optional exercise tags.

    Returns
    -------
    ExerciseCreateInput
        Exercise creation payload.
    """

    question: str
    answer: str
    language: str
    tags: list[str] | None = None
    classes: list[str] | None = None


class ExerciseListFilters(BaseModel):
    """
    ExerciseListFilters(language=None, tags=None, limit=50, offset=0) -> ExerciseListFilters

    Concise (one-line) description of the schema.

    Parameters
    ----------
    language : Optional[str]
        Language filter.
    tags : Optional[List[str]]
        Tag filter list.
    limit : Optional[int]
        Maximum rows returned.
    offset : Optional[int]
        Result offset.

    Returns
    -------
    ExerciseListFilters
        Listing filter parameters.
    """

    language: str | None = None
    tags: list[str] | None = None
    classes: list[str] | None = None
    limit: int | None = 50
    offset: int | None = 0


class ExerciseListItem(BaseModel):
    """
    ExerciseListItem(exerciseId, question, language, tags=None, stats=None) -> ExerciseListItem

    Concise (one-line) description of the schema.

    Parameters
    ----------
    exerciseId : str
        Identifier for the exercise.
    question : str
        Exercise prompt.
    language : str
        Language code.
    tags : Optional[List[str]]
        Exercise tags.
    stats : Optional[Dict]
        Optional exercise statistics.

    Returns
    -------
    ExerciseListItem
        Exercise summary payload.
    """

    exerciseId: str
    question: str
    language: str
    tags: list[str] | None = None
    classes: list[str] | None = None
    stats: dict | None = None


class TrainImportItem(BaseModel):
    """
    TrainImportItem(question, answer, language, tags=None, source=None) -> TrainImportItem

    Concise (one-line) description of the schema.

    Parameters
    ----------
    question : str
        Exercise prompt.
    answer : str
        Expected answer.
    language : str
        Language code.
    tags : Optional[List[str]]
        Exercise tags.
    source : Optional[str]
        Source identifier.

    Returns
    -------
    TrainImportItem
        Training import item.
    """

    question: str
    answer: str
    language: str
    tags: list[str] | None = None
    classes: list[str] | None = None
    source: str | None = None


class ExerciseGraphNode(BaseModel):
    id: str
    label: str
    language: str
    tags: list[str]
    classes: list[str]


class ExerciseGraphEdge(BaseModel):
    source: str
    target: str
    sharedTags: list[str]
    sharedClasses: list[str]
    weight: int


class ExerciseGraphOutput(BaseModel):
    nodes: list[ExerciseGraphNode]
    edges: list[ExerciseGraphEdge]


class ExerciseSearchQuery(BaseModel):
    query: str
    language: str | None = None
    limit: int | None = 20


class ExerciseSearchItem(BaseModel):
    exerciseId: str
    question: str
    language: str
    tags: list[str] | None = None
    classes: list[str] | None = None
    score: float


class ExerciseClassifyOutput(BaseModel):
    scanned: int
    updated: int


class ExerciseClassifyInput(BaseModel):
    limit: int | None = 50


class TrainImportRequest(BaseModel):
    """
    TrainImportRequest(items) -> TrainImportRequest

    Concise (one-line) description of the schema.

    Parameters
    ----------
    items : List[TrainImportItem]
        Training import items.

    Returns
    -------
    TrainImportRequest
        Training import wrapper payload.
    """

    items: list[TrainImportItem]


class TrainImportOutput(BaseModel):
    """
    TrainImportOutput(importedCount, duplicates, errors) -> TrainImportOutput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    importedCount : int
        Number of imported items.
    duplicates : List[str]
        Duplicate content hashes.
    errors : List[Dict]
        Error entries with index and reason.

    Returns
    -------
    TrainImportOutput
        Training import summary.
    """

    importedCount: int
    duplicates: list[str]
    errors: list[dict]


class PracticeStartInput(BaseModel):
    """
    PracticeStartInput(language, count, strategy, filters=None) -> PracticeStartInput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    language : str
        Session language.
    count : int
        Requested exercise count.
    strategy : str
        Selection strategy.
    filters : Optional[Dict]
        Optional filter payload.

    Returns
    -------
    PracticeStartInput
        Practice start request payload.
    """

    language: str
    count: int
    strategy: str
    filters: dict | None = None


class PracticeStartOutput(BaseModel):
    """
    PracticeStartOutput(sessionId, selectedExerciseIds, remaining) -> PracticeStartOutput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    sessionId : str
        Session identifier.
    selectedExerciseIds : List[str]
        Selected exercises.
    remaining : int
        Remaining count.

    Returns
    -------
    PracticeStartOutput
        Practice start response.
    """

    sessionId: str
    selectedExerciseIds: list[str]
    remaining: int


class PracticeNextInput(BaseModel):
    """
    PracticeNextInput(sessionId) -> PracticeNextInput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    sessionId : str
        Session identifier.

    Returns
    -------
    PracticeNextInput
        Practice next request payload.
    """

    sessionId: str


class PracticeSubmitInput(BaseModel):
    """
    PracticeSubmitInput(sessionId, exerciseId, userAnswer) -> PracticeSubmitInput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    sessionId : str
        Session identifier.
    exerciseId : str
        Exercise identifier.
    userAnswer : str
        Learner answer.

    Returns
    -------
    PracticeSubmitInput
        Practice submit request.
    """

    sessionId: str
    exerciseId: str
    userAnswer: str


class PracticeSubmitOutput(BaseModel):
    """
    PracticeSubmitOutput(passed, score, feedback, expectedAnswer, nextReady) -> PracticeSubmitOutput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    passed : bool
        Whether the answer passed.
    score : float
        Score for the answer.
    feedback : str
        Feedback message.
    expectedAnswer : str
        The correct answer.
    nextReady : bool
        Whether another exercise is ready.

    Returns
    -------
    PracticeSubmitOutput
        Practice submission response.
    """

    passed: bool
    score: float
    feedback: str
    expectedAnswer: str
    nextReady: bool


class PracticeEndInput(BaseModel):
    """
    PracticeEndInput(sessionId) -> PracticeEndInput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    sessionId : str
        Session identifier.

    Returns
    -------
    PracticeEndInput
        Practice end request payload.
    """

    sessionId: str


class PerformanceQuery(BaseModel):
    """
    PerformanceQuery(language, tags=None, since=None) -> PerformanceQuery

    Concise (one-line) description of the schema.

    Parameters
    ----------
    language : str
        Language filter.
    tags : Optional[List[str]]
        Tag filter list.
    since : Optional[datetime]
        Filter by time threshold.

    Returns
    -------
    PerformanceQuery
        Performance query filters.
    """

    language: str
    tags: list[str] | None = None
    since: datetime | None = None


class PerformanceOutput(BaseModel):
    """
    PerformanceOutput(items, aggregates) -> PerformanceOutput

    Concise (one-line) description of the schema.

    Parameters
    ----------
    items : List[PerformanceSummary]
        Performance summaries.
    aggregates : Dict
        Aggregate metrics.

    Returns
    -------
    PerformanceOutput
        Performance response payload.
    """

    items: list[PerformanceSummary]
    aggregates: dict
