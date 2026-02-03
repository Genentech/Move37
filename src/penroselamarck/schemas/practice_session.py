"""
PracticeSession schema.

Pydantic model for practice session input/output.

Public API
----------
- :class:`PracticeSession`: A session selecting and sequencing exercises.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.schemas.practice_session import PracticeSession
>>> PracticeSession(
    session_id="s1",
    language="da",
    strategy="mixed",
    target_count=3,
    status="started")
PracticeSession(
    session_id='s1',
    language='da',
    strategy='mixed',
    target_count=3,
    status='started',
    started_at=None,
    ended_at=None,
    selected_exercise_ids=None)

See Also
--------
:class:`penroselamarck.models.practice_session.PracticeSession`
"""

from datetime import datetime

from pydantic import BaseModel


class PracticeSession(BaseModel):
    """
    PracticeSession(session_id, language, strategy, target_count, status) -> PracticeSession

    Concise (one-line) description of the schema.

    Parameters
    ----------
    session_id : str
        Unique identifier for the session.
    language : str
        The active language for practice.
    strategy : str
        Selection strategy ('weakest'|'spaced'|'mixed').
    target_count : int
        Number of exercises requested.
    status : str
        Lifecycle status ('started'|'ended').

    Returns
    -------
    PracticeSession
        The session record.
    """

    session_id: str
    language: str
    strategy: str
    target_count: int
    status: str
    started_at: datetime | None = None
    ended_at: datetime | None = None
    selected_exercise_ids: list[str] | None = None
