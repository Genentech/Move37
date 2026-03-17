"""Note endpoints for the Move37 API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from httpx import HTTPError

from move37.api.schemas import (
    NoteCreateResponse,
    NoteImportResponse,
    NoteImportUrlInput,
    NoteListOutput,
    NoteOutput,
    NotePatch,
    NotePayload,
    NoteSearchInput,
    NoteSearchOutput,
)
from move37.api.dependencies import get_current_subject, get_service_container
from move37.services.container import ServiceContainer
from move37.services.errors import NotFoundError

router = APIRouter(tags=["notes"])


def _handle_note_error(error: Exception) -> None:
    if isinstance(error, NotFoundError):
        raise HTTPException(status_code=404, detail=error.message) from error
    if isinstance(error, ValueError):
        raise HTTPException(status_code=400, detail=str(error)) from error
    if isinstance(error, HTTPError):
        raise HTTPException(status_code=503, detail="AI service unavailable.") from error
    raise error


@router.get("/notes", response_model=NoteListOutput)
def list_notes(
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> NoteListOutput:
    return NoteListOutput(notes=[NoteOutput(**note) for note in services.note_service.list_notes(subject)])


@router.get("/notes/{note_id}", response_model=NoteOutput)
def get_note(
    note_id: int,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> NoteOutput:
    try:
        payload = services.note_service.get_note(subject, note_id)
    except Exception as error:  # pragma: no cover
        _handle_note_error(error)
    return NoteOutput(**payload)


@router.post("/notes", response_model=NoteCreateResponse)
def create_note(
    payload: NotePayload,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> NoteCreateResponse:
    try:
        response = services.note_service.create_note(subject, title=payload.title, body=payload.body)
    except Exception as error:  # pragma: no cover
        _handle_note_error(error)
    return NoteCreateResponse(
        note=NoteOutput(**response["note"]),
        graph=response["graph"],
    )


@router.patch("/notes/{note_id}", response_model=NoteCreateResponse)
def update_note(
    note_id: int,
    payload: NotePatch,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> NoteCreateResponse:
    try:
        response = services.note_service.update_note(
            subject,
            note_id,
            title=payload.title,
            body=payload.body,
        )
    except Exception as error:  # pragma: no cover
        _handle_note_error(error)
    return NoteCreateResponse(
        note=NoteOutput(**response["note"]),
        graph=response["graph"],
    )


@router.post("/notes/import", response_model=NoteImportResponse)
async def import_notes(
    files: Annotated[list[UploadFile], File(...)],
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> NoteImportResponse:
    try:
        payloads = [
            services.note_service.decode_text_file(file.filename or "note.txt", await file.read())
            for file in files
        ]
        response = services.note_service.import_texts(subject, payloads)
    except Exception as error:  # pragma: no cover
        _handle_note_error(error)
    return NoteImportResponse(
        notes=[NoteOutput(**note) for note in response["notes"]],
        graph=response["graph"],
    )


@router.post("/notes/import-url", response_model=NoteImportResponse)
def import_note_from_url(
    payload: NoteImportUrlInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> NoteImportResponse:
    try:
        response = services.note_service.import_text_from_url(subject, payload.url)
    except Exception as error:  # pragma: no cover
        _handle_note_error(error)
    return NoteImportResponse(
        notes=[NoteOutput(**note) for note in response["notes"]],
        graph=response["graph"],
    )


@router.post("/notes/search", response_model=NoteSearchOutput)
def search_notes(
    payload: NoteSearchInput,
    subject: Annotated[str, Depends(get_current_subject)],
    services: Annotated[ServiceContainer, Depends(get_service_container)],
) -> NoteSearchOutput:
    try:
        response = services.ai_client.search_notes(subject=subject, query=payload.query, top_k=payload.topK)
    except Exception as error:  # pragma: no cover
        _handle_note_error(error)
    return NoteSearchOutput(results=response)
