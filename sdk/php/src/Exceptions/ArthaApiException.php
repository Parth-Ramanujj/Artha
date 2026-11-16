<?php

declare(strict_types=1);

namespace Artha\Exceptions;

/**
 * Raised when the API responds with a non-2xx status.
 *
 * Carries the HTTP status code and the parsed error body. Use the named
 * subclass for common statuses, or branch on getStatus().
 */
class ArthaApiException extends ArthaException
{
    private int $status;
    /** @var mixed */
    private $body;
    private ?string $errorKind;

    /**
     * @param mixed $body
     */
    public function __construct(string $message, int $status, $body = null, ?string $errorKind = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->body = $body;
        $this->errorKind = $errorKind;
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    /** @return mixed */
    public function getBody()
    {
        return $this->body;
    }

    public function getErrorKind(): ?string
    {
        return $this->errorKind;
    }

    /**
     * Build the most specific ArthaApiException subclass for a status code.
     *
     * @param mixed $body
     */
    public static function classify(int $status, string $message, $body, ?string $errorKind): ArthaApiException
    {
        return match ($status) {
            401 => new ArthaAuthException($message, $status, $body, $errorKind),
            403 => new ArthaForbiddenException($message, $status, $body, $errorKind),
            404 => new ArthaNotFoundException($message, $status, $body, $errorKind),
            409 => new ArthaConflictException($message, $status, $body, $errorKind),
            429 => new ArthaRateLimitException($message, $status, $body, $errorKind),
            501 => new ArthaNotImplementedException($message, $status, $body, $errorKind),
            default => new ArthaApiException($message, $status, $body, $errorKind),
        };
    }
}
