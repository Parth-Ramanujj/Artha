# rmyndharis-artha

Official Python SDK for the [Artha](https://github.com/rmyndharis/Artha) WhatsApp API Gateway.

A synchronous client built on [httpx](https://www.python-httpx.org/), with bundled type hints (PEP 561).

## Install

```bash
pip install rmyndharis-artha
```

Requires Python 3.9+. The importable module is `artha`.

## Usage

```python
from artha import ArthaClient

client = ArthaClient(
    base_url="https://your-gateway.example.com",
    api_key="owa_k1_…",
)

client.sessions.start("my-session")

result = client.messages.send_text("my-session", {
    "chatId": "628123456789@c.us",
    "text": "Hello from the Artha Python SDK!",
})
print(result["messageId"])
```

The client is also a context manager (it closes the underlying connection pool on exit):

```python
with ArthaClient(base_url="…", api_key="…") as client:
    client.messages.send_text("my-session", {"chatId": "…@c.us", "text": "hi"})
```

For tests, pass an httpx transport — no global monkey-patching required:

```python
import httpx
client = ArthaClient(base_url="…", api_key="…", transport=httpx.MockTransport(handler))
```

## Search

`GET /search` is wrapped as `client.search.search(params)`. Only `q` is required;
the rest (`sessionId`, `chatId`, `direction`, `type`, `from`, `dateFrom`,
`dateTo`, `limit`, `offset`) are optional. `dateFrom` / `dateTo` are epoch-ms.
The active search provider (built-in DB full-text, or a plugin) answers; if none
is configured the server returns 501.

```python
res = client.search.search({"q": "invoice", "sessionId": "my-session", "limit": 20})
for hit in res["hits"]:
    print(hit["snippet"], hit["score"])
```

## Messaging

> Voice notes: pass `ptt=True` inside the body dict to `send_audio` to send a real WhatsApp voice note (PTT). Supply `audio/ogg; codecs=opus` audio for reliable playback; the server defaults the mimetype to that when `ptt` is set without one.

## Errors

A non-2xx response raises a typed `ArthaApiError` subclass — `ArthaAuthError` (401),
`ArthaForbiddenError` (403), `ArthaNotFoundError` (404), `ArthaConflictError` (409),
`ArthaRateLimitError` (429), `ArthaNotImplementedError` (501) — each carrying `.status`
and the parsed `.body`. A timeout raises `ArthaTimeoutError`.

```python
from artha import ArthaNotFoundError

try:
    client.sessions.get("missing")
except ArthaNotFoundError as e:
    print(e.status)  # 404
```

## Notes

- **Use HTTPS in production** — the API key is sent as `X-API-Key` and is bearer-equivalent.
- The SDK does **not** retry, and **never follows redirects** (so the key is never re-sent to
  a redirect target). Path segments are percent-encoded; a base-URL path prefix (e.g. behind a
  reverse proxy) is preserved.
- Escape hatch for endpoints the SDK does not wrap:
  `client.request(method, path, query=…, body=…)`.

## License

MIT
