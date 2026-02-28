"""
Deterministic mock data seeding for Postgres.

Seeds exercises, practice sessions, attempts, and performance summaries.

Public API
----------
- :func:`main`: Entry point that seeds data idempotently.

Attributes
----------
DEFAULT_SEED : int
    Default random seed for deterministic data generation.

Examples
--------
>>> DEFAULT_SEED
20260203

See Also
--------
:mod:`penroselamarck.db.lineage`
"""

from __future__ import annotations

import hashlib
import os
import random
import sys
from collections.abc import Iterable
from datetime import datetime, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from penroselamarck.db.lineage import emit_openlineage_run
from penroselamarck.models.attempt import Attempt
from penroselamarck.models.exercise import Exercise
from penroselamarck.models.performance_summary import PerformanceSummary
from penroselamarck.models.practice_session import PracticeSession

DEFAULT_SEED = 20260203


def _db_url() -> str:
    """
    _db_url() -> str

    Concise (one-line) description of the function.

    Parameters
    ----------
    None
        This function does not accept parameters.

    Returns
    -------
    str
        SQLAlchemy connection URL from environment variables.

    Examples
    --------
    >>> isinstance(_db_url(), str)
    True
    """
    user = os.getenv("POSTGRES_USER", "penroselamarck")
    password = os.getenv("POSTGRES_PASSWORD", "penroselamarck")
    db = os.getenv("POSTGRES_DB", "penroselamarck")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv("POSTGRES_PORT", "5432")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{db}"


def _seed_value() -> int:
    """
    _seed_value() -> int

    Concise (one-line) description of the function.

    Parameters
    ----------
    None
        This function does not accept parameters.

    Returns
    -------
    int
        Deterministic seed value.

    Examples
    --------
    >>> isinstance(_seed_value(), int)
    True
    """
    return int(os.getenv("PENROSELAMARCK_SEED", str(DEFAULT_SEED)))


def _stable_id(seed: int, name: str) -> str:
    """
    _stable_id(seed, name) -> str

    Concise (one-line) description of the function.

    Parameters
    ----------
    seed : int
        Seed used to namespace identifiers.
    name : str
        Logical identifier name.

    Returns
    -------
    str
        Stable hexadecimal identifier string.

    Examples
    --------
    >>> len(_stable_id(1, \"demo\")) == 64
    True
    """
    payload = f"{seed}:{name}".encode()
    return hashlib.sha256(payload).hexdigest()


def _resource_uri(kind: str, stable_key: str) -> str:
    """
    _resource_uri(kind, stable_key) -> str

    Build stable Penrose-Lamarck resource URIs.
    """
    short = stable_key[:16]
    return f"pluid:{kind}:{short}"


def _content_hash(question: str, answer: str) -> str:
    """
    _content_hash(question, answer) -> str

    Concise (one-line) description of the function.

    Parameters
    ----------
    question : str
        The question text.
    answer : str
        The answer text.

    Returns
    -------
    str
        SHA-256 hex digest over normalized content.

    Examples
    --------
    >>> len(_content_hash(\"q\", \"a\")) == 64
    True
    """
    canonical_q = " ".join(question.strip().split()).lower()
    canonical_a = " ".join(answer.strip().split()).lower()
    return hashlib.sha256((canonical_q + "\n" + canonical_a).encode("utf-8")).hexdigest()


