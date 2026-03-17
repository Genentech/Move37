"""Move37 package exports.

Keep top-level imports lazy so metadata-only consumers such as Alembic can load
`move37.models` without importing optional runtime services.
"""

from __future__ import annotations

from importlib import import_module

_EXPORTS = {
    "AccountBalance": "move37.schemas.bank_account",
    "ActivityGraphRepository": "move37.repositories.activity_graph",
    "ActivityGraphService": "move37.services.activity_graph",
    "AppleCalendar": "move37.services.calendar",
    "BankAccountInterface": "move37.services.bank_account",
    "BankAccountRepository": "move37.repositories.bank_account",
    "CalendarConnectionRepository": "move37.repositories.calendar",
    "CalendarEvent": "move37.schemas.calendar",
    "CalendarEventUpdate": "move37.schemas.calendar",
    "CalendarInterface": "move37.services.calendar",
    "GitHubIntegrationRepository": "move37.repositories.github",
    "GitHubInterface": "move37.services.github",
    "GitHubIssue": "move37.schemas.github",
    "GitHubIssueCreate": "move37.schemas.github",
    "GitHubPullRequest": "move37.schemas.github",
    "GitHubRepository": "move37.schemas.github",
    "GitHubWorkflowDispatch": "move37.schemas.github",
    "GoogleCalendar": "move37.services.calendar",
    "OpenBankingClient": "move37.services.bank_account",
    "RevolutBankAccount": "move37.services.bank_account",
    "ServiceContainer": "move37.services.container",
    "Transaction": "move37.schemas.bank_account",
    "TransferRequest": "move37.schemas.bank_account",
}

__all__ = sorted(_EXPORTS)


def __getattr__(name: str) -> object:
    module_name = _EXPORTS.get(name)
    if module_name is None:
        raise AttributeError(f"module 'move37' has no attribute {name!r}")
    module = import_module(module_name)
    return getattr(module, name)
