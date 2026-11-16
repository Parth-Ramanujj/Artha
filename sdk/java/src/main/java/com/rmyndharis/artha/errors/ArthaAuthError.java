package com.rmyndharis.artha.errors;

/** 401 Unauthorized — missing or invalid API key. */
public class ArthaAuthError extends ArthaApiError {
    public ArthaAuthError(String message, int status, Object body, String errorKind) {
        super(message, status, body, errorKind);
    }
}
