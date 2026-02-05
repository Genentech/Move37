"""
Service-layer exceptions.

Defines domain errors raised by services so transport layers can map them
cleanly to HTTP status codes or MCP error responses.

Public API
----------
- :class:`ServiceError`: Base class for service errors.
- :class:`ConflictError`: Raised for duplicate or conflicting data.
- :class:`NotFoundError`: Raised when a resource is missing.
- :class:`NoContentError`: Raised when a request has no content to return.
- :class:`ValidationError`: Raised for invalid inputs at the service layer.

Attributes
----------
None

Examples
--------
>>> isinstance(ServiceError("msg"), Exception)
True

See Also
--------
:mod:`penroselamarck.api.routers.rest`
"""

from __future__ import annotations


class ServiceError(Exception):
    """
    ServiceError(message) -> ServiceError

    Concise (one-line) description of the exception.

    Parameters
    ----------
    message : str
        Error message describing the failure.

    Returns
    -------
    ServiceError
        The exception instance.
    """

    def __init__(self, message: str) -> None:
        """
        __init__(message) -> None

        Concise (one-line) description of the initializer.

        Parameters
        ----------
        message : str
            Error message describing the failure.

        Returns
        -------
        None
            Initializes the exception.
        """
        super().__init__(message)
        self.message = message


class ConflictError(ServiceError):
    """
    ConflictError(message) -> ConflictError

    Concise (one-line) description of the exception.

    Parameters
    ----------
    message : str
        Error message describing the conflict.

    Returns
    -------
    ConflictError
        The exception instance.
    """


class NotFoundError(ServiceError):
    """
    NotFoundError(message) -> NotFoundError

    Concise (one-line) description of the exception.

    Parameters
    ----------
    message : str
        Error message describing the missing resource.

    Returns
    -------
    NotFoundError
        The exception instance.
    """


class NoContentError(ServiceError):
    """
    NoContentError(message) -> NoContentError

    Concise (one-line) description of the exception.

    Parameters
    ----------
    message : str
        Error message describing the empty result.

    Returns
    -------
    NoContentError
        The exception instance.
    """


class ValidationError(ServiceError):
    """
    ValidationError(message) -> ValidationError

    Concise (one-line) description of the exception.

    Parameters
    ----------
    message : str
        Error message describing the invalid input.

    Returns
    -------
    ValidationError
        The exception instance.
    """