def _exercise_rows(seed: int) -> list[dict]:
    """
    _exercise_rows(seed) -> List[Dict]

    Concise (one-line) description of the function.

    Parameters
    ----------
    seed : int
        Seed for deterministic ordering.

    Returns
    -------
    List[Dict]
        Exercise row payloads.

    Examples
    --------
    >>> isinstance(_exercise_rows(1), list)
    True
    """
    base = [
        {
            "question": "Patient intake greeting in Danish",
            "answer": "Hej, hvordan har du det i dag?",
            "language": "da",
            "tags": ["medical", "intro"],
            "classes": ["conversation", "triage"],
        },
        {
            "question": "Record blood pressure values in Spanish",
            "answer": "Presion arterial ciento veinte sobre ochenta",
            "language": "es",
            "tags": ["vitals", "cardiology"],
            "classes": ["vocabulary", "cardiology"],
        },
        {
            "question": "Explain fasting requirement before blood test",
            "answer": "Do not eat for eight hours before the test",
            "language": "en",
            "tags": ["lab"],
            "classes": ["conversation", "lab"],
        },
        {
            "question": "Triage chest pain urgency phrasing",
            "answer": "Chest pain with shortness of breath requires immediate assessment",
            "language": "en",
            "tags": ["triage", "urgent"],
            "classes": ["triage", "cardiology"],
        },
        {
            "question": "Medication reconciliation script",
            "answer": "Please list all medicines and doses you take daily",
            "language": "en",
            "tags": ["pharmacy"],
            "classes": ["conversation", "medication"],
        },
        {
            "question": "Post-op wound care vocabulary in Swedish",
            "answer": "Byt forband och hall saaret rent",
            "language": "sv",
            "tags": ["surgery", "care"],
            "classes": ["vocabulary", "postop"],
        },
        {
            "question": "Lab specimen confirmation checklist",
            "answer": "Confirm patient name, date of birth, and specimen label match",
            "language": "en",
            "tags": ["lab", "safety"],
            "classes": ["lab", "safety"],
        },
        {
            "question": "Emergency allergy escalation sentence",
            "answer": "Severe allergy signs require immediate physician notification",
            "language": "en",
            "tags": ["urgent", "allergy"],
            "classes": ["triage", "safety"],
        },
        {
            "question": "Cardiology follow-up appointment phrase in Danish",
            "answer": "Naeste kontrol hos hjertelaegen er om to uger",
            "language": "da",
            "tags": ["appointment", "cardiology"],
            "classes": ["conversation", "cardiology"],
        },
        {
            "question": "Antibiotic dosage confirmation",
            "answer": "Take one tablet twice daily after meals",
            "language": "en",
            "tags": ["medication"],
            "classes": ["medication", "vocabulary"],
        },
        {
            "question": "Discharge safety warning",
            "answer": "Return to emergency if fever or breathing difficulty occurs",
            "language": "en",
            "tags": ["discharge", "safety"],
            "classes": ["safety", "conversation"],
        },
        {
            "question": "Post-op pain scale translation",
            "answer": "Rate your pain from zero to ten",
            "language": "en",
            "tags": ["postop", "assessment"],
            "classes": ["postop", "triage"],
        },
    ]
    rng = random.Random(seed)
    rng.shuffle(base)
    created_at = datetime(2024, 1, 1, 0, 0, 0)
    rows = []
    for idx, row in enumerate(base, start=1):
        row_id = _stable_id(seed, f"exercise-{idx}")
        rows.append({
            "id": row_id,
            "uri": _resource_uri("exercise", row_id),
            "question": row["question"],
            "answer": row["answer"],
            "language": row["language"],
            "tags": row["tags"],
            "classes": row["classes"],
            "content_hash": _content_hash(row["question"], row["answer"]),
            "created_at": created_at + timedelta(minutes=idx),
        })
    return rows


def _session_rows(seed: int, exercise_ids: list[str]) -> list[dict]:
    """
    _session_rows(seed, exercise_ids) -> List[Dict]

    Concise (one-line) description of the function.

    Parameters
    ----------
    seed : int
        Seed for deterministic identifiers.
    exercise_ids : List[str]
        Exercise identifiers to include.

    Returns
    -------
    List[Dict]
        Practice session row payloads.

    Examples
    --------
    >>> isinstance(_session_rows(1, [\"e\"]), list)
    True
    """
    first_group = exercise_ids[:4]
    second_group = exercise_ids[4:8]
    third_group = exercise_ids[8:]
    return [
        {
            "session_id": _stable_id(seed, "session-1"),
            "uri": _resource_uri("practice-session", _stable_id(seed, "session-1")),
            "language": "da",
            "strategy": "mixed",
            "target_count": len(first_group),
            "status": "ended",
            "started_at": datetime(2024, 1, 2, 9, 0, 0),
            "ended_at": datetime(2024, 1, 2, 9, 30, 0),
            "selected_exercise_ids": first_group,
        },
        {
            "session_id": _stable_id(seed, "session-2"),
            "uri": _resource_uri("practice-session", _stable_id(seed, "session-2")),
            "language": "sv",
            "strategy": "spaced",
            "target_count": len(second_group),
            "status": "ended",
            "started_at": datetime(2024, 1, 3, 10, 0, 0),
            "ended_at": datetime(2024, 1, 3, 10, 20, 0),
            "selected_exercise_ids": second_group,
        },
        {
            "session_id": _stable_id(seed, "session-3"),
            "uri": _resource_uri("practice-session", _stable_id(seed, "session-3")),
            "language": "en",
            "strategy": "weakest",
            "target_count": len(third_group),
            "status": "ended",
            "started_at": datetime(2024, 1, 4, 14, 0, 0),
            "ended_at": datetime(2024, 1, 4, 14, 25, 0),
            "selected_exercise_ids": third_group,
        },
    ]


def _attempt_rows(seed: int, sessions: list[dict]) -> list[dict]:
    """
    _attempt_rows(seed, sessions) -> List[Dict]

    Concise (one-line) description of the function.

    Parameters
    ----------
    seed : int
        Seed for deterministic identifiers.
    sessions : List[Dict]
        Session payloads containing selected exercises.

    Returns
    -------
    List[Dict]
        Attempt row payloads.

    Examples
    --------
    >>> filter = {"session_id": "s", "selected_exercise_ids": ["e"]}
    >>> isinstance(_attempt_rows(1, [filter]), list)
    True
    """
    attempts: list[dict] = []
    for sess_index, sess in enumerate(sessions, start=1):
        for ex_index, ex_id in enumerate(sess["selected_exercise_ids"], start=1):
            attempt_id = _stable_id(seed, f"attempt-{sess_index}-{ex_index}")
            score = 1.0 if ex_index % 3 == 1 else (0.75 if ex_index % 3 == 2 else 0.45)
            attempts.append({
                "id": attempt_id,
                "uri": _resource_uri("attempt", attempt_id),
                "session_id": sess["session_id"],
                "exercise_id": ex_id,
                "user_answer": f"candidate-answer-{sess_index}-{ex_index}",
                "score": score,
                "passed": score >= 0.7,
                "evaluated_at": sess["started_at"] + timedelta(minutes=ex_index * 3),
            })
    return attempts


