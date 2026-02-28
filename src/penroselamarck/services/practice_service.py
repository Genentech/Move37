"""
Practice session service.

Coordinates exercise selection, attempts, and session lifecycle.

Public API
----------
- :class:`PracticeService`: Practice workflow operations.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.db.session import get_engine
>>> from penroselamarck.repositories.exercise_repository import ExerciseRepository
>>> from penroselamarck.repositories.practice_session_repository import PracticeSessionRepository
>>> from penroselamarck.repositories.attempt_repository import AttemptRepository
>>> service = PracticeService(
...     ExerciseRepository(get_engine()),
...     PracticeSessionRepository(get_engine()),
...     AttemptRepository(get_engine()),
... )
>>> callable(service.start)
True

See Also
--------
:mod:`penroselamarck.repositories.practice_session_repository`
"""

from __future__ import annotations

from datetime import datetime

from penroselamarck.repositories.attempt_repository import AttemptRepository
from penroselamarck.repositories.exercise_repository import ExerciseRepository
from penroselamarck.repositories.practice_session_repository import PracticeSessionRepository
from penroselamarck.services.errors import NoContentError, NotFoundError


class PracticeService:
    """
    PracticeService(exercise_repository, session_repository, attempt_repository)
        -> PracticeService

    Concise (one-line) description of the service.

    Methods
    -------
    start(language, count, strategy)
        Start a practice session.
    next(session_id)
        Retrieve the next exercise in the session.
    submit(session_id, exercise_id, user_answer)
        Record an attempt and return feedback.
    end(session_id)
        End the session and summarize results.
    """

    def __init__(
        self,
        exercise_repository: ExerciseRepository,
        session_repository: PracticeSessionRepository,
        attempt_repository: AttemptRepository,
    ) -> None:
        """
        __init__(exercise_repository, session_repository, attempt_repository) -> None

        Concise (one-line) description of the initializer.

        Parameters
        ----------
        exercise_repository : ExerciseRepository
            Repository for exercises.
        session_repository : PracticeSessionRepository
            Repository for practice sessions.
        attempt_repository : AttemptRepository
            Repository for attempts.

        Returns
        -------
        None
            Initializes the service.
        """
        self._exercise_repository = exercise_repository
        self._session_repository = session_repository
        self._attempt_repository = attempt_repository

    def start(self, language: str, count: int, strategy: str) -> dict:
        """
        start(language, count, strategy) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        language : str
            Language for the session.
        count : int
            Number of exercises requested.
        strategy : str
            Selection strategy.

        Returns
        -------
        Dict
            Session identifier and selected exercises.
        """
        rows = self._exercise_repository.list_exercises(language, None, None, count, 0)
        selected = [row["exerciseId"] for row in rows]
        session_id = self._session_repository.create_session(language, strategy, count, selected)
        return {
            "sessionId": session_id,
            "selectedExerciseIds": selected,
            "remaining": len(selected),
        }

    def next(self, session_id: str) -> dict:
        """
        next(session_id) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.

        Returns
        -------
        Dict
            Next exercise summary.

        Throws
        ------
        NoContentError
            If there are no remaining exercises.
        """
        row = self._session_repository.next_exercise(session_id)
        if not row:
            raise NoContentError("No remaining exercises")
        return row

    def submit(self, session_id: str, exercise_id: str, user_answer: str) -> dict:
        """
        submit(session_id, exercise_id, user_answer) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.
        exercise_id : str
            Exercise identifier.
        user_answer : str
            Learner's answer.

        Returns
        -------
        Dict
            Evaluation feedback and scoring.

        Throws
        ------
        NotFoundError
            If the exercise does not exist.
        """
        exercise = self._exercise_repository.get_exercise(exercise_id)
        if not exercise:
            raise NotFoundError("Exercise not found")
        canonical_user = " ".join(user_answer.strip().split()).lower()
        canonical_ans = " ".join((exercise.get("answer") or "").strip().split()).lower()
        score = 1.0 if canonical_user == canonical_ans else 0.0
        passed = score >= 0.8
        self._attempt_repository.record_attempt(
            session_id=session_id,
            exercise_id=exercise_id,
            user_answer=user_answer,
            score=score,
            passed=passed,
            evaluated_at=datetime.utcnow(),
        )
        next_ready = self._session_repository.next_exercise(session_id) is not None
        return {
            "passed": passed,
            "score": score,
            "feedback": "Exact match" if passed else "Try again",
            "expectedAnswer": exercise.get("answer") or "",
            "nextReady": next_ready,
        }

    def end(self, session_id: str) -> dict:
        """
        end(session_id) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.

        Returns
        -------
        Dict
            Session summary metrics.
        """
        return self._session_repository.end_session(session_id)
