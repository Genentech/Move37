"""Service layer exports for Move37 integrations.

Imports stay lazy so optional service dependencies do not become mandatory for
metadata, migrations, or other partial-package consumers.
"""

from __future__ import annotations

from importlib import import_module

_EXPORTS = {
    "ActivityGraphService": "move37.services.activity_graph",
    "AppleCalendar": "move37.services.calendar",
    "AppleCalendarSyncService": "move37.services.apple_calendar",
    "BankAccountInterface": "move37.services.bank_account",
    "CalendarInterface": "move37.services.calendar",
    "ChatSessionService": "move37.services.chat",
    "GitHubInterface": "move37.services.github",
    "GoogleCalendar": "move37.services.calendar",
    "Move37AiClient": "move37.services.ai_client",
    "NoteService": "move37.services.notes",
    "OpenBankingClient": "move37.services.bank_account",
    "RevolutBankAccount": "move37.services.bank_account",
    "ServiceContainer": "move37.services.container",
}

__all__ = sorted(_EXPORTS)


def __getattr__(name: str) -> object:
    module_name = _EXPORTS.get(name)
    if module_name is None:
        raise AttributeError(f"module 'move37.services' has no attribute {name!r}")
    module = import_module(module_name)
    return getattr(module, name)
