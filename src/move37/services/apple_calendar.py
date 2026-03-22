"""Apple Calendar integration and synchronization helpers."""

from __future__ import annotations

import os
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
import json
from typing import Any
from urllib.parse import quote, urljoin

import httpx
from sqlalchemy.orm import sessionmaker

from move37.models.integrations import AppleCalendarAccountModel, CalendarEventLinkModel
from move37.repositories.activity_graph import ActivityGraphRepository
from move37.repositories.calendar import (
    AppleCalendarAccountRepository,
    CalendarConnectionRepository,
    CalendarEventLinkRepository,
)
from move37.schemas.calendar import CalendarEvent, CalendarEventUpdate
from move37.services.calendar import AppleCalendar
from move37.services.secrets import decrypt_secret, encrypt_secret

APPLE_PROVIDER = "apple"
DAV_NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav"}


def _normalize_calendar_url(base_url: str, calendar_id: str) -> str:
    value = calendar_id.strip()
    if value.startswith("http://") or value.startswith("https://"):
        return value.rstrip("/") + "/"
    return urljoin(base_url.rstrip("/") + "/", value.strip("/") + "/")


def _fold_ics_line(line: str, width: int = 73) -> str:
    if len(line) <= width:
        return line
    lines = [line[:width]]
    remaining = line[width:]
    while remaining:
        lines.append(f" {remaining[: width - 1]}")
        remaining = remaining[width - 1 :]
    return "\r\n".join(lines)


def _escape_ics(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(",", "\\,")
        .replace(";", "\\;")
    )


def _unfold_ics(payload: str) -> list[str]:
    lines: list[str] = []
    for raw_line in payload.splitlines():
        if raw_line.startswith((" ", "\t")) and lines:
            lines[-1] = lines[-1] + raw_line[1:]
        else:
            lines.append(raw_line.strip())
    return lines


def _parse_ical_datetime(value: str, all_day: bool) -> datetime:
    if all_day:
        return datetime.strptime(value, "%Y%m%d").replace(tzinfo=UTC)
    if value.endswith("Z"):
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    return datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=UTC)


