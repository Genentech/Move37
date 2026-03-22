"""Service interfaces and adapters for calendar providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from move37.schemas.calendar import CalendarEvent, CalendarEventUpdate


class CalendarInterface(ABC):
    """Contract for calendar service providers."""

    @abstractmethod
    def list_events(
        self,
        start: datetime,
        end: datetime,
        calendar_id: str | None = None,
    ) -> Sequence[CalendarEvent]:
        """Return calendar events within a time range."""

    @abstractmethod
    def create_event(
        self,
        event: CalendarEvent,
        calendar_id: str | None = None,
    ) -> str:
        """Create an event and return its provider identifier."""

    @abstractmethod
    def update_event(
        self,
        event_id: str,
        updates: CalendarEventUpdate,
        calendar_id: str | None = None,
    ) -> CalendarEvent:
        """Update an event and return the normalized result."""

    @abstractmethod
    def delete_event(self, event_id: str, calendar_id: str | None = None) -> None:
        """Delete an event."""


class AppleCalendar(CalendarInterface):
    """Adapter over Apple Calendar integrations."""

    def __init__(self, event_store: Any) -> None:
        self._event_store = event_store

    def discover_calendars(self) -> Sequence[dict[str, Any]]:
        return self._event_store.discover_calendars()

    def list_events(
        self,
        start: datetime,
        end: datetime,
        calendar_id: str | None = None,
    ) -> Sequence[CalendarEvent]:
        return self._event_store.list_events(start=start, end=end, calendar_id=calendar_id)

    def create_event(
        self,
        event: CalendarEvent,
        calendar_id: str | None = None,
    ) -> str:
        return self._event_store.create_event(event=event, calendar_id=calendar_id)

    def update_event(
        self,
        event_id: str,
        updates: CalendarEventUpdate,
        calendar_id: str | None = None,
    ) -> CalendarEvent:
        return self._event_store.update_event(
            event_id=event_id,
            updates=updates,
            calendar_id=calendar_id,
        )

    def delete_event(self, event_id: str, calendar_id: str | None = None) -> None:
        self._event_store.delete_event(event_id=event_id, calendar_id=calendar_id)


class GoogleCalendar(CalendarInterface):
    """Adapter over Google Calendar integrations."""

    def __init__(self, service: Any) -> None:
        self._service = service

    def list_events(
        self,
        start: datetime,
        end: datetime,
        calendar_id: str | None = None,
    ) -> Sequence[CalendarEvent]:
        return self._service.list_events(start=start, end=end, calendar_id=calendar_id)

    def create_event(
        self,
        event: CalendarEvent,
        calendar_id: str | None = None,
    ) -> str:
        return self._service.create_event(event=event, calendar_id=calendar_id)

    def update_event(
        self,
        event_id: str,
        updates: CalendarEventUpdate,
        calendar_id: str | None = None,
    ) -> CalendarEvent:
        return self._service.update_event(
            event_id=event_id,
            updates=updates,
            calendar_id=calendar_id,
        )

    def delete_event(self, event_id: str, calendar_id: str | None = None) -> None:
        self._service.delete_event(event_id=event_id, calendar_id=calendar_id)
