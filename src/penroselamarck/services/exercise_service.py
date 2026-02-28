"""
Exercise service.

Provides business logic for creating and listing exercises.

Public API
----------
- :class:`ExerciseService`: Exercise business operations.

Attributes
----------
None

Examples
--------
>>> from penroselamarck.db.session import get_engine
>>> from penroselamarck.repositories.exercise_repository import ExerciseRepository
>>> service = ExerciseService(ExerciseRepository(get_engine()))
>>> callable(service.list_exercises)
True

See Also
--------
:mod:`penroselamarck.repositories.exercise_repository`
"""

from __future__ import annotations

import hashlib
import re
import uuid
from itertools import combinations
from datetime import datetime

from penroselamarck.repositories.exercise_repository import ExerciseRepository
from penroselamarck.services.errors import ConflictError, NotFoundError


class ExerciseService:
    """
    ExerciseService(exercise_repository) -> ExerciseService

    Concise (one-line) description of the service.

    Methods
    -------
    create_exercise(question, answer, language, tags)
        Create a new exercise with deduplication.
    list_exercises(language, tags, limit, offset)
        List exercises with optional filters.
    get_exercise(exercise_id)
        Fetch a single exercise.
    """

    def __init__(self, exercise_repository: ExerciseRepository) -> None:
        """
        __init__(exercise_repository) -> None

        Concise (one-line) description of the initializer.

        Parameters
        ----------
        exercise_repository : ExerciseRepository
            Repository for exercise persistence.

        Returns
        -------
        None
            Initializes the service.
        """
        self._exercise_repository = exercise_repository

    def create_exercise(
        self,
        question: str,
        answer: str,
        language: str,
        tags: list[str] | None,
        classes: list[str] | None = None,
    ) -> dict:
        """
        create_exercise(question, answer, language, tags) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        question : str
            Exercise prompt.
        answer : str
            Expected answer.
        language : str
            ISO 639-1 language code.
        tags : Optional[List[str]]
            Labels for the exercise.

        Returns
        -------
        Dict
            Summary of the created exercise.

        Throws
        ------
        ConflictError
            If an exercise with the same content already exists.
        """
        normalized_tags = self._normalize_labels(tags)
        normalized_classes = self._normalize_labels(classes)
        if not normalized_classes:
            normalized_classes = self._infer_classes(question, answer, normalized_tags)
        content_hash = self._content_hash(question, answer)
        if self._exercise_repository.exists_by_hash(content_hash):
            raise ConflictError("Duplicate exercise")
        exercise_id = uuid.uuid4().hex
        created_at = datetime.utcnow()
        self._exercise_repository.add_exercise(
            question=question,
            answer=answer,
            language=language,
            tags=normalized_tags,
            classes=normalized_classes,
            content_hash=content_hash,
            exercise_id=exercise_id,
            created_at=created_at,
        )
        return {
            "exerciseId": exercise_id,
            "question": question,
            "language": language,
            "tags": normalized_tags,
            "classes": normalized_classes,
        }

    def list_exercises(
        self,
        language: str | None,
        tags: list[str] | None,
        classes: list[str] | None,
        limit: int,
        offset: int,
    ) -> list[dict]:
        """
        list_exercises(language, tags, limit, offset) -> List[Dict]

        Concise (one-line) description of the function.

        Parameters
        ----------
        language : Optional[str]
            Language filter.
        tags : Optional[List[str]]
            Tag filter list.
        limit : int
            Maximum rows returned.
        offset : int
            Result offset.

        Returns
        -------
        List[Dict]
            Exercise summaries.
        """
        return self._exercise_repository.list_exercises(
            language,
            self._normalize_labels(tags),
            self._normalize_labels(classes),
            limit,
            offset,
        )

    def get_exercise(self, exercise_id: str) -> dict:
        """
        get_exercise(exercise_id) -> Dict

        Concise (one-line) description of the function.

        Parameters
        ----------
        exercise_id : str
            Identifier of the exercise.

        Returns
        -------
        Dict
            Exercise details.

        Throws
        ------
        NotFoundError
            If the exercise does not exist.
        """
        row = self._exercise_repository.get_exercise(exercise_id)
        if not row:
            raise NotFoundError("Exercise not found")
        return row

    def build_exercise_graph(self, language: str | None = None) -> dict:
        """
        build_exercise_graph(language=None) -> Dict

        Build single-layer exercise graph with edges on shared tags/classes.
        """
        rows = self._exercise_repository.list_all_exercises(language=language)
        nodes = [
            {
                "id": row["exerciseId"],
                "label": row["question"],
                "language": row["language"],
                "tags": self._normalize_labels(row.get("tags")),
                "classes": self._normalize_labels(row.get("classes")),
            }
            for row in rows
        ]

        edges: list[dict] = []
        for left, right in combinations(nodes, 2):
            shared_tags = sorted(set(left["tags"]).intersection(right["tags"]))
            shared_classes = sorted(set(left["classes"]).intersection(right["classes"]))
            if not shared_tags and not shared_classes:
                continue
            edges.append(
                {
                    "source": left["id"],
                    "target": right["id"],
                    "sharedTags": shared_tags,
                    "sharedClasses": shared_classes,
                    "weight": len(shared_tags) + len(shared_classes),
                }
            )

        return {"nodes": nodes, "edges": edges}

    def semantic_search_exercises(
        self,
        query: str,
        language: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """
        semantic_search_exercises(query, language=None, limit=20) -> List[Dict]

        Lightweight semantic ranking using normalized token overlap.
        """
        query_tokens = set(self._tokenize(query))
        if not query_tokens:
            return []

        candidates = self._exercise_repository.list_all_exercises(language=language)
        ranked: list[tuple[float, dict]] = []
        for row in candidates:
            tags = self._normalize_labels(row.get("tags"))
            classes = self._normalize_labels(row.get("classes"))
            search_text = " ".join(
                [
                    row.get("question", ""),
                    row.get("answer", ""),
                    " ".join(tags),
                    " ".join(classes),
                ]
            )
            candidate_tokens = set(self._tokenize(search_text))
            if not candidate_tokens:
                continue
            overlap = len(query_tokens.intersection(candidate_tokens))
            union = len(query_tokens.union(candidate_tokens))
            score = overlap / union if union else 0.0
            if score <= 0:
                continue
            ranked.append(
                (
                    score,
                    {
                        "exerciseId": row["exerciseId"],
                        "question": row["question"],
                        "language": row["language"],
                        "tags": tags,
                        "classes": classes,
                        "score": round(score, 6),
                    },
                )
            )

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [item[1] for item in ranked[:max(limit, 1)]]

    def classify_unclassified_exercises(self, limit: int = 50) -> dict:
        """
        classify_unclassified_exercises(limit=50) -> Dict

        Infer class labels for exercises that do not have classes yet.
        """
        rows = self._exercise_repository.list_unclassified_exercises(limit=limit)
        updated = 0
        for row in rows:
            classes = self._infer_classes(
                question=row.get("question", ""),
                answer=row.get("answer", ""),
                tags=self._normalize_labels(row.get("tags")),
            )
            if not classes:
                continue
            if self._exercise_repository.update_exercise_classes(row["exerciseId"], classes):
                updated += 1
        return {"scanned": len(rows), "updated": updated}

    def _content_hash(self, question: str, answer: str) -> str:
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
        """
        canonical_q = " ".join(question.strip().split()).lower()
        canonical_a = " ".join(answer.strip().split()).lower()
        return hashlib.sha256((canonical_q + "\n" + canonical_a).encode("utf-8")).hexdigest()

    def _normalize_labels(self, values: list[str] | None) -> list[str]:
        if not values:
            return []
        normalized = {
            value.strip().lower()
            for value in values
            if isinstance(value, str) and value.strip()
        }
        return sorted(normalized)

    def _tokenize(self, value: str) -> list[str]:
        return re.findall(r"[a-z0-9]+", (value or "").lower())

    def _infer_classes(self, question: str, answer: str, tags: list[str]) -> list[str]:
        joined = " ".join([question, answer, " ".join(tags)]).lower()
        inferred: set[str] = set()

        keyword_map = {
            "vocabulary": ["vocab", "word", "translate"],
            "grammar": ["grammar", "tense", "article", "conjugat"],
            "phrase": ["phrase", "expression", "sentence"],
            "conversation": ["dialog", "conversation", "speak"],
        }
        for class_name, keywords in keyword_map.items():
            if any(keyword in joined for keyword in keywords):
                inferred.add(class_name)

        if not inferred and tags:
            inferred.update(tags)

        return sorted(inferred)