def _format_caldav_range(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _day_bounds(start_date: str) -> tuple[datetime, datetime]:
    scheduled_for = date.fromisoformat(start_date)
    starts_at = datetime.combine(scheduled_for, time.min, tzinfo=UTC)
    return starts_at, starts_at + timedelta(days=1)


@dataclass(slots=True)
class AppleCalendarConfig:
    """Environment-backed Apple Calendar configuration."""

    base_url: str
    username: str
    password: str
    writable_calendar_id: str
    readable_calendar_ids: tuple[str, ...]

    @property
    def writable_calendar_url(self) -> str:
        return _normalize_calendar_url(self.base_url, self.writable_calendar_id)

    @property
    def readable_calendar_urls(self) -> tuple[str, ...]:
        if self.readable_calendar_ids:
            return tuple(
                _normalize_calendar_url(self.base_url, calendar_id)
                for calendar_id in self.readable_calendar_ids
            )
        return (self.writable_calendar_url,)

    @classmethod
    def from_env(cls) -> AppleCalendarConfig | None:
        enabled = os.environ.get("MOVE37_APPLE_CALENDAR_ENABLED", "").strip().lower()
        if enabled not in {"1", "true", "yes", "on"}:
            return None
        base_url = os.environ.get("MOVE37_APPLE_CALENDAR_BASE_URL", "").strip()
        username = os.environ.get("MOVE37_APPLE_CALENDAR_USERNAME", "").strip()
        password = os.environ.get("MOVE37_APPLE_CALENDAR_PASSWORD", "").strip()
        writable_calendar_id = os.environ.get("MOVE37_APPLE_CALENDAR_WRITE_CALENDAR", "").strip()
        readable_value = os.environ.get("MOVE37_APPLE_CALENDAR_READ_CALENDARS", "").strip()
        readable_calendar_ids = tuple(
            part.strip() for part in readable_value.split(",") if part.strip()
        )
        if not all((base_url, username, password, writable_calendar_id)):
            return None
        return cls(
            base_url=base_url,
            username=username,
            password=password,
            writable_calendar_id=writable_calendar_id,
            readable_calendar_ids=readable_calendar_ids,
        )


class CalDavAppleEventStore:
    """Thin CalDAV event store used by the Apple calendar adapter."""

    def __init__(self, config: AppleCalendarConfig, client_factory: Any | None = None) -> None:
        self._config = config
        self._client_factory = client_factory or httpx.Client

    def list_events(
        self,
        start: datetime,
        end: datetime,
        calendar_id: str | None = None,
    ) -> list[CalendarEvent]:
        calendar_urls = (
            (_normalize_calendar_url(self._config.base_url, calendar_id),)
            if calendar_id
            else self._config.readable_calendar_urls
        )
        events: list[CalendarEvent] = []
        with self._build_client() as client:
            for calendar_url in calendar_urls:
                response = client.request(
                    "REPORT",
                    calendar_url,
                    headers={
                        "Depth": "1",
                        "Content-Type": "application/xml; charset=utf-8",
                    },
                    content=self._build_query_payload(start, end),
                )
                response.raise_for_status()
                events.extend(self._parse_events(response.text, calendar_url))
        events.sort(key=lambda event: event.starts_at)
        return events

    def discover_calendars(self) -> list[dict[str, Any]]:
        with self._build_client() as client:
            principal_url = self._discover_current_user_principal(client)
            home_set_url = self._discover_calendar_home_set(client, principal_url)
            return self._discover_calendar_collection_urls(client, home_set_url)

    def create_event(self, event: CalendarEvent, calendar_id: str | None = None) -> str:
        calendar_url = _normalize_calendar_url(
            self._config.base_url,
            calendar_id or self._config.writable_calendar_id,
        )
        event_id = event.id or f"move37-{uuid.uuid4().hex}.ics"
        if not event_id.endswith(".ics"):
            event_id = f"{event_id}.ics"
        resource_url = event_id if event_id.startswith("http") else urljoin(calendar_url, quote(event_id))
        with self._build_client() as client:
            response = client.put(
                resource_url,
                headers={"Content-Type": "text/calendar; charset=utf-8"},
                content=self._build_ics(event, resource_url),
            )
            response.raise_for_status()
        return resource_url

    def update_event(
        self,
        event_id: str,
        updates: CalendarEventUpdate,
        calendar_id: str | None = None,
    ) -> CalendarEvent:
        calendar_url = _normalize_calendar_url(
            self._config.base_url,
            calendar_id or self._config.writable_calendar_id,
        )
        resource_url = event_id if event_id.startswith("http") else urljoin(calendar_url, event_id)
        event = CalendarEvent(
            id=resource_url,
            title=updates.title or "Untitled task",
            starts_at=updates.starts_at or datetime.now(UTC),
            ends_at=updates.ends_at or (datetime.now(UTC) + timedelta(days=1)),
            all_day=bool(updates.all_day),
            description=updates.description,
            location=updates.location,
            attendees=updates.attendees or (),
            metadata=updates.metadata or {},
        )
        self.create_event(event, calendar_id=calendar_url)
        return event

    def delete_event(self, event_id: str, calendar_id: str | None = None) -> None:
        calendar_url = _normalize_calendar_url(
            self._config.base_url,
            calendar_id or self._config.writable_calendar_id,
        )
        resource_url = event_id if event_id.startswith("http") else urljoin(calendar_url, event_id)
        with self._build_client() as client:
            response = client.delete(resource_url)
            if response.status_code not in {200, 204, 404}:
                response.raise_for_status()

    def _build_client(self) -> httpx.Client:
        return self._client_factory(
            auth=(self._config.username, self._config.password),
            follow_redirects=True,
            timeout=30.0,
        )

    def _discover_current_user_principal(self, client: httpx.Client) -> str:
        response = client.request(
            "PROPFIND",
            self._config.base_url,
            headers={
                "Depth": "0",
                "Content-Type": "application/xml; charset=utf-8",
            },
            content="""<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal />
  </d:prop>
</d:propfind>""",
        )
        response.raise_for_status()
        root = ET.fromstring(response.text)
        href = root.findtext(".//d:current-user-principal/d:href", default="", namespaces=DAV_NS)
        return href if href.startswith("http") else urljoin(self._config.base_url.rstrip("/") + "/", href.lstrip("/"))

    def _discover_calendar_home_set(self, client: httpx.Client, principal_url: str) -> str:
        response = client.request(
            "PROPFIND",
            principal_url,
            headers={
                "Depth": "0",
                "Content-Type": "application/xml; charset=utf-8",
            },
            content="""<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set />
  </d:prop>
</d:propfind>""",
        )
        response.raise_for_status()
        root = ET.fromstring(response.text)
        href = root.findtext(".//c:calendar-home-set/d:href", default="", namespaces=DAV_NS)
        return href if href.startswith("http") else urljoin(self._config.base_url.rstrip("/") + "/", href.lstrip("/"))

    def _discover_calendar_collection_urls(
        self,
        client: httpx.Client,
        home_set_url: str,
    ) -> list[dict[str, Any]]:
        response = client.request(
            "PROPFIND",
            home_set_url,
            headers={
                "Depth": "1",
                "Content-Type": "application/xml; charset=utf-8",
            },
            content="""<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
  </d:prop>
</d:propfind>""",
        )
        response.raise_for_status()
        root = ET.fromstring(response.text)
        calendars: list[dict[str, Any]] = []
        for node in root.findall("d:response", DAV_NS):
            href = node.findtext("d:href", default="", namespaces=DAV_NS)
            prop = node.find("d:propstat/d:prop", DAV_NS)
            if prop is None:
                continue
            resource_type = prop.find("d:resourcetype", DAV_NS)
            if resource_type is None or resource_type.find("c:calendar", DAV_NS) is None:
                continue
            calendar_url = (
                href if href.startswith("http://") or href.startswith("https://")
                else urljoin(home_set_url.rstrip("/") + "/", href.lstrip("/"))
            )
            display_name = prop.findtext("d:displayname", default="", namespaces=DAV_NS).strip()
            calendars.append(
                {
                    "id": calendar_url.rstrip("/") + "/",
                    "name": display_name or calendar_url.rstrip("/").split("/")[-1] or "apple",
                    "readOnly": False,
                }
            )
        return sorted(calendars, key=lambda item: item["name"].lower())

    @staticmethod
    def _build_query_payload(start: datetime, end: datetime) -> str:
        return f"""<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="{_format_caldav_range(start)}" end="{_format_caldav_range(end)}" />
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>"""

    @staticmethod
    def _build_ics(event: CalendarEvent, event_id: str) -> str:
        uid = event.metadata.get("uid") or event_id.rstrip("/").split("/")[-1].removesuffix(".ics")
        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Move37//Apple Calendar Sync//EN",
            "BEGIN:VEVENT",
            _fold_ics_line(f"UID:{uid}"),
            _fold_ics_line(f"SUMMARY:{_escape_ics(event.title)}"),
            f"DTSTAMP:{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}",
        ]
        if event.all_day:
            lines.append(f"DTSTART;VALUE=DATE:{event.starts_at.date().strftime('%Y%m%d')}")
            lines.append(f"DTEND;VALUE=DATE:{event.ends_at.date().strftime('%Y%m%d')}")
        else:
            lines.append(f"DTSTART:{event.starts_at.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}")
            lines.append(f"DTEND:{event.ends_at.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}")
        if event.description:
            lines.append(_fold_ics_line(f"DESCRIPTION:{_escape_ics(event.description)}"))
        if event.location:
            lines.append(_fold_ics_line(f"LOCATION:{_escape_ics(event.location)}"))
        lines.extend(["END:VEVENT", "END:VCALENDAR"])
        return "\r\n".join(lines) + "\r\n"

    @staticmethod
    def _parse_events(payload: str, calendar_url: str) -> list[CalendarEvent]:
        root = ET.fromstring(payload)
        events: list[CalendarEvent] = []
        for response in root.findall("d:response", DAV_NS):
            href = response.findtext("d:href", default="", namespaces=DAV_NS)
            prop = response.find("d:propstat/d:prop", DAV_NS)
            if prop is None:
                continue
            calendar_data = prop.findtext("c:calendar-data", default="", namespaces=DAV_NS)
            if not calendar_data:
                continue
            event = CalDavAppleEventStore._parse_ics(calendar_data)
            if event is None:
                continue
            href_url = (
                href
                if href.startswith("http://") or href.startswith("https://")
                else urljoin(calendar_url, href.lstrip("/"))
            )
            metadata = dict(event.metadata)
            metadata["href"] = href_url
            events.append(
                event.model_copy(
                    update={
                        "id": href_url,
                        "calendar_id": calendar_url,
                        "calendar_name": calendar_url.rstrip("/").split("/")[-1] or "apple",
                        "etag": prop.findtext("d:getetag", default=None, namespaces=DAV_NS),
                        "metadata": metadata,
                    }
                )
            )
        return events

    @staticmethod
    def _parse_ics(payload: str) -> CalendarEvent | None:
        lines = _unfold_ics(payload)
        values: dict[str, tuple[str, dict[str, str]]] = {}
        inside_event = False
        for line in lines:
            if line == "BEGIN:VEVENT":
                inside_event = True
                continue
            if line == "END:VEVENT":
                break
            if not inside_event or ":" not in line:
                continue
            key_part, value = line.split(":", 1)
            key, *params = key_part.split(";")
            parsed_params: dict[str, str] = {}
            for param in params:
                if "=" not in param:
                    continue
                param_key, param_value = param.split("=", 1)
                parsed_params[param_key.upper()] = param_value
            values[key.upper()] = (value, parsed_params)
        if "SUMMARY" not in values or "DTSTART" not in values:
            return None
        start_value, start_params = values["DTSTART"]
        end_value, end_params = values.get("DTEND", values["DTSTART"])
        all_day = start_params.get("VALUE") == "DATE"
        metadata: dict[str, str] = {}
        if "UID" in values:
            metadata["uid"] = values["UID"][0]
        return CalendarEvent(
            title=values["SUMMARY"][0].replace("\\n", "\n"),
            starts_at=_parse_ical_datetime(start_value, all_day),
            ends_at=_parse_ical_datetime(end_value, end_params.get("VALUE") == "DATE"),
            all_day=all_day,
            description=values.get("DESCRIPTION", ("", {}))[0].replace("\\n", "\n") or None,
            location=values.get("LOCATION", ("", {}))[0] or None,
            metadata=metadata,
        )


