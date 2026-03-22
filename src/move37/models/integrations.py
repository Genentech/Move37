"""SQLAlchemy models for external service connections."""

from __future__ import annotations

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class GitHubIntegrationModel(TimestampMixin, Base):
    """Persisted GitHub installation or user-token metadata."""

    __tablename__ = "github_integrations"
    __table_args__ = (UniqueConstraint("login", name="uq_github_integrations_login"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    login: Mapped[str] = mapped_column(String(255), nullable=False)
    installation_id: Mapped[str | None] = mapped_column(String(255))
    token_reference: Mapped[str | None] = mapped_column(String(255))


class CalendarConnectionModel(TimestampMixin, Base):
    """Persisted provider connection and calendar identifier."""

    __tablename__ = "calendar_connections"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "external_calendar_id",
            name="uq_calendar_connections_provider_calendar",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    external_calendar_id: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(255))
    sync_token: Mapped[str | None] = mapped_column(String(255))


class CalendarEventLinkModel(TimestampMixin, Base):
    """Persisted mapping between Move37 activities and external calendar events."""

    __tablename__ = "calendar_event_links"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "owner_subject",
            "activity_id",
            name="uq_calendar_event_links_provider_subject_activity",
        ),
        UniqueConstraint(
            "provider",
            "owner_subject",
            "external_event_id",
            name="uq_calendar_event_links_provider_subject_event",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    owner_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    activity_id: Mapped[str] = mapped_column(String(255), nullable=False)
    external_calendar_id: Mapped[str] = mapped_column(String(255), nullable=False)
    external_event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    managed_by_move37: Mapped[bool] = mapped_column(nullable=False, default=True)
    last_seen_etag: Mapped[str | None] = mapped_column(String(255))


class AppleCalendarAccountModel(TimestampMixin, Base):
    """Persisted Apple Calendar credentials and calendar preferences."""

    __tablename__ = "apple_calendar_accounts"
    __table_args__ = (
        UniqueConstraint(
            "owner_subject",
            name="uq_apple_calendar_accounts_owner_subject",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_ciphertext: Mapped[str] = mapped_column(Text(), nullable=False)
    writable_calendar_id: Mapped[str | None] = mapped_column(String(255))
    readable_calendar_ids: Mapped[str | None] = mapped_column(Text())


class BankAccountConnectionModel(TimestampMixin, Base):
    """Persisted Open Banking-linked bank account metadata."""

    __tablename__ = "bank_account_connections"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "external_account_id",
            name="uq_bank_account_connections_provider_account",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    external_account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    iban: Mapped[str | None] = mapped_column(String(64))
    currency: Mapped[str | None] = mapped_column(String(12))
    token_reference: Mapped[str | None] = mapped_column(String(255))