def _summary_rows(attempts: Iterable[dict]) -> list[dict]:
    """
    _summary_rows(attempts) -> List[Dict]

    Concise (one-line) description of the function.

    Parameters
    ----------
    attempts : Iterable[Dict]
        Attempt payloads.

    Returns
    -------
    List[Dict]
        Performance summary payloads.

    Examples
    --------
    >>> isinstance(_summary_rows([]), list)
    True
    """
    aggregated: dict[str, dict] = {}
    for attempt in attempts:
        bucket = aggregated.setdefault(
            attempt["exercise_id"],
            {"total": 0, "passed": 0, "last": None},
        )
        bucket["total"] += 1
        if attempt["passed"]:
            bucket["passed"] += 1
        ts = attempt["evaluated_at"]
        if bucket["last"] is None or ts > bucket["last"]:
            bucket["last"] = ts
    rows = []
    for exercise_id, stats in aggregated.items():
        total = stats["total"]
        rows.append({
            "exercise_id": exercise_id,
            "uri": _resource_uri("performance-summary", exercise_id),
            "total_attempts": total,
            "pass_rate": (stats["passed"] / total) if total else 0.0,
            "last_practiced_at": stats["last"],
        })
    return rows


def _upsert(session: Session, model, rows: Iterable[dict], pk_field: str) -> None:
    """
    _upsert(session, model, rows, pk_field) -> None

    Concise (one-line) description of the function.

    Parameters
    ----------
    session : Session
        Active SQLAlchemy session.
    model : type
        ORM model class.
    rows : Iterable[Dict]
        Row payloads to insert or update.
    pk_field : str
        Primary key field name.

    Returns
    -------
    None
        Inserts or updates rows idempotently.

    Examples
    --------
    >>> callable(_upsert)
    True
    """
    for row in rows:
        pk_value = row[pk_field]
        existing = session.get(model, pk_value)
        if not existing:
            session.add(model(**row))
        else:
            for key, value in row.items():
                setattr(existing, key, value)


def _ensure_unique_content_hashes(session: Session) -> None:
    """
    _ensure_unique_content_hashes(session) -> None

    Concise (one-line) description of the function.

    Parameters
    ----------
    session : Session
        Active SQLAlchemy session.

    Returns
    -------
    None
        Raises if duplicate content hashes exist.

    Examples
    --------
    >>> callable(_ensure_unique_content_hashes)
    True
    """
    hashes = session.scalars(select(Exercise.content_hash)).all()
    if len(hashes) != len(set(hashes)):
        raise ValueError("Duplicate exercise content_hash detected")


def _emit_lineage(seed: int, inputs: list[str], outputs: list[str]) -> None:
    """
    _emit_lineage(seed, inputs, outputs) -> None

    Concise (one-line) description of the function.

    Parameters
    ----------
    seed : int
        Seed value included in lineage metadata.
    inputs : List[str]
        Input dataset names.
    outputs : List[str]
        Output dataset names.

    Returns
    -------
    None
        Emits OpenLineage run events when configured.

    Examples
    --------
    >>> callable(_emit_lineage)
    True
    """
    emit_openlineage_run(
        job_name="db_seed",
        run_args={"seed": seed},
        inputs=inputs,
        outputs=outputs,
    )


def main() -> None:
    """
    main() -> None

    Seed all tables with deterministic data. Safe to run multiple times.

    Parameters
    ----------
    None
        This function does not accept parameters.

    Returns
    -------
    None
        Seeds deterministic data and validates basic constraints.

    Examples
    --------
    >>> isinstance(DEFAULT_SEED, int)
    True
    """
    seed = _seed_value()
    engine = create_engine(_db_url(), pool_pre_ping=True)
    exercises = _exercise_rows(seed)
    exercise_ids = [row["id"] for row in exercises]
    sessions = _session_rows(seed, exercise_ids)
    attempts = _attempt_rows(seed, sessions)
    summaries = _summary_rows(attempts)

    try:
        _emit_lineage(
            seed,
            inputs=["seed_inputs"],
            outputs=["exercises", "practice_sessions", "attempts", "performance_summaries"],
        )
    except Exception as exc:  # pragma: no cover - defensive logging
        print(f"[seed] OpenLineage emit failed: {exc}", file=sys.stderr)

    with Session(engine) as session:
        _upsert(session, Exercise, exercises, "id")
        _upsert(session, PracticeSession, sessions, "session_id")
        _upsert(session, Attempt, attempts, "id")
        _upsert(session, PerformanceSummary, summaries, "exercise_id")
        _ensure_unique_content_hashes(session)
        session.commit()


if __name__ == "__main__":
    main()
