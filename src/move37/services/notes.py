"""Note application service."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any
from urllib.parse import urlparse, unquote

import httpx
from sqlalchemy.orm import sessionmaker

from move37.default_graph import build_default_graph
from move37.repositories.activity_graph import ActivityGraphRepository
from move37.repositories.note import NoteRepository
from move37.services.activity_graph import ActivityGraphService, build_note_preview
from move37.services.errors import NotFoundError


@dataclass(slots=True)
class ImportTextPayload:
    """MCP-safe representation of an imported text file."""

    filename: str
    content: str


class NoteService:
    """Own notes CRUD, import, graph-node linking, and embedding jobs."""

    def __init__(self, session_factory: sessionmaker, activity_graph_service: ActivityGraphService) -> None:
        self._session_factory = session_factory
        self._activity_graph_service = activity_graph_service

    def list_notes(self, subject: str) -> list[dict[str, object]]:
        with self._session_factory() as session:
            repository = NoteRepository(session)
            return [repository.serialize_note(note) for note in repository.list_notes(subject)]

    def get_note(self, subject: str, note_id: int) -> dict[str, object]:
        with self._session_factory() as session:
            repository = NoteRepository(session)
            note = repository.get_note(subject, note_id)
            if note is None:
                raise NotFoundError("Note not found.")
            return repository.serialize_note(note)

    def get_note_by_activity(self, subject: str, activity_id: str) -> dict[str, object] | None:
        with self._session_factory() as session:
            repository = NoteRepository(session)
            note = repository.get_note_by_linked_activity(subject, activity_id)
            return repository.serialize_note(note) if note else None

    def create_note(
        self,
        subject: str,
        *,
        title: str,
        body: str,
        source_type: str = "manual",
        source_filename: str | None = None,
    ) -> dict[str, object]:
        with self._session_factory() as session:
            note_repository = NoteRepository(session)
            graph_repository = ActivityGraphRepository(session)
            snapshot = self._get_or_seed_graph(subject, graph_repository)
            note = note_repository.create_note(
                owner_subject=subject,
                title=title,
                body=body,
                source_type=source_type,
                source_filename=source_filename,
                linked_activity_id=None,
                content_sha256=self._hash_body(body),
                ingest_status="pending",
            )
            note.linked_activity_id = self._activity_graph_service.create_note_node(
                snapshot,
                title=title,
                note_id=note.id,
                body=body,
            )
            note_repository.enqueue_job(
                note_id=note.id,
                owner_subject=subject,
                job_type="upsert",
            )
            graph = graph_repository.save_snapshot(subject, snapshot)
            session.commit()
            return {
                "note": note_repository.serialize_note(note),
                "graph": graph,
            }

    def update_note(
        self,
        subject: str,
        note_id: int,
        *,
        title: str | None = None,
        body: str | None = None,
    ) -> dict[str, object]:
        with self._session_factory() as session:
            note_repository = NoteRepository(session)
            graph_repository = ActivityGraphRepository(session)
            note = note_repository.get_note(subject, note_id)
            if note is None:
                raise NotFoundError("Note not found.")
            snapshot = self._get_or_seed_graph(subject, graph_repository)
            node = None
            if note.linked_activity_id:
                for candidate in snapshot["nodes"]:
                    if candidate["id"] == note.linked_activity_id:
                        node = candidate
                        break

            body_changed = body is not None and body != note.body
            if title is not None:
                note.title = title
                if node is not None:
                    node["title"] = title
            if body is not None:
                note.body = body
                note.content_sha256 = self._hash_body(body)
                note.ingest_status = "pending"
                note.ingest_error = None
                if node is not None:
                    node["notes"] = build_note_preview(body)
            if body_changed:
                note_repository.enqueue_job(
                    note_id=note.id,
                    owner_subject=subject,
                    job_type="upsert",
                )
            graph = graph_repository.save_snapshot(subject, snapshot)
            session.commit()
            return {
                "note": note_repository.serialize_note(note),
                "graph": graph,
            }

    def import_texts(self, subject: str, payloads: list[ImportTextPayload]) -> dict[str, object]:
        with self._session_factory() as session:
            note_repository = NoteRepository(session)
            graph_repository = ActivityGraphRepository(session)
            snapshot = self._get_or_seed_graph(subject, graph_repository)
            notes: list[dict[str, object]] = []
            for payload in payloads:
                title = self._filename_to_title(payload.filename)
                note = note_repository.create_note(
                    owner_subject=subject,
                    title=title,
                    body=payload.content,
                    source_type="import",
                    source_filename=payload.filename,
                    linked_activity_id=None,
                    content_sha256=self._hash_body(payload.content),
                    ingest_status="pending",
                )
                note.linked_activity_id = self._activity_graph_service.create_note_node(
                    snapshot,
                    title=title,
                    note_id=note.id,
                    body=payload.content,
                )
                note_repository.enqueue_job(
                    note_id=note.id,
                    owner_subject=subject,
                    job_type="upsert",
                )
                notes.append(note_repository.serialize_note(note))
            graph = graph_repository.save_snapshot(subject, snapshot)
            session.commit()
            return {
                "notes": notes,
                "graph": graph,
            }

    def import_text_from_url(self, subject: str, url: str) -> dict[str, object]:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Enter a valid http or https URL.")

        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()

        content_type = (response.headers.get("content-type") or "").lower()
        filename = self._filename_from_url(str(response.url))
        looks_like_text = content_type.startswith("text/plain") or filename.lower().endswith(".txt")
        if not looks_like_text:
            raise ValueError("URL must return plain text data.")

        if "html" in content_type:
            raise ValueError("HTML pages cannot be imported as notes.")

        content = response.text
        return self.import_texts(
            subject,
            [ImportTextPayload(filename=filename, content=content)],
        )

    def decode_text_file(self, filename: str, content: bytes) -> ImportTextPayload:
        lowered = filename.lower()
        if not lowered.endswith(".txt"):
            raise ValueError("Only .txt files are supported.")
        decoders = ("utf-8-sig", "utf-8", "utf-16")
        for encoding in decoders:
            try:
                return ImportTextPayload(filename=filename, content=content.decode(encoding))
            except UnicodeDecodeError:
                continue
        raise ValueError("Unsupported text encoding. Use UTF-8, UTF-8 BOM, or UTF-16.")

    @staticmethod
    def _hash_body(body: str) -> str:
        return sha256(body.encode("utf-8")).hexdigest()

    @staticmethod
    def _filename_to_title(filename: str) -> str:
        base = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
        if base.lower().endswith(".txt"):
            base = base[:-4]
        return base or "Untitled note"

    @staticmethod
    def _filename_from_url(url: str) -> str:
        path = unquote(urlparse(url).path or "")
        base = path.rsplit("/", 1)[-1].strip()
        if not base:
            return "imported-note.txt"
        return base

    def _get_or_seed_graph(
        self,
        subject: str,
        graph_repository: ActivityGraphRepository,
    ) -> dict[str, Any]:
        snapshot = graph_repository.get_snapshot(subject)
        if snapshot is None:
            snapshot = graph_repository.save_snapshot(
                subject,
                self._activity_graph_service._sanitize_graph(build_default_graph()),
            )
        return snapshot
