package com.rmyndharis.artha.errors;

/** 429 Too Many Requests — rate limited. */
public class ArthaRateLimitError extends ArthaApiError {
    public ArthaRateLimitError(String message, int status, Object body, String errorKind) {
        super(message, status, body, errorKind);
    }
}
