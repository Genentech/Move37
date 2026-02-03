"""
penroselamarck.models package.

Contains SQLAlchemy ORM models used for relational persistence.

Public API
----------
- :class:`penroselamarck.models.exercise.Exercise`: Exercise ORM model.
- :class:`penroselamarck.models.practice_session.PracticeSession`: Session ORM model.
- :class:`penroselamarck.models.attempt.Attempt`: Attempt ORM model.
- :class:`penroselamarck.models.performance_summary.PerformanceSummary`: Summary ORM model.
- :class:`penroselamarck.models.base.Base`: Declarative base.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.models import Base, Exercise
>>> hasattr(Base, "metadata")
True

See Also
--------
:mod:`penroselamarck.schemas`
"""

from penroselamarck.models.attempt import Attempt  # noqa: F401
from penroselamarck.models.base import Base  # noqa: F401
from penroselamarck.models.exercise import Exercise  # noqa: F401
from penroselamarck.models.performance_summary import PerformanceSummary  # noqa: F401
from penroselamarck.models.practice_session import PracticeSession  # noqa: F401

__all__ = [
    "Attempt",
    "Base",
    "Exercise",
    "PerformanceSummary",
    "PracticeSession",
]
