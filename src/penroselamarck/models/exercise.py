"""
Exercise ORM model.

Defines the relational schema for exercises used in practice sessions.

Public API
----------
- :class:`Exercise`: Core unit of study (question/answer).

Attributes
----------
None

Examples
--------
>>> from penroselamarck.models.exercise import Exercise
>>> Exercise
<class 'penroselamarck.models.exercise.Exercise'>

See Also
--------
:class:`penroselamarck.models.attempt.Attempt`
:class:`penroselamarck.models.performance_summary.PerformanceSummary`
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from penroselamarck.models.base import Base

if TYPE_CHECKING:
    from penroselamarck.models.attempt import Attempt
    from penroselamarck.models.performance_summary import PerformanceSummary


class Exercise(Base):
    """
    Exercise() -> Exercise

    ORM model for a learning exercise.

    Returns
    -------
    Exercise
        SQLAlchemy-mapped exercise record.
    """

    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    attempts: Mapped[list[Attempt]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
    )
    performance_summary: Mapped[PerformanceSummary | None] = relationship(
        back_populates="exercise",
        uselist=False,
        cascade="all, delete-orphan",
    )
