"""Add calendar event links table."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260317_000002"
down_revision = "20260316_000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_event_links",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("activity_id", sa.String(length=255), nullable=False),
        sa.Column("external_calendar_id", sa.String(length=255), nullable=False),
        sa.Column("external_event_id", sa.String(length=255), nullable=False),
        sa.Column("managed_by_move37", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_seen_etag", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "provider",
            "owner_subject",
            "activity_id",
            name="uq_calendar_event_links_provider_subject_activity",
        ),
        sa.UniqueConstraint(
            "provider",
            "owner_subject",
            "external_event_id",
            name="uq_calendar_event_links_provider_subject_event",
        ),
    )


def downgrade() -> None:
    op.drop_table("calendar_event_links")
