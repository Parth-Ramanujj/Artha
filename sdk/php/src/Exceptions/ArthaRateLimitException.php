<?php

declare(strict_types=1);

namespace Artha\Exceptions;

/** 429 Too Many Requests — rate limited. */
class ArthaRateLimitException extends ArthaApiException
{
}
