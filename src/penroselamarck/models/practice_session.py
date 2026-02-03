"""
PracticeSession ORM model.

Defines the practice session lifecycle and selected exercises.

Public API
----------
- :class:`PracticeSession`: A session selecting and sequencing exercises.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.models.practice_session import PracticeSession
>>> PracticeSession
<class 'penroselamarck.models.practice_session.PracticeSession'>

See Also
--------
:class:`penroselamarck.models.attempt.Attempt`
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from penroselamarck.models.base import Base

if TYPE_CHECKING:
    from penroselamarck.models.attempt import Attempt


class PracticeSession(Base):
    """
    PracticeSession() -> PracticeSession

    ORM model describing a learner's practice session.

    Returns
    -------
    PracticeSession
        SQLAlchemy-mapped practice session record.
    """

    __tablename__ = "practice_sessions"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    language: Mapped[str] = mapped_column(String(8), nullable=False)
    strategy: Mapped[str] = mapped_column(String(32), nullable=False)
    target_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    selected_exercise_ids: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    attempts: Mapped[list[Attempt]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )
