"""
penroselamarck.schemas package.

Holds Pydantic schemas for API inputs and outputs.

Public API
----------
- :class:`penroselamarck.schemas.exercise.Exercise`: Exercise schema.
- :class:`penroselamarck.schemas.practice_session.PracticeSession`: Session schema.
- :class:`penroselamarck.schemas.attempt.Attempt`: Attempt schema.
- :class:`penroselamarck.schemas.performance_summary.PerformanceSummary`: Summary schema.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.schemas import Exercise
>>> Exercise(question="hej", answer="hello", language="da")
Exercise(
    question='hej',
    answer='hello',
    language='da',
    tags=None,
    id=None,
    content_hash=None,
    created_at=None)

See Also
--------
:mod:`penroselamarck.models`
"""

from penroselamarck.schemas.attempt import Attempt  # noqa: F401
from penroselamarck.schemas.exercise import Exercise  # noqa: F401
from penroselamarck.schemas.performance_summary import PerformanceSummary  # noqa: F401
from penroselamarck.schemas.practice_session import PracticeSession  # noqa: F401

__all__ = [
    "Attempt",
    "Exercise",
    "PerformanceSummary",
    "PracticeSession",
]
