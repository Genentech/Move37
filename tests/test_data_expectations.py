"""
Great Expectations validation for seeded data.

Executes expectation suites against the seeded Postgres tables.

Public API
----------
- :func:`test_seeded_exercises`: Validate exercise data rules.
- :func:`test_seeded_sessions`: Validate session data rules.
- :func:`test_seeded_attempts`: Validate attempt data rules.
- :func:`test_seeded_performance_summaries`: Validate summary data rules.

Attributes
----------
DEFAULT_DATABASE_URL : str
    Fallback SQLAlchemy connection URL when `DATABASE_URL` is unset.

Examples
--------
>>> DEFAULT_DATABASE_URL.startswith("postgresql")
True

See Also
--------
:mod:`penroselamarck.db.bin.seed`
"""

from __future__ import annotations

import os

from great_expectations.core.batch import RuntimeBatchRequest
from great_expectations.core.expectation_suite import ExpectationSuite
from great_expectations.data_context import BaseDataContext
from great_expectations.data_context.types.base import (
    DataContextConfig,
    InMemoryStoreBackendDefaults,
)
from sqlalchemy import create_engine, text

DEFAULT_DATABASE_URL = (
    "postgresql+psycopg://penroselamarck:penroselamarck@localhost:5432/penroselamarck"
)


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
        SQLAlchemy connection URL derived from environment variables.

    Examples
    --------
    >>> isinstance(_db_url(), str)
    True
    """
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url
    user = os.getenv("POSTGRES_USER", "penroselamarck")
    password = os.getenv("POSTGRES_PASSWORD", "penroselamarck")
    db = os.getenv("POSTGRES_DB", "penroselamarck")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{db}"


def _context(db_url: str) -> BaseDataContext:
    """
    _context(db_url) -> BaseDataContext

    Concise (one-line) description of the function.

    Parameters
    ----------
    db_url : str
        SQLAlchemy database URL.

    Returns
    -------
    BaseDataContext
        In-memory Great Expectations context.

    Examples
    --------
    >>> isinstance(_context("sqlite://"), BaseDataContext)
    True
    """
    config = DataContextConfig(
        datasources={
            "default": {
                "class_name": "Datasource",
                "execution_engine": {
                    "class_name": "SqlAlchemyExecutionEngine",
                    "connection_string": db_url,
                },
                "data_connectors": {
                    "runtime_data_connector": {
                        "class_name": "RuntimeDataConnector",
                        "batch_identifiers": ["default_identifier_name"],
                    }
                },
            }
        },
        store_backend_defaults=InMemoryStoreBackendDefaults(),
        anonymous_usage_statistics={"enabled": False},
    )
    return BaseDataContext(project_config=config)


def _validator(context: BaseDataContext, table_name: str):
    """
    _validator(context, table_name) -> Validator

    Concise (one-line) description of the function.

    Parameters
    ----------
    context : BaseDataContext
        Great Expectations context.
    table_name : str
        Table to validate.

    Returns
    -------
    Validator
        Validator bound to the requested table.

    Examples
    --------
    >>> callable(_validator)
    True
    """
    suite_name = f"{table_name}_suite"
    try:
        context.get_expectation_suite(suite_name)
    except Exception:
        context.add_or_update_expectation_suite(ExpectationSuite(name=suite_name))
    batch_request = RuntimeBatchRequest(
        datasource_name="default",
        data_connector_name="runtime_data_connector",
        data_asset_name=table_name,
        runtime_parameters={"query": f"SELECT * FROM {table_name}"},
        batch_identifiers={"default_identifier_name": table_name},
    )
    return context.get_validator(batch_request=batch_request, expectation_suite_name=suite_name)


def _fetch_column_set(db_url: str, table: str, column: str) -> list[str]:
    """
    _fetch_column_set(db_url, table, column) -> List[str]

    Concise (one-line) description of the function.

    Parameters
    ----------
    db_url : str
        SQLAlchemy database URL.
    table : str
        Table name.
    column : str
        Column name.

    Returns
    -------
    List[str]
        Column values from the table.

    Examples
    --------
    >>> callable(_fetch_column_set)
    True
    """
    engine = create_engine(db_url, pool_pre_ping=True)
    stmt = text(f"SELECT {column} FROM {table}")
    with engine.connect() as conn:
        return [row[0] for row in conn.execute(stmt).fetchall()]


def _assert_success(result) -> None:
    """
    _assert_success(result) -> None

    Concise (one-line) description of the function.

    Parameters
    ----------
    result : Any
        Great Expectations validation result.

    Returns
    -------
    None
        Raises assertion error on failure.

    Examples
    --------
    >>> class Dummy: success = True
    >>> _assert_success(Dummy())
    """
    assert getattr(result, "success", False)


def test_seeded_exercises() -> None:
    """
    test_seeded_exercises() -> None

    Concise (one-line) description of the test.

    Parameters
    ----------
    None
        This test does not accept parameters.

    Returns
    -------
    None
        Validates exercise data rules.

    Examples
    --------
    >>> True
    True
    """
    db_url = _db_url()
    context = _context(db_url)
    validator = _validator(context, "exercises")

    validator.expect_table_row_count_to_be_between(min_value=1, max_value=1000)
    validator.expect_column_values_to_not_be_null("id")
    validator.expect_column_values_to_be_unique("content_hash")
    validator.expect_column_values_to_be_in_set("language", ["da", "sv"])

    result = validator.validate()
    _assert_success(result)


def test_seeded_sessions() -> None:
    """
    test_seeded_sessions() -> None

    Concise (one-line) description of the test.

    Parameters
    ----------
    None
        This test does not accept parameters.

    Returns
    -------
    None
        Validates practice session data rules.

    Examples
    --------
    >>> True
    True
    """
    db_url = _db_url()
    context = _context(db_url)
    validator = _validator(context, "practice_sessions")

    validator.expect_table_row_count_to_be_between(min_value=1, max_value=100)
    validator.expect_column_values_to_be_in_set("status", ["started", "ended"])
    validator.expect_column_values_to_be_between("target_count", min_value=1, max_value=100)

    result = validator.validate()
    _assert_success(result)


def test_seeded_attempts() -> None:
    """
    test_seeded_attempts() -> None

    Concise (one-line) description of the test.

    Parameters
    ----------
    None
        This test does not accept parameters.

    Returns
    -------
    None
        Validates attempt data rules.

    Examples
    --------
    >>> True
    True
    """
    db_url = _db_url()
    context = _context(db_url)
    validator = _validator(context, "attempts")

    exercise_ids = _fetch_column_set(db_url, "exercises", "id")
    session_ids = _fetch_column_set(db_url, "practice_sessions", "session_id")

    validator.expect_table_row_count_to_be_between(min_value=1, max_value=1000)
    validator.expect_column_values_to_be_between("score", min_value=0.0, max_value=1.0)
    validator.expect_column_values_to_be_in_set("exercise_id", exercise_ids)
    validator.expect_column_values_to_be_in_set("session_id", session_ids)

    result = validator.validate()
    _assert_success(result)


def test_seeded_performance_summaries() -> None:
    """
    test_seeded_performance_summaries() -> None

    Concise (one-line) description of the test.

    Parameters
    ----------
    None
        This test does not accept parameters.

    Returns
    -------
    None
        Validates performance summary data rules.

    Examples
    --------
    >>> True
    True
    """
    db_url = _db_url()
    context = _context(db_url)
    validator = _validator(context, "performance_summaries")

    exercise_ids = _fetch_column_set(db_url, "exercises", "id")

    validator.expect_table_row_count_to_be_between(min_value=1, max_value=1000)
    validator.expect_column_values_to_be_in_set("exercise_id", exercise_ids)
    validator.expect_column_values_to_be_between("total_attempts", min_value=0, max_value=1000)
    validator.expect_column_values_to_be_between("pass_rate", min_value=0.0, max_value=1.0)

    result = validator.validate()
    _assert_success(result)
