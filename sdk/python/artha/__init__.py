"""
Artha Python SDK.

Official client library for the Artha WhatsApp API Gateway.

Example usage::

    from artha import ArthaClient

    client = ArthaClient(
        base_url="http://localhost:2785",
        api_key="owa_k1_…",
    )

    client.sessions.start("my-session")
    result = client.messages.send_text("my-session", {
        "chatId": "628123456789@c.us",
        "text": "Hello from the Artha Python SDK!",
    })
    print(result["messageId"])
"""

from __future__ import annotations

from .client import ArthaClient
from .errors import (
    ArthaApiError,
    ArthaAuthError,
    ArthaConflictError,
    ArthaError,
    ArthaForbiddenError,
    ArthaNotFoundError,
    ArthaNotImplementedError,
    ArthaRateLimitError,
    ArthaTimeoutError,
)

__all__ = [
    "ArthaClient",
    "ArthaError",
    "ArthaApiError",
    "ArthaAuthError",
    "ArthaForbiddenError",
    "ArthaNotFoundError",
    "ArthaConflictError",
    "ArthaRateLimitError",
    "ArthaNotImplementedError",
    "ArthaTimeoutError",
]
