"""
Exercise schema.

Pydantic model used for API input/output.

Public API
----------
- :class:`Exercise`: Core unit of study (question/answer).

Attributes
----------
None

Examples
--------
>>> from penroselamarck.schemas.exercise import Exercise
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
:class:`penroselamarck.models.exercise.Exercise`
"""

from datetime import datetime

from pydantic import BaseModel


class Exercise(BaseModel):
    """
    Exercise(question, answer, language, tags=None, id=None) -> Exercise

    Concise (one-line) description of the schema.

    Parameters
    ----------
    question : str
        The prompt shown to the learner.
    answer : str
        The expected correct answer.
    language : str
        ISO 639-1 code (e.g., 'da' for Danish).
    tags : List[str], optional
        Labels such as 'vocab', 'grammar'.

    Returns
    -------
    Exercise
        The exercise object with optional identifiers.
    """

    question: str
    answer: str
    language: str
    tags: list[str] | None = None
    classes: list[str] | None = None
    id: str | None = None
    content_hash: str | None = None
    created_at: datetime | None = None
