"""Application service container for the Move37 API."""

from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from move37.services.ai_client import Move37AiClient
from move37.services.activity_graph import ActivityGraphService
from move37.services.apple_calendar import AppleCalendarSyncService
from move37.services.chat import ChatSessionService
from move37.services.notes import NoteService
from move37.services.scheduling import SchedulingService


class ServiceContainer:
    """Wire shared infra and domain services."""

    def __init__(self) -> None:
        database_url = os.environ.get(
            "MOVE37_DATABASE_URL",
            "sqlite+pysqlite:///./move37.db",
        )
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self.engine = create_engine(database_url, future=True, connect_args=connect_args)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
        self.apple_calendar_service = AppleCalendarSyncService(self.session_factory)
        self.activity_graph_service = ActivityGraphService(self.session_factory)
        self.scheduling_service = SchedulingService(
            self.session_factory,
            apple_calendar_service=self.apple_calendar_service,
        )
        self.ai_client = Move37AiClient(os.environ.get("MOVE37_AI_BASE_URL"))
        self.note_service = NoteService(self.session_factory, self.activity_graph_service)
        self.chat_session_service = ChatSessionService(self.session_factory, self.ai_client)
