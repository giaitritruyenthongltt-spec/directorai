"""Structured logging setup."""

from __future__ import annotations

import logging
import sys

import structlog

from directorai_context.config import get_settings


def setup_logging() -> structlog.BoundLogger:
    """Configure structlog for the application."""
    level = getattr(logging, get_settings().log_level.upper(), logging.INFO)

    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )

    return structlog.get_logger()


log = setup_logging()
