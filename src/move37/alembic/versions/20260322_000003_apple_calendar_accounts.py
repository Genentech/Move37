"""Add owner-scoped Apple Calendar account storage."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260322_000003"
down_revision = "20260317_000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "apple_calendar_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("base_url", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=False),
        sa.Column("password_ciphertext", sa.Text(), nullable=False),
        sa.Column("writable_calendar_id", sa.String(length=255), nullable=True),
        sa.Column("readable_calendar_ids", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "owner_subject",
            name="uq_apple_calendar_accounts_owner_subject",
        ),
    )


def downgrade() -> None:
    op.drop_table("apple_calendar_accounts")
