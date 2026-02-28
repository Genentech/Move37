"""
Practice session repository.

Handles persistence for practice session lifecycle data.

Public API
----------
- :class:`PracticeSessionRepository`: Database operations for sessions.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.db.session import get_engine
>>> repo = PracticeSessionRepository(get_engine())
>>> callable(repo.create_session)
True

See Also
--------
:class:`penroselamarck.models.practice_session.PracticeSession`
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from penroselamarck.models.attempt import Attempt
from penroselamarck.models.exercise import Exercise
from penroselamarck.models.practice_session import PracticeSession


class PracticeSessionRepository:
    """
    PracticeSessionRepository(engine) -> PracticeSessionRepository

    Concise (one-line) description of the repository.

    Methods
    -------
    create_session(language, strategy, target_count, selected_ids)
        Insert a new session.
    next_exercise(session_id)
        Retrieve the next unattempted exercise for a session.
    end_session(session_id)
        Mark the session as ended and summarize attempts.
    get_session(session_id)
        Retrieve a session by id.
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

    def create_session(
        self,
        language: str,
        strategy: str,
        target_count: int,
        selected_ids: list[str],
    ) -> str:
        """
        create_session(language, strategy, target_count, selected_ids) -> str

        Concise (one-line) description of the function.

        Parameters
        ----------
        language : str
            Session language.
        strategy : str
            Selection strategy.
        target_count : int
            Number of exercises requested.
        selected_ids : List[str]
            Selected exercise identifiers.

        Returns
        -------
        str
            New session identifier.
        """
        with Session(self._engine) as session:
            sess_id = uuid.uuid4().hex
            row = PracticeSession(
                session_id=sess_id,
                language=language,
                strategy=strategy,
                target_count=target_count,
                status="started",
                started_at=datetime.utcnow(),
                selected_exercise_ids=selected_ids,
            )
            session.add(row)
            session.commit()
            return sess_id

    def next_exercise(self, session_id: str) -> dict | None:
        """
        next_exercise(session_id) -> Optional[Dict]

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.

        Returns
        -------
        Optional[Dict]
            The next exercise summary or None if finished.
        """
        with Session(self._engine) as session:
            sess = session.get(PracticeSession, session_id)
            if not sess:
                return None
            attempted = session.scalars(
                select(Attempt.exercise_id).where(Attempt.session_id == session_id)
            ).all()
            attempted_set = set(attempted)
            for ex_id in sess.selected_exercise_ids or []:
                if ex_id not in attempted_set:
                    exercise = session.get(Exercise, ex_id)
                    if exercise:
                        return {
                            "exerciseId": exercise.id,
                            "question": exercise.question,
                            "language": exercise.language,
                            "tags": exercise.tags,
                            "classes": exercise.classes,
                        }
            return None

    def end_session(self, session_id: str) -> dict:
        """
        end_session(session_id) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.

        Returns
        -------
        Dict
            Attempt counts and pass rate summary.
        """
        with Session(self._engine) as session:
            sess = session.get(PracticeSession, session_id)
            if not sess:
                return {"attempts": 0, "passRate": 0.0}
            sess.status = "ended"
            sess.ended_at = datetime.utcnow()
            session.add(sess)
            session.commit()
            statement = select(Attempt).where(Attempt.session_id == session_id)
            attempts = session.scalars(statement).all()
            total = len(attempts)
            pass_rate = (sum(1 for a in attempts if a.passed) / total) if total else 0.0
            return {"attempts": total, "passRate": pass_rate}

    def get_session(self, session_id: str) -> PracticeSession | None:
        """
        get_session(session_id) -> Optional[PracticeSession]

        Concise (one-line) description of the function.

        Parameters
        ----------
        session_id : str
            Session identifier.

        Returns
        -------
        Optional[PracticeSession]
            Session ORM record or None.
        """
        with Session(self._engine) as session:
            return session.get(PracticeSession, session_id)
