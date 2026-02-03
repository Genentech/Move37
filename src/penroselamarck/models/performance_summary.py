"""
PerformanceSummary ORM model.

Stores aggregated statistics per exercise for quick lookup.

Public API
----------
- :class:`PerformanceSummary`: Aggregated stats for exercises.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.models.performance_summary import PerformanceSummary
>>> PerformanceSummary
<class 'penroselamarck.models.performance_summary.PerformanceSummary'>

See Also
--------
:class:`penroselamarck.models.exercise.Exercise`
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from penroselamarck.models.base import Base

if TYPE_CHECKING:
    from penroselamarck.models.exercise import Exercise


class PerformanceSummary(Base):
    """
    PerformanceSummary() -> PerformanceSummary

    ORM model capturing aggregated metrics per exercise.

    Returns
    -------
    PerformanceSummary
        SQLAlchemy-mapped performance summary record.
    """

    __tablename__ = "performance_summaries"

    exercise_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("exercises.id", ondelete="CASCADE"),
        primary_key=True,
    )
    total_attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    pass_rate: Mapped[float] = mapped_column(Float, nullable=False)
    last_practiced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    exercise: Mapped[Exercise] = relationship(back_populates="performance_summary")
