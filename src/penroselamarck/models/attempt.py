"""
Attempt ORM model.

Represents a learner's answer evaluation within a practice session.

Public API
----------
- :class:`Attempt`: A user's answer evaluation record.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.models.attempt import Attempt
>>> Attempt
<class 'penroselamarck.models.attempt.Attempt'>

See Also
--------
:class:`penroselamarck.models.exercise.Exercise`
:class:`penroselamarck.models.practice_session.PracticeSession`
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from penroselamarck.models.base import Base

if TYPE_CHECKING:
    from penroselamarck.models.exercise import Exercise
    from penroselamarck.models.practice_session import PracticeSession


class Attempt(Base):
    """
    Attempt() -> Attempt

    ORM model representing a graded attempt for a specific exercise.

    Returns
    -------
    Attempt
        SQLAlchemy-mapped attempt record.
    """

    __tablename__ = "attempts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("practice_sessions.session_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exercise_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_answer: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    session: Mapped[PracticeSession] = relationship(back_populates="attempts")
    exercise: Mapped[Exercise] = relationship(back_populates="attempts")
