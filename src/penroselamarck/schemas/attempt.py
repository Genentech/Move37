"""
Attempt schema.

Pydantic model representing a graded attempt.

Public API
----------
- :class:`Attempt`: A user's answer evaluation record.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.schemas.attempt import Attempt
>>> Attempt(session_id="s1", exercise_id="e1", user_answer="hi", score=1.0, passed=True)
Attempt(
    session_id='s1',
    exercise_id='e1',
    user_answer='hi',
    score=1.0,
    passed=True,
    evaluated_at=None)

See Also
--------
:class:`penroselamarck.models.attempt.Attempt`
"""

from datetime import datetime

from pydantic import BaseModel


class Attempt(BaseModel):
    """
    Attempt(session_id, exercise_id, user_answer, score, passed) -> Attempt

    Concise (one-line) description of the schema.

    Parameters
    ----------
    session_id : str
        Identifier of the session.
    exercise_id : str
        Identifier of the exercise.
    user_answer : str
        The learner's answer.
    score : float
        Evaluation score in [0, 1].
    passed : bool
        Whether the answer meets the passing threshold.

    Returns
    -------
    Attempt
        The attempt record.
    """

    session_id: str
    exercise_id: str
    user_answer: str
    score: float
    passed: bool
    evaluated_at: datetime | None = None
