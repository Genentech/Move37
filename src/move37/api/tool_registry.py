"""MCP tool registry for Move37."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from move37.api import schemas
from move37.services.container import ServiceContainer
from move37.services.notes import ImportTextPayload


@dataclass(frozen=True)
class ToolDefinition:
    """Tool metadata exposed to MCP clients."""

    name: str
    description: str
    input_model: type[BaseModel]


class McpToolRegistry:
    """List and dispatch Move37 MCP tools."""

    def __init__(self, services: ServiceContainer) -> None:
        self._services = services
        self._definitions = [
            ToolDefinition("system.health", "Return API health.", schemas.EmptyInput),
            ToolDefinition("auth.me", "Return the authenticated subject.", schemas.EmptyInput),
            ToolDefinition("graph.get", "Return the current activity graph.", schemas.EmptyInput),
            ToolDefinition("activity.create", "Create an activity.", schemas.CreateActivityInput),
            ToolDefinition(
                "activity.insert_between",
                "Insert an activity between a dependency edge.",
                schemas.InsertBetweenInput,
            ),
            ToolDefinition("activity.update", "Update an activity.", schemas.UpdateActivityInput),
            ToolDefinition("activity.work.start", "Start work on an activity.", schemas.ActivityIdInput),
            ToolDefinition("activity.work.stop", "Stop work on an activity.", schemas.ActivityIdInput),
            ToolDefinition("activity.fork", "Fork an activity.", schemas.ActivityIdInput),
            ToolDefinition("activity.delete", "Delete an activity.", schemas.DeleteActivityInput),
            ToolDefinition(
                "activity.dependencies.replace",
                "Replace an activity's dependencies.",
                schemas.ReplaceActivityDependenciesInput,
            ),
            ToolDefinition("dependency.delete", "Delete a dependency edge.", schemas.DependencyEdgeInput),
            ToolDefinition("note.create", "Create a note and linked graph node.", schemas.NotePayload),
            ToolDefinition("note.update", "Update a note and linked graph node.", schemas.UpdateNoteInput),
            ToolDefinition("note.get", "Fetch a note.", schemas.NoteIdInput),
            ToolDefinition("note.list", "List notes.", schemas.EmptyInput),
            ToolDefinition("note.import_txt", "Import txt notes.", schemas.NoteImportInput),
            ToolDefinition("note.search", "Semantic note search.", schemas.NoteSearchInput),
            ToolDefinition("chat.session.create", "Create a notes chat session.", schemas.ChatSessionCreateInput),
            ToolDefinition("chat.message.send", "Send a note-grounded chat message.", schemas.ChatMessageToolInput),
        ]
        self._handlers: dict[str, Callable[[str, dict[str, Any]], Any]] = {
            "system.health": self._handle_health,
            "auth.me": self._handle_auth_me,
            "graph.get": self._handle_graph_get,
            "activity.create": self._handle_activity_create,
            "activity.insert_between": self._handle_activity_insert_between,
            "activity.update": self._handle_activity_update,
            "activity.work.start": self._handle_activity_work_start,
            "activity.work.stop": self._handle_activity_work_stop,
            "activity.fork": self._handle_activity_fork,
            "activity.delete": self._handle_activity_delete,
            "activity.dependencies.replace": self._handle_activity_dependencies_replace,
            "dependency.delete": self._handle_dependency_delete,
            "note.create": self._handle_note_create,
            "note.update": self._handle_note_update,
            "note.get": self._handle_note_get,
            "note.list": self._handle_note_list,
            "note.import_txt": self._handle_note_import_txt,
            "note.search": self._handle_note_search,
            "chat.session.create": self._handle_chat_session_create,
            "chat.message.send": self._handle_chat_message_send,
        }

    def list_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "name": definition.name,
                "description": definition.description,
                "inputSchema": definition.input_model.model_json_schema(),
            }
            for definition in self._definitions
        ]

    def call_tool(self, name: str, arguments: dict[str, Any] | None, subject: str) -> Any:
        handler = self._handlers.get(name)
        if handler is None:
            raise ValueError(f"Unknown tool: {name}")
        return handler(subject, arguments or {})

    @staticmethod
    def _handle_health(subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        del subject
        schemas.EmptyInput.model_validate(arguments)
        return {"status": "ok"}

    @staticmethod
    def _handle_auth_me(subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        schemas.EmptyInput.model_validate(arguments)
        return schemas.ViewerOutput(subject=subject, mode="bearer").model_dump()

    def _handle_graph_get(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        schemas.EmptyInput.model_validate(arguments)
        return schemas.ActivityGraphOutput(
            **self._services.activity_graph_service.get_graph(subject)
        ).model_dump()

    def _handle_activity_create(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.CreateActivityInput.model_validate(arguments)
        return schemas.ActivityGraphOutput(
            **self._services.activity_graph_service.create_activity(
                subject,
                payload.model_dump(exclude={"parentIds"}),
                payload.parentIds,
            )
        ).model_dump()

    def _handle_activity_insert_between(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.InsertBetweenInput.model_validate(arguments)
        return schemas.ActivityGraphOutput(
            **self._services.activity_graph_service.insert_between(
                subject,
                payload.parentId,
                payload.childId,
                payload.model_dump(exclude={"parentId", "childId"}),
            )
        ).model_dump()

    def _handle_activity_update(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.UpdateActivityInput.model_validate(arguments)
        activity_id = arguments.get("activityId")
        if not activity_id:
            raise ValueError("Missing activityId")
        return schemas.ActivityNodeOutput(
            **self._services.activity_graph_service.update_activity(
                subject,
                str(activity_id),
                payload.model_dump(exclude={"activityId"}, exclude_unset=True),
            )
        ).model_dump()

    def _handle_activity_work_start(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.ActivityIdInput.model_validate(arguments)
        return schemas.ActivityNodeOutput(
            **self._services.activity_graph_service.start_work(subject, payload.activityId)
        ).model_dump()

    def _handle_activity_work_stop(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.ActivityIdInput.model_validate(arguments)
        return schemas.ActivityNodeOutput(
            **self._services.activity_graph_service.stop_work(subject, payload.activityId)
        ).model_dump()

    def _handle_activity_fork(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.ActivityIdInput.model_validate(arguments)
        return schemas.ActivityGraphOutput(
            **self._services.activity_graph_service.fork_activity(subject, payload.activityId)
        ).model_dump()

    def _handle_activity_delete(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.DeleteActivityInput.model_validate(arguments)
        return schemas.ActivityGraphOutput(
            **self._services.activity_graph_service.delete_activity(
                subject,
                payload.activityId,
                payload.deleteTree,
            )
        ).model_dump()

    def _handle_activity_dependencies_replace(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.ReplaceActivityDependenciesInput.model_validate(arguments)
        return schemas.ActivityGraphOutput(
            **self._services.activity_graph_service.replace_dependencies(
                subject,
                payload.activityId,
                payload.parentIds,
            )
        ).model_dump()

    def _handle_dependency_delete(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.DependencyEdgeInput.model_validate(arguments)
        return schemas.ActivityGraphOutput(
            **self._services.activity_graph_service.delete_dependency(
                subject,
                payload.parentId,
                payload.childId,
            )
        ).model_dump()

    def _handle_note_create(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.NotePayload.model_validate(arguments)
        response = self._services.note_service.create_note(subject, title=payload.title, body=payload.body)
        return schemas.NoteCreateResponse(
            note=schemas.NoteOutput(**response["note"]),
            graph=schemas.ActivityGraphOutput(**response["graph"]),
        ).model_dump()

    def _handle_note_update(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.UpdateNoteInput.model_validate(arguments)
        response = self._services.note_service.update_note(
            subject,
            payload.noteId,
            title=payload.title,
            body=payload.body,
        )
        return schemas.NoteCreateResponse(
            note=schemas.NoteOutput(**response["note"]),
            graph=schemas.ActivityGraphOutput(**response["graph"]),
        ).model_dump()

    def _handle_note_get(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.NoteIdInput.model_validate(arguments)
        return schemas.NoteOutput(**self._services.note_service.get_note(subject, payload.noteId)).model_dump()

    def _handle_note_list(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        schemas.EmptyInput.model_validate(arguments)
        return schemas.NoteListOutput(
            notes=[schemas.NoteOutput(**note) for note in self._services.note_service.list_notes(subject)]
        ).model_dump()

    def _handle_note_import_txt(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.NoteImportInput.model_validate(arguments)
        response = self._services.note_service.import_texts(
            subject,
            [
                ImportTextPayload(filename=file.filename, content=file.content)
                for file in payload.files
            ],
        )
        return schemas.NoteImportResponse(
            notes=[schemas.NoteOutput(**note) for note in response["notes"]],
            graph=schemas.ActivityGraphOutput(**response["graph"]),
        ).model_dump()

    def _handle_note_search(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.NoteSearchInput.model_validate(arguments)
        return schemas.NoteSearchOutput(
            results=self._services.ai_client.search_notes(subject=subject, query=payload.query, top_k=payload.topK)
        ).model_dump()

    def _handle_chat_session_create(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.ChatSessionCreateInput.model_validate(arguments)
        return schemas.ChatSessionOutput(
            **self._services.chat_session_service.create_session(subject, payload.title)
        ).model_dump()

    def _handle_chat_message_send(self, subject: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = schemas.ChatMessageToolInput.model_validate(arguments)
        response = self._services.chat_session_service.send_message(subject, payload.sessionId, payload.content)
        return schemas.ChatMessageResponse(
            userMessage=schemas.ChatMessageOutput(**response["userMessage"]),
            assistantMessage=schemas.ChatMessageOutput(**response["assistantMessage"]),
        ).model_dump()
