"""
PerformanceSummary schema.

Pydantic model for aggregated statistics per exercise.

Public API
----------
- :class:`PerformanceSummary`: Aggregated stats for exercises.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.schemas.performance_summary import PerformanceSummary
>>> PerformanceSummary(exercise_id="e1", total_attempts=2, pass_rate=1.0)
PerformanceSummary(exercise_id='e1', total_attempts=2, pass_rate=1.0, last_practiced_at=None)

See Also
--------
:class:`penroselamarck.models.performance_summary.PerformanceSummary`
"""

from datetime import datetime

from pydantic import BaseModel


class PerformanceSummary(BaseModel):
    """
    PerformanceSummary(exercise_id, total_attempts, pass_rate, last_practiced_at)
        -> PerformanceSummary

    Concise (one-line) description of the schema.

    Parameters
    ----------
    exercise_id : str
        Identifier of the exercise.
    total_attempts : int
        Total attempts recorded.
    pass_rate : float
        Ratio of passed attempts in [0, 1].
    last_practiced_at : datetime
        Timestamp of last practice.

    Returns
    -------
    PerformanceSummary
        Aggregated performance statistics for an exercise.
    """

    exercise_id: str
    total_attempts: int
    pass_rate: float
    last_practiced_at: datetime | None = None
