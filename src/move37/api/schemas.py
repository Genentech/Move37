"""REST transport schemas for the Move37 API."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ViewerOutput(BaseModel):
    """Authenticated viewer description."""

    model_config = ConfigDict(extra="forbid")

    subject: str
    mode: str


class EmptyInput(BaseModel):
    """Empty tool input payload."""

    model_config = ConfigDict(extra="forbid")


class ActivityNodePayload(BaseModel):
    """Shared editable node fields."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    notes: str = ""
    startDate: str = ""
    bestBefore: str = ""
    expectedTime: float | None = None
    realTime: float = 0
    expectedEffort: float | None = None
    realEffort: float | None = None
    kind: str = Field(default="activity", pattern="^(activity|note)$")
    linkedNoteId: int | None = None


class ActivityNodePatch(BaseModel):
    """Partial node update payload."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    notes: str | None = None
    startDate: str | None = None
    bestBefore: str | None = None
    expectedTime: float | None = None
    realTime: float | None = None
    expectedEffort: float | None = None
    realEffort: float | None = None
    kind: str | None = Field(default=None, pattern="^(activity|note)$")
    linkedNoteId: int | None = None


class UpdateActivityInput(ActivityNodePatch):
    """Tool payload for updating an activity."""

    activityId: str


class ActivityNodeOutput(ActivityNodePayload):
    """Transport-safe activity node."""

    id: str
    workStartedAt: str | None = None


class NotePayload(BaseModel):
    """Shared note payload."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    body: str = ""


class NotePatch(BaseModel):
    """Partial note update payload."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    body: str | None = None


class NoteOutput(NotePayload):
    """Transport-safe note payload."""

    id: int
    sourceType: str
    sourceFilename: str | None = None
    linkedActivityId: str | None = None
    ingestStatus: str
    ingestError: str | None = None
    contentSha256: str
    lastEmbeddedAt: str | None = None
    createdAt: str
    updatedAt: str


class NoteListOutput(BaseModel):
    """List of notes."""

    model_config = ConfigDict(extra="forbid")

    notes: list[NoteOutput]


class NoteCreateResponse(BaseModel):
    """Create/update note response."""

    model_config = ConfigDict(extra="forbid")

    note: NoteOutput
    graph: ActivityGraphOutput


class NoteImportItemInput(BaseModel):
    """MCP import payload."""

    model_config = ConfigDict(extra="forbid")

    filename: str = Field(min_length=1)
    content: str


class NoteImportInput(BaseModel):
    """MCP note import payload."""

    model_config = ConfigDict(extra="forbid")

    files: list[NoteImportItemInput]


class NoteImportUrlInput(BaseModel):
    """REST note import-from-url payload."""

    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1)


class NoteImportResponse(BaseModel):
    """Imported notes payload."""

    model_config = ConfigDict(extra="forbid")

    notes: list[NoteOutput]
    graph: ActivityGraphOutput


class NoteSearchInput(BaseModel):
    """Semantic note search request."""

    model_config = ConfigDict(extra="forbid")

    query: str = Field(min_length=1)
    topK: int = Field(default=8, ge=1, le=20)


class NoteSearchHitOutput(BaseModel):
    """One semantic search hit."""

    model_config = ConfigDict(extra="forbid")

    noteId: int
    noteTitle: str
    linkedActivityId: str | None = None
    chunkId: str
    chunkIndex: int
    score: float
    snippet: str


class NoteSearchOutput(BaseModel):
    """Semantic note search results."""

    model_config = ConfigDict(extra="forbid")

    results: list[NoteSearchHitOutput]


class NoteIdInput(BaseModel):
    """Simple note identifier payload."""

    model_config = ConfigDict(extra="forbid")

    noteId: int


class UpdateNoteInput(NotePatch):
    """MCP update note payload."""

    noteId: int


class ChatSessionCreateInput(BaseModel):
    """Create a chat session."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = None


class ChatCitationOutput(BaseModel):
    """Grounding citation returned by chat."""

    model_config = ConfigDict(extra="forbid")

    noteId: int
    noteTitle: str
    linkedActivityId: str | None = None
    chunkId: str
    chunkIndex: int
    score: float
    snippet: str


class ChatMessageOutput(BaseModel):
    """Transport-safe chat message."""

    model_config = ConfigDict(extra="forbid")

    id: int
    role: str
    content: str
    citations: list[ChatCitationOutput]
    traceId: str | None = None
    createdAt: str


class ChatSessionOutput(BaseModel):
    """Transport-safe chat session."""

    model_config = ConfigDict(extra="forbid")

    id: int
    title: str
    lastMessageAt: str | None = None
    createdAt: str
    updatedAt: str
    messages: list[ChatMessageOutput]


class ChatMessageCreateInput(BaseModel):
    """Send a chat message."""

    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1)


class ChatMessageToolInput(ChatMessageCreateInput):
    """MCP send message payload."""

    sessionId: int


class ChatMessageResponse(BaseModel):
    """Combined user/assistant chat result."""

    model_config = ConfigDict(extra="forbid")

    userMessage: ChatMessageOutput
    assistantMessage: ChatMessageOutput


class ActivityDependencyOutput(BaseModel):
    """Dependency edge payload."""

    model_config = ConfigDict(extra="forbid")

    parentId: str
    childId: str


class ActivityScheduleOutput(BaseModel):
    """Schedule edge payload."""

    model_config = ConfigDict(extra="forbid")

    earlierId: str
    laterId: str


class ActivityGraphOutput(BaseModel):
    """Full graph payload."""

    model_config = ConfigDict(extra="forbid")

    graphId: int
    version: int
    nodes: list[ActivityNodeOutput]
    dependencies: list[ActivityDependencyOutput]
    schedules: list[ActivityScheduleOutput]


class CreateActivityInput(ActivityNodePayload):
    """Create-activity payload."""

    parentIds: list[str] | None = None


class InsertBetweenInput(ActivityNodePayload):
    """Insert-between payload."""

    parentId: str
    childId: str


class ReplaceDependenciesInput(BaseModel):
    """Dependency replacement payload."""

    model_config = ConfigDict(extra="forbid")

    parentIds: list[str]


class SchedulePeerInput(BaseModel):
    """Schedule peer relation selection."""

    model_config = ConfigDict(extra="forbid")

    id: str
    relation: str = Field(pattern="^(before|after|none)$")


class ReplaceScheduleInput(BaseModel):
    """Schedule replacement payload."""

    model_config = ConfigDict(extra="forbid")

    peers: list[SchedulePeerInput]


class ActivityIdInput(BaseModel):
    """Activity identifier payload."""

    model_config = ConfigDict(extra="forbid")

    activityId: str


class DeleteActivityInput(ActivityIdInput):
    """Delete-activity tool payload."""

    deleteTree: bool = False


class ReplaceActivityDependenciesInput(ReplaceDependenciesInput):
    """Activity dependencies replacement tool payload."""

    activityId: str


class ReplaceActivityScheduleInput(ReplaceScheduleInput):
    """Activity schedule replacement tool payload."""

    activityId: str


class DependencyEdgeInput(BaseModel):
    """Dependency edge payload."""

    model_config = ConfigDict(extra="forbid")

    parentId: str
    childId: str


class ScheduleEdgeInput(BaseModel):
    """Schedule edge payload."""

    model_config = ConfigDict(extra="forbid")

    earlierId: str
    laterId: str


NoteCreateResponse.model_rebuild()
NoteImportResponse.model_rebuild()
