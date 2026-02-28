"""
Exercise repository backed by Postgres.

Handles CRUD operations for Exercise records.

Public API
----------
- :class:`ExerciseRepository`: Database operations for exercises.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.db.session import get_engine
>>> repo = ExerciseRepository(get_engine())
>>> callable(repo.list_exercises)
True

See Also
--------
:class:`penroselamarck.models.exercise.Exercise`
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from penroselamarck.models.exercise import Exercise


class ExerciseRepository:
    """
    ExerciseRepository(engine) -> ExerciseRepository

    Concise (one-line) description of the repository.

    Methods
    -------
    add_exercise(question, answer, language, tags, content_hash)
        Insert a new exercise.
    list_exercises(language, tags, limit, offset)
        Retrieve exercises by filter.
    get_exercise(exercise_id)
        Fetch a single exercise.
    """

    def __init__(self, engine: Engine) -> None:
        """
        __init__(engine) -> None

        Concise (one-line) description of the initializer.

        Parameters
        ----------
        engine : Engine
            SQLAlchemy engine bound to Postgres.

        Returns
        -------
        None
            Initializes the repository.
        """
        self._engine = engine

    def add_exercise(
        self,
        question: str,
        answer: str,
        language: str,
        tags: list[str] | None,
        classes: list[str] | None,
        content_hash: str,
        exercise_id: str,
        created_at: datetime,
    ) -> str:
        """
        add_exercise(question, answer, language, tags, content_hash, exercise_id, created_at) -> str

        Concise (one-line) description of the function.

        Parameters
        ----------
        question : str
            Exercise prompt.
        answer : str
            Expected answer.
        language : str
            ISO 639-1 language code.
        tags : Optional[List[str]]
            Labels for the exercise.
        content_hash : str
            Deduplication hash for the content.
        exercise_id : str
            Identifier to assign to the exercise.
        created_at : datetime
            Timestamp for creation.

        Returns
        -------
        str
            The persisted exercise identifier.
        """
        with Session(self._engine) as session:
            row = Exercise(
                id=exercise_id,
                question=question,
                answer=answer,
                language=language,
                tags=tags,
                classes=classes,
                content_hash=content_hash,
                created_at=created_at,
            )
            session.add(row)
            session.commit()
            return row.id

    def list_exercises(
        self,
        language: str | None,
        tags: list[str] | None,
        classes: list[str] | None,
        limit: int,
        offset: int,
    ) -> list[dict]:
        """
        list_exercises(language, tags, limit, offset) -> List[Dict]

        Concise (one-line) description of the function.

        Parameters
        ----------
        language : Optional[str]
            Language filter.
        tags : Optional[List[str]]
            Tag filter list.
        limit : int
            Maximum rows returned.
        offset : int
            Result offset.

        Returns
        -------
        List[Dict]
            A list of exercise summary dictionaries.
        """
        with Session(self._engine) as session:
            stmt = select(Exercise)
            if language:
                stmt = stmt.where(Exercise.language == language)
            if tags:
                stmt = stmt.where(Exercise.tags.contains(tags))
            if classes:
                stmt = stmt.where(Exercise.classes.contains(classes))
            stmt = stmt.offset(offset).limit(limit)
            rows = session.scalars(stmt).all()
            return [
                {
                    "exerciseId": r.id,
                    "question": r.question,
                    "language": r.language,
                    "tags": r.tags,
                    "classes": r.classes,
                }
                for r in rows
            ]

    def get_exercise(self, exercise_id: str) -> dict | None:
        """
        get_exercise(exercise_id) -> Optional[Dict]

        Concise (one-line) description of the function.

        Parameters
        ----------
        exercise_id : str
            Identifier of the exercise.

        Returns
        -------
        Optional[Dict]
            Exercise details or None if missing.
        """
        with Session(self._engine) as session:
            row = session.get(Exercise, exercise_id)
            if not row:
                return None
            return {
                "exerciseId": row.id,
                "question": row.question,
                "answer": row.answer,
                "language": row.language,
                "tags": row.tags,
                "classes": row.classes,
            }

    def exists_by_hash(self, content_hash: str) -> bool:
        """
        exists_by_hash(content_hash) -> bool

        Concise (one-line) description of the function.

        Parameters
        ----------
        content_hash : str
            Deduplication hash for the content.

        Returns
        -------
        bool
            True if an exercise with the hash exists.
        """
        with Session(self._engine) as session:
            stmt = select(Exercise.id).where(Exercise.content_hash == content_hash)
            return session.scalar(stmt) is not None

    def list_all_exercises(self, language: str | None = None) -> list[dict]:
        """
        list_all_exercises(language=None) -> List[Dict]

        Return full exercise payloads used by graph/search/classification services.
        """
        with Session(self._engine) as session:
            stmt = select(Exercise)
            if language:
                stmt = stmt.where(Exercise.language == language)
            rows = session.scalars(stmt).all()
            return [
                {
                    "exerciseId": row.id,
                    "question": row.question,
                    "answer": row.answer,
                    "language": row.language,
                    "tags": row.tags or [],
                    "classes": row.classes or [],
                }
                for row in rows
            ]

    def update_exercise_classes(self, exercise_id: str, classes: list[str]) -> bool:
        """
        update_exercise_classes(exercise_id, classes) -> bool

        Update class labels for one exercise.
        """
        with Session(self._engine) as session:
            row = session.get(Exercise, exercise_id)
            if row is None:
                return False
            row.classes = classes
            session.add(row)
            session.commit()
            return True

    def list_unclassified_exercises(self, limit: int = 50) -> list[dict]:
        """
        list_unclassified_exercises(limit=50) -> List[Dict]

        Return exercises that still have no class labels.
        """
        with Session(self._engine) as session:
            stmt = (
                select(Exercise)
                .where((Exercise.classes.is_(None)) | (Exercise.classes == []))
                .limit(limit)
            )
            rows = session.scalars(stmt).all()
            return [
                {
                    "exerciseId": row.id,
                    "question": row.question,
                    "answer": row.answer,
                    "language": row.language,
                    "tags": row.tags or [],
                    "classes": row.classes or [],
                }
                for row in rows
            ]
