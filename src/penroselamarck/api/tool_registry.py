"""
MCP tool registry.

Defines available MCP tools and dispatches calls to services.

Public API
----------
- :class:`ToolDefinition`: Tool metadata container.
- :class:`McpToolRegistry`: Tool listing and invocation.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.services.container import ServiceContainer
>>> registry = McpToolRegistry(ServiceContainer())
>>> isinstance(registry.list_tools(), list)
True

See Also
--------
:mod:`penroselamarck.api.schemas`
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from penroselamarck.api import schemas
from penroselamarck.schemas.performance_summary import PerformanceSummary
from penroselamarck.services.container import ServiceContainer


@dataclass(frozen=True)
class ToolDefinition:
    """
    ToolDefinition(name, description, input_model) -> ToolDefinition

    Concise (one-line) description of the data structure.

    Parameters
    ----------
    name : str
        MCP tool name.
    description : str
        Tool description.
    input_model : Type[BaseModel]
        Pydantic model defining tool inputs.

    Returns
    -------
    ToolDefinition
        Immutable tool metadata.
    """

    name: str
    description: str
    input_model: type[BaseModel]


class McpToolRegistry:
    """
    McpToolRegistry(services) -> McpToolRegistry

    Concise (one-line) description of the registry.

    Methods
    -------
    list_tools()
        Return tool definitions for MCP clients.
    call_tool(name, arguments)
        Invoke a tool by name.
    """

    def __init__(self, services: ServiceContainer) -> None:
        """
        __init__(services) -> None

        Concise (one-line) description of the initializer.

        Parameters
        ----------
        services : ServiceContainer
            Service container with business logic.

        Returns
        -------
        None
            Initializes the registry.
        """
        self._services = services
        self._definitions = [
            ToolDefinition("auth.login", "Authenticate with a token.", schemas.LoginInput),
            ToolDefinition("auth.me", "Return the demo user.", schemas.EmptyInput),
            ToolDefinition(
                "study.context.set", "Set the active study context.", schemas.ContextInput
            ),
            ToolDefinition(
                "study.context.get", "Get the active study context.", schemas.EmptyInput
            ),
            ToolDefinition("exercise.create", "Create an exercise.", schemas.ExerciseCreateInput),
            ToolDefinition("exercise.list", "List exercises.", schemas.ExerciseListFilters),
            ToolDefinition("exercise.graph", "Build exercise graph.", schemas.ExerciseListFilters),
            ToolDefinition(
                "exercise.search",
                "Semantic search exercises.",
                schemas.ExerciseSearchQuery,
            ),
            ToolDefinition(
                "exercise.classify",
                "Classify unclassified exercises.",
                schemas.ExerciseClassifyInput,
            ),
            ToolDefinition("train.import", "Bulk import exercises.", schemas.TrainImportRequest),
            ToolDefinition(
                "practice.start", "Start a practice session.", schemas.PracticeStartInput
            ),
            ToolDefinition("practice.next", "Get the next exercise.", schemas.PracticeNextInput),
            ToolDefinition("practice.submit", "Submit an answer.", schemas.PracticeSubmitInput),
            ToolDefinition("practice.end", "End a practice session.", schemas.PracticeEndInput),
            ToolDefinition(
                "metrics.performance", "Get performance metrics.", schemas.PerformanceQuery
            ),
        ]
        self._handlers: dict[str, Callable[[dict], Any]] = {
            "auth.login": self._handle_auth_login,
            "auth.me": self._handle_auth_me,
            "study.context.set": self._handle_context_set,
            "study.context.get": self._handle_context_get,
            "exercise.create": self._handle_exercise_create,
            "exercise.list": self._handle_exercise_list,
            "exercise.graph": self._handle_exercise_graph,
            "exercise.search": self._handle_exercise_search,
            "exercise.classify": self._handle_exercise_classify,
            "train.import": self._handle_train_import,
            "practice.start": self._handle_practice_start,
            "practice.next": self._handle_practice_next,
            "practice.submit": self._handle_practice_submit,
            "practice.end": self._handle_practice_end,
            "metrics.performance": self._handle_metrics_performance,
        }

    def list_tools(self) -> list[dict]:
        """
        list_tools() -> List[Dict]

        Concise (one-line) description of the function.

        Parameters
        ----------
        None
            This function does not accept parameters.

        Returns
        -------
        List[Dict]
            Tool definitions for MCP clients.
        """
        tools = []
        for definition in self._definitions:
            tools.append({
                "name": definition.name,
                "description": definition.description,
                "inputSchema": definition.input_model.model_json_schema(),
            })
        return tools

    def call_tool(self, name: str, arguments: dict | None) -> Any:
        """
        call_tool(name, arguments) -> Any

        Concise (one-line) description of the function.

        Parameters
        ----------
        name : str
            Tool name.
        arguments : Optional[Dict]
            Tool input arguments.

        Returns
        -------
        Any
            Tool result data.

        Throws
        ------
        ServiceError
            If a service-layer error is raised.
        """
        handler = self._handlers.get(name)
        if not handler:
            raise ValueError(f"Unknown tool: {name}")
        return handler(arguments or {})

    def _handle_auth_login(self, arguments: dict) -> dict:
        """
        _handle_auth_login(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Login output payload.
        """
        payload = schemas.LoginInput.model_validate(arguments)
        user = self._services.auth_service.login(payload.token)
        return schemas.LoginOutput(userId=user.user_id, roles=user.roles).model_dump()

    def _handle_auth_me(self, arguments: dict) -> dict:
        """
        _handle_auth_me(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Demo user payload.
        """
        _ = schemas.EmptyInput.model_validate(arguments)
        user = self._services.auth_service.demo_user()
        return schemas.LoginOutput(userId=user.user_id, roles=user.roles).model_dump()

    def _handle_context_set(self, arguments: dict) -> dict:
        """
        _handle_context_set(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Context output payload.
        """
        payload = schemas.ContextInput.model_validate(arguments)
        state = self._services.context_service.set_context(payload.language)
        return schemas.ContextOutput(
            activeContextId=state.active_context_id,
            language=state.language,
        ).model_dump()

    def _handle_context_get(self, arguments: dict) -> dict:
        """
        _handle_context_get(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Context output payload.
        """
        _ = schemas.EmptyInput.model_validate(arguments)
        state = self._services.context_service.get_context()
        return schemas.ContextOutput(
            activeContextId=state.active_context_id,
            language=state.language,
        ).model_dump()

    def _handle_exercise_create(self, arguments: dict) -> dict:
        """
        _handle_exercise_create(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Exercise summary payload.
        """
        payload = schemas.ExerciseCreateInput.model_validate(arguments)
        row = self._services.exercise_service.create_exercise(
            question=payload.question,
            answer=payload.answer,
            language=payload.language,
            tags=payload.tags,
            classes=payload.classes,
        )
        return schemas.ExerciseListItem(**row).model_dump()

    def _handle_exercise_list(self, arguments: dict) -> list[dict]:
        """
        _handle_exercise_list(arguments) -> List[Dict]

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        List[Dict]
            Exercise summaries.
        """
        payload = schemas.ExerciseListFilters.model_validate(arguments)
        rows = self._services.exercise_service.list_exercises(
            language=payload.language,
            tags=payload.tags,
            classes=payload.classes,
            limit=payload.limit or 50,
            offset=payload.offset or 0,
        )
        return [schemas.ExerciseListItem(**row).model_dump() for row in rows]

    def _handle_exercise_graph(self, arguments: dict) -> dict:
        payload = schemas.ExerciseListFilters.model_validate(arguments)
        graph = self._services.exercise_service.build_exercise_graph(language=payload.language)
        return schemas.ExerciseGraphOutput(**graph).model_dump()

    def _handle_exercise_search(self, arguments: dict) -> list[dict]:
        payload = schemas.ExerciseSearchQuery.model_validate(arguments)
        rows = self._services.exercise_service.semantic_search_exercises(
            query=payload.query,
            language=payload.language,
            limit=payload.limit or 20,
        )
        return [schemas.ExerciseSearchItem(**row).model_dump() for row in rows]

    def _handle_exercise_classify(self, arguments: dict) -> dict:
        payload = schemas.ExerciseClassifyInput.model_validate(arguments)
        result = self._services.exercise_service.classify_unclassified_exercises(
            limit=payload.limit or 50
        )
        return schemas.ExerciseClassifyOutput(**result).model_dump()

    def _handle_train_import(self, arguments: dict) -> dict:
        """
        _handle_train_import(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Training import summary.
        """
        payload = schemas.TrainImportRequest.model_validate(arguments)
        result = self._services.train_service.import_items([
            item.model_dump() for item in payload.items
        ])
        return schemas.TrainImportOutput(**result).model_dump()

    def _handle_practice_start(self, arguments: dict) -> dict:
        """
        _handle_practice_start(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Practice start payload.
        """
        payload = schemas.PracticeStartInput.model_validate(arguments)
        result = self._services.practice_service.start(
            language=payload.language,
            count=payload.count,
            strategy=payload.strategy,
        )
        return schemas.PracticeStartOutput(**result).model_dump()

    def _handle_practice_next(self, arguments: dict) -> dict:
        """
        _handle_practice_next(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Next exercise payload.
        """
        payload = schemas.PracticeNextInput.model_validate(arguments)
        row = self._services.practice_service.next(payload.sessionId)
        return schemas.ExerciseListItem(**row).model_dump()

    def _handle_practice_submit(self, arguments: dict) -> dict:
        """
        _handle_practice_submit(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Practice submission payload.
        """
        payload = schemas.PracticeSubmitInput.model_validate(arguments)
        result = self._services.practice_service.submit(
            session_id=payload.sessionId,
            exercise_id=payload.exerciseId,
            user_answer=payload.userAnswer,
        )
        return schemas.PracticeSubmitOutput(**result).model_dump()

    def _handle_practice_end(self, arguments: dict) -> dict:
        """
        _handle_practice_end(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Practice end summary.
        """
        payload = schemas.PracticeEndInput.model_validate(arguments)
        return self._services.practice_service.end(payload.sessionId)

    def _handle_metrics_performance(self, arguments: dict) -> dict:
        """
        _handle_metrics_performance(arguments) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        arguments : Dict
            Tool input arguments.

        Returns
        -------
        Dict
            Performance summary payload.
        """
        payload = schemas.PerformanceQuery.model_validate(arguments)
        data = self._services.metrics_service.performance(payload.language)
        items = [PerformanceSummary(**item) for item in data["items"]]
        return schemas.PerformanceOutput(
            items=items,
            aggregates=data["aggregates"],
        ).model_dump()