class AppleCalendarSyncService:
    """Own Apple Calendar configuration, listing, and task synchronization."""

    def __init__(self, session_factory: sessionmaker, event_store: Any | None = None) -> None:
        self._session_factory = session_factory
        self._config = AppleCalendarConfig.from_env()
        self._event_store_override = event_store

    @property
    def enabled(self) -> bool:
        return self._config is not None

    def get_status(self, subject: str | None = None) -> dict[str, Any]:
        config = self._resolve_config(subject)
        self._ensure_connections(config)
        calendars = self._serialize_calendars(config) if config is not None else []
        return {
            "enabled": True,
            "connected": config is not None,
            "provider": APPLE_PROVIDER,
            "writableCalendarId": config.writable_calendar_url if config else None,
            "ownerEmail": config.username if config else None,
            "baseUrl": config.base_url if config else None,
            "calendars": calendars,
        }

    def connect(
        self,
        subject: str,
        username: str,
        password: str,
        base_url: str | None = None,
        writable_calendar_id: str | None = None,
    ) -> dict[str, Any]:
        config = AppleCalendarConfig(
            base_url=(base_url or "https://caldav.icloud.com").strip().rstrip("/"),
            username=username.strip(),
            password=password,
            writable_calendar_id="",
            readable_calendar_ids=(),
        )
        calendars = self._build_calendar(config).discover_calendars()
        if not calendars:
            raise ValueError("No Apple calendars were discovered for this account.")
        chosen_writable = writable_calendar_id or calendars[0]["id"]
        readable_calendar_ids = tuple(calendar["id"] for calendar in calendars)
        next_config = AppleCalendarConfig(
            base_url=config.base_url,
            username=config.username,
            password=password,
            writable_calendar_id=chosen_writable,
            readable_calendar_ids=readable_calendar_ids,
        )
        with self._session_factory() as session:
            repository = AppleCalendarAccountRepository(session)
            account = repository.get_by_subject(subject) or AppleCalendarAccountModel(owner_subject=subject)
            account.base_url = next_config.base_url
            account.username = next_config.username
            account.password_ciphertext = encrypt_secret(password)
            account.writable_calendar_id = next_config.writable_calendar_url
            account.readable_calendar_ids = json.dumps(list(readable_calendar_ids))
            repository.save(account)
            session.commit()
        self._ensure_connections(next_config)
        return self.get_status(subject)

    def disconnect(self, subject: str) -> dict[str, Any]:
        with self._session_factory() as session:
            repository = AppleCalendarAccountRepository(session)
            account = repository.get_by_subject(subject)
            if account is not None:
                repository.delete(account)
                session.commit()
        return self.get_status(subject)

    def update_preferences(
        self,
        subject: str,
        writable_calendar_id: str,
    ) -> dict[str, Any]:
        with self._session_factory() as session:
            repository = AppleCalendarAccountRepository(session)
            account = repository.get_by_subject(subject)
            if account is None:
                raise ValueError("Apple Calendar is not connected.")
            readable_calendar_ids = tuple(json.loads(account.readable_calendar_ids or "[]"))
            if writable_calendar_id not in readable_calendar_ids:
                raise ValueError("Selected calendar is not available for this account.")
            account.writable_calendar_id = writable_calendar_id
            repository.save(account)
            session.commit()
        return self.get_status(subject)

    def list_events(self, subject: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
        config = self._resolve_config(subject)
        if config is None:
            return []
        self._ensure_connections(config)
        calendar = self._build_calendar(config)
        with self._session_factory() as session:
            links = CalendarEventLinkRepository(session).list_by_subject(APPLE_PROVIDER, subject)
            linked_by_event = {link.external_event_id: link for link in links}
        payload = []
        for event in calendar.list_events(start=start, end=end):
            event_id = event.id or event.metadata.get("href") or event.metadata.get("uid")
            link = linked_by_event.get(event_id)
            payload.append(
                {
                    "id": event_id,
                    "calendarId": event.calendar_id,
                    "calendarName": event.calendar_name,
                    "title": event.title,
                    "startsAt": event.starts_at.isoformat(),
                    "endsAt": event.ends_at.isoformat(),
                    "allDay": event.all_day,
                    "linkedActivityId": link.activity_id if link else None,
                    "managedByMove37": bool(link and link.managed_by_move37),
                }
            )
        return payload

    def sync_activity(self, subject: str, node: dict[str, Any]) -> None:
        config = self._resolve_config(subject)
        if config is None or node.get("kind") == "note":
            return
        calendar = self._build_calendar(config)
        with self._session_factory() as session:
            repository = CalendarEventLinkRepository(session)
            link = repository.get_by_activity(APPLE_PROVIDER, subject, str(node["id"]))
            start_date = str(node.get("startDate") or "").strip()
            if not start_date:
                if link is not None:
                    calendar.delete_event(link.external_event_id, calendar_id=link.external_calendar_id)
                    repository.delete(link)
                    session.commit()
                return
            starts_at, ends_at = _day_bounds(start_date)
            event = CalendarEvent(
                id=link.external_event_id if link else None,
                title=str(node.get("title") or "Untitled task"),
                starts_at=starts_at,
                ends_at=ends_at,
                all_day=True,
                description=str(node.get("notes") or "") or None,
                calendar_id=config.writable_calendar_url,
                calendar_name=config.writable_calendar_url.rstrip("/").split("/")[-1],
                metadata={
                    "uid": f"move37-{subject}-{node['id']}",
                    "activityId": str(node["id"]),
                },
            )
            event_id = calendar.create_event(event, calendar_id=config.writable_calendar_url)
            next_link = link or CalendarEventLinkModel(
                provider=APPLE_PROVIDER,
                owner_subject=subject,
                activity_id=str(node["id"]),
                external_calendar_id=config.writable_calendar_url,
                external_event_id=event_id,
                managed_by_move37=True,
            )
            next_link.external_calendar_id = config.writable_calendar_url
            next_link.external_event_id = event_id
            repository.save(next_link)
            session.commit()

    def sync_graph(self, subject: str, snapshot: dict[str, Any] | None = None) -> dict[str, int]:
        config = self._resolve_config(subject)
        if config is None:
            return {"syncedActivities": 0, "deletedActivities": 0}
        if snapshot is None:
            with self._session_factory() as session:
                graph_repository = ActivityGraphRepository(session)
                snapshot = graph_repository.get_snapshot(subject)
        if snapshot is None:
            return {"syncedActivities": 0, "deletedActivities": 0}

        scheduled_activity_ids: set[str] = set()
        synced_activities = 0
        deleted_activities = 0
        for node in snapshot["nodes"]:
            if node.get("kind") == "note":
                continue
            activity_id = str(node["id"])
            if str(node.get("startDate") or "").strip():
                self.sync_activity(subject, node)
                scheduled_activity_ids.add(activity_id)
                synced_activities += 1

        with self._session_factory() as session:
            repository = CalendarEventLinkRepository(session)
            stale_activity_ids = [
                link.activity_id
                for link in repository.list_by_subject(APPLE_PROVIDER, subject)
                if link.activity_id not in scheduled_activity_ids
            ]
        for activity_id in stale_activity_ids:
            self.delete_activity(subject, activity_id)
            deleted_activities += 1
        return {
            "syncedActivities": synced_activities,
            "deletedActivities": deleted_activities,
        }

    def delete_activity(self, subject: str, activity_id: str) -> None:
        config = self._resolve_config(subject)
        if config is None:
            return
        calendar = self._build_calendar(config)
        with self._session_factory() as session:
            repository = CalendarEventLinkRepository(session)
            link = repository.get_by_activity(APPLE_PROVIDER, subject, activity_id)
            if link is None:
                return
            calendar.delete_event(link.external_event_id, calendar_id=link.external_calendar_id)
            repository.delete(link)
            session.commit()

    def reconcile(self, subject: str) -> dict[str, int]:
        config = self._resolve_config(subject)
        if config is None:
            return {"updatedActivities": 0, "clearedActivities": 0}
        self._ensure_connections(config)
        calendar = self._build_calendar(config)
        start = datetime.now(UTC) - timedelta(days=90)
        end = datetime.now(UTC) + timedelta(days=365)
        events = calendar.list_events(start=start, end=end)
        events_by_id = {event.id: event for event in events if event.id}
        updated_activities = 0
        cleared_activities = 0
        with self._session_factory() as session:
            link_repository = CalendarEventLinkRepository(session)
            graph_repository = ActivityGraphRepository(session)
            snapshot = graph_repository.get_snapshot(subject)
            if snapshot is None:
                return {"updatedActivities": 0, "clearedActivities": 0}
            nodes_by_id = {str(node["id"]): node for node in snapshot["nodes"]}
            graph_dirty = False
            for link in link_repository.list_by_subject(APPLE_PROVIDER, subject):
                node = nodes_by_id.get(link.activity_id)
                if node is None:
                    link_repository.delete(link)
                    continue
                event = events_by_id.get(link.external_event_id)
                if event is None:
                    if node.get("startDate"):
                        node["startDate"] = ""
                        cleared_activities += 1
                        graph_dirty = True
                    link_repository.delete(link)
                    continue
                start_date = event.starts_at.date().isoformat()
                if node.get("title") != event.title:
                    node["title"] = event.title
                    updated_activities += 1
                    graph_dirty = True
                if node.get("startDate") != start_date:
                    node["startDate"] = start_date
                    updated_activities += 1
                    graph_dirty = True
                link.last_seen_etag = event.etag
                session.add(link)
            if graph_dirty:
                graph_repository.save_snapshot(subject, snapshot)
            session.commit()
        return {"updatedActivities": updated_activities, "clearedActivities": cleared_activities}

    def _ensure_connections(self, config: AppleCalendarConfig | None) -> None:
        if config is None:
            return
        with self._session_factory() as session:
            repository = CalendarConnectionRepository(session)
            for calendar_url in config.readable_calendar_urls:
                repository.upsert(
                    provider=APPLE_PROVIDER,
                    external_calendar_id=calendar_url,
                    owner_email=config.username,
                )
            session.commit()

    def _resolve_config(self, subject: str | None) -> AppleCalendarConfig | None:
        if subject:
            with self._session_factory() as session:
                repository = AppleCalendarAccountRepository(session)
                account = repository.get_by_subject(subject)
            if account is not None:
                readable_calendar_ids = tuple(json.loads(account.readable_calendar_ids or "[]"))
                writable_calendar_id = account.writable_calendar_id or (readable_calendar_ids[0] if readable_calendar_ids else "")
                return AppleCalendarConfig(
                    base_url=account.base_url,
                    username=account.username,
                    password=decrypt_secret(account.password_ciphertext),
                    writable_calendar_id=writable_calendar_id,
                    readable_calendar_ids=readable_calendar_ids,
                )
        return self._config

    def _build_calendar(self, config: AppleCalendarConfig) -> AppleCalendar:
        event_store = self._event_store_override or CalDavAppleEventStore(config)
        return AppleCalendar(event_store)

    @staticmethod
    def _serialize_calendars(config: AppleCalendarConfig) -> list[dict[str, Any]]:
        return [
            {
                "id": calendar_url,
                "name": calendar_url.rstrip("/").split("/")[-1] or "apple",
                "readOnly": calendar_url != config.writable_calendar_url,
            }
            for calendar_url in config.readable_calendar_urls
        ]
