"""
Training import service.

Supports bulk importing exercises with deduplication reporting.

Public API
----------
- :class:`TrainService`: Training import operations.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.db.session import get_engine
>>> from penroselamarck.repositories.exercise_repository import ExerciseRepository
>>> from penroselamarck.services.exercise_service import ExerciseService
>>> service = TrainService(ExerciseService(ExerciseRepository(get_engine())))
>>> isinstance(service.import_items([]), dict)
True

See Also
--------
:mod:`penroselamarck.services.exercise_service`
"""

from __future__ import annotations

import hashlib

from penroselamarck.services.errors import ConflictError
from penroselamarck.services.exercise_service import ExerciseService


class TrainService:
    """
    TrainService(exercise_service) -> TrainService

    Concise (one-line) description of the service.

    Methods
    -------
    import_items(items)
        Import a list of exercises.
    """

    def __init__(self, exercise_service: ExerciseService) -> None:
        """
        __init__(exercise_service) -> None

        Concise (one-line) description of the initializer.

        Parameters
        ----------
        exercise_service : ExerciseService
            Service for exercise creation.

        Returns
        -------
        None
            Initializes the service.
        """
        self._exercise_service = exercise_service

    def import_items(self, items: list[dict]) -> dict:
        """
        import_items(items) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        items : List[Dict]
            Exercise records to import.

        Returns
        -------
        Dict
            Import summary with counts and errors.
        """
        imported = 0
        duplicates: list[str] = []
        errors: list[dict] = []
        for index, item in enumerate(items):
            try:
                self._exercise_service.create_exercise(
                    question=item["question"],
                    answer=item["answer"],
                    language=item["language"],
                    tags=item.get("tags"),
                    classes=item.get("classes"),
                )
                imported += 1
            except ConflictError:
                duplicates.append(self._content_hash(item["question"], item["answer"]))
            except Exception as exc:
                errors.append({"index": index, "reason": str(exc)})
        return {"importedCount": imported, "duplicates": duplicates, "errors": errors}

    def _content_hash(self, question: str, answer: str) -> str:
        """
        _content_hash(question, answer) -> str

        Concise (one-line) description of the function.

        Parameters
        ----------
        question : str
            The question text.
        answer : str
            The answer text.

        Returns
        -------
        str
            SHA-256 hex digest over normalized content.
        """
        canonical_q = " ".join(question.strip().split()).lower()
        canonical_a = " ".join(answer.strip().split()).lower()
        return hashlib.sha256((canonical_q + "\n" + canonical_a).encode("utf-8")).hexdigest()
