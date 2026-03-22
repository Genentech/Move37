"""Repository helpers for calendar integrations."""

from __future__ import annotations

from sqlalchemy.orm import Session

from move37.models.integrations import (
    AppleCalendarAccountModel,
    CalendarConnectionModel,
    CalendarEventLinkModel,
)


class AppleCalendarAccountRepository:
    """SQLAlchemy repository for owner-scoped Apple Calendar accounts."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_subject(self, owner_subject: str) -> AppleCalendarAccountModel | None:
        return (
            self._session.query(AppleCalendarAccountModel)
            .filter(AppleCalendarAccountModel.owner_subject == owner_subject)
            .one_or_none()
        )

    def save(self, account: AppleCalendarAccountModel) -> AppleCalendarAccountModel:
        self._session.add(account)
        self._session.flush()
        return account

    def delete(self, account: AppleCalendarAccountModel) -> None:
        self._session.delete(account)
        self._session.flush()


class CalendarConnectionRepository:
    """SQLAlchemy repository for calendar provider connections."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_provider_calendar(
        self,
        provider: str,
        external_calendar_id: str,
    ) -> CalendarConnectionModel | None:
        return (
            self._session.query(CalendarConnectionModel)
            .filter(CalendarConnectionModel.provider == provider)
            .filter(CalendarConnectionModel.external_calendar_id == external_calendar_id)
            .one_or_none()
        )

    def save(
        self,
        connection: CalendarConnectionModel,
    ) -> CalendarConnectionModel:
        self._session.add(connection)
        self._session.flush()
        return connection

    def list_by_provider(self, provider: str) -> list[CalendarConnectionModel]:
        return (
            self._session.query(CalendarConnectionModel)
            .filter(CalendarConnectionModel.provider == provider)
            .order_by(CalendarConnectionModel.external_calendar_id.asc())
            .all()
        )

    def upsert(
        self,
        provider: str,
        external_calendar_id: str,
        owner_email: str | None = None,
    ) -> CalendarConnectionModel:
        existing = self.get_by_provider_calendar(provider, external_calendar_id)
        if existing is not None:
            existing.owner_email = owner_email
            self._session.flush()
            return existing
        return self.save(
            CalendarConnectionModel(
                provider=provider,
                external_calendar_id=external_calendar_id,
                owner_email=owner_email,
            )
        )


class CalendarEventLinkRepository:
    """SQLAlchemy repository for activity-to-calendar event links."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_activity(
        self,
        provider: str,
        owner_subject: str,
        activity_id: str,
    ) -> CalendarEventLinkModel | None:
        return (
            self._session.query(CalendarEventLinkModel)
            .filter(CalendarEventLinkModel.provider == provider)
            .filter(CalendarEventLinkModel.owner_subject == owner_subject)
            .filter(CalendarEventLinkModel.activity_id == activity_id)
            .one_or_none()
        )

    def get_by_external_event(
        self,
        provider: str,
        owner_subject: str,
        external_event_id: str,
    ) -> CalendarEventLinkModel | None:
        return (
            self._session.query(CalendarEventLinkModel)
            .filter(CalendarEventLinkModel.provider == provider)
            .filter(CalendarEventLinkModel.owner_subject == owner_subject)
            .filter(CalendarEventLinkModel.external_event_id == external_event_id)
            .one_or_none()
        )

    def list_by_subject(
        self,
        provider: str,
        owner_subject: str,
    ) -> list[CalendarEventLinkModel]:
        return (
            self._session.query(CalendarEventLinkModel)
            .filter(CalendarEventLinkModel.provider == provider)
            .filter(CalendarEventLinkModel.owner_subject == owner_subject)
            .order_by(CalendarEventLinkModel.activity_id.asc())
            .all()
        )

    def save(self, link: CalendarEventLinkModel) -> CalendarEventLinkModel:
        self._session.add(link)
        self._session.flush()
        return link

    def delete(self, link: CalendarEventLinkModel) -> None:
        self._session.delete(link)
        self._session.flush()
