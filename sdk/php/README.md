# rmyndharis/artha

Official PHP SDK for the [Artha](https://github.com/rmyndharis/Artha) WhatsApp API Gateway.

A synchronous client built on [Guzzle](https://docs.guzzlephp.org/), PSR-4 autoloaded.

## Install

```bash
composer require rmyndharis/artha
```

Requires PHP 8.1+ and Guzzle 7. The namespace is `Artha\`.

## Usage

```php
<?php
require 'vendor/autoload.php';

use Artha\Client;

$client = new Client([
    'baseUrl' => 'https://your-gateway.example.com',
    'apiKey'  => 'owa_k1_…',
]);

$client->sessions->start('my-session');

$result = $client->messages->sendText('my-session', [
    'chatId' => '628123456789@c.us',
    'text'   => 'Hello from the Artha PHP SDK!',
]);
echo $result['messageId'];
```

For tests, inject a Guzzle client whose handler is a `MockHandler` — no network, no global state:

```php
$client = new Client([
    'baseUrl'    => 'http://x',
    'apiKey'     => 'k',
    'httpClient' => $mockGuzzleClient,
]);
```

## Messaging

> Voice notes: pass `'ptt' => true` to `sendAudio` to send a real WhatsApp voice note (PTT). Supply `audio/ogg; codecs=opus` audio for reliable playback; the server defaults the mimetype to that when `ptt` is set without one.

## Errors

A non-2xx response throws a typed `Artha\Exceptions\ArthaApiException` subclass —
`ArthaAuthException` (401), `ArthaForbiddenException` (403), `ArthaNotFoundException` (404),
`ArthaConflictException` (409), `ArthaRateLimitException` (429),
`ArthaNotImplementedException` (501) — each exposing `getStatus()` and the parsed `getBody()`.
A timeout throws `ArthaTimeoutException`.

```php
use Artha\Exceptions\ArthaNotFoundException;

try {
    $client->sessions->get('missing');
} catch (ArthaNotFoundException $e) {
    echo $e->getStatus();  // 404
}
```

## Notes

- **Use HTTPS in production** — the API key is sent as `X-API-Key` and is bearer-equivalent.
- The SDK does **not** retry, and **never follows redirects** (so the key is never re-sent to
  a redirect target). Path segments are percent-encoded; a base-URL path prefix (e.g. behind a
  reverse proxy) is preserved.
- Escape hatch for endpoints the SDK does not wrap:
  `$client->request($method, $path, $query, $body)`.

## License

MIT
