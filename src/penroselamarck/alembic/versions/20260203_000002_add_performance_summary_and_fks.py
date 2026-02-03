"""
Add performance summaries and foreign keys.

Public API
----------
- :func:`upgrade`: Apply schema updates.
- :func:`downgrade`: Revert schema updates.

Attributes
----------
revision : str
    Alembic revision identifier.
down_revision : str
    Previous Alembic revision identifier.

Examples
--------
>>> revision
'20260203_000002'

See Also
--------
:mod:`penroselamarck.models.performance_summary`
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260203_000002"
down_revision = "20260201_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    upgrade() -> None

    Concise (one-line) description of the function.

    Parameters
    ----------
    None
        This function does not accept parameters.

    Returns
    -------
    None
        Applies the schema changes.

    Examples
    --------
    >>> callable(upgrade)
    True
    """
    op.create_table(
        "performance_summaries",
        sa.Column("exercise_id", sa.String(length=64), sa.ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column("total_attempts", sa.Integer(), nullable=False),
        sa.Column("pass_rate", sa.Float(), nullable=False),
        sa.Column("last_practiced_at", sa.DateTime(), nullable=True),
    )

    op.create_foreign_key(
        "fk_attempts_session",
        "attempts",
        "practice_sessions",
        ["session_id"],
        ["session_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_attempts_exercise",
        "attempts",
        "exercises",
        ["exercise_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """
    downgrade() -> None

    Concise (one-line) description of the function.

    Parameters
    ----------
    None
        This function does not accept parameters.

    Returns
    -------
    None
        Reverts the schema changes.

    Examples
    --------
    >>> callable(downgrade)
    True
    """
    op.drop_constraint("fk_attempts_exercise", "attempts", type_="foreignkey")
    op.drop_constraint("fk_attempts_session", "attempts", type_="foreignkey")
    op.drop_table("performance_summaries")
