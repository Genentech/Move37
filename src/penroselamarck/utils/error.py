"""Common exception types."""

from __future__ import annotations


class PenroseLamarckError(RuntimeError):
    """Base runtime error for Penrose-Lamarck services."""


class PenroseLamarckError(PenroseLamarckError):
    """
    Backward-compatible alias retained for copied orchestrator modules.

    New code should raise ``PenroseLamarckError`` directly.
    """


class OrchestratorScopeConfigError(PenroseLamarckError):
    """Invalid orchestrator scope configuration."""
