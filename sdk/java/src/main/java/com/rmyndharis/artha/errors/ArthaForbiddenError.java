package com.rmyndharis.artha.errors;

/** 403 Forbidden — the API key's role is insufficient for this endpoint. */
public class ArthaForbiddenError extends ArthaApiError {
    public ArthaForbiddenError(String message, int status, Object body, String errorKind) {
        super(message, status, body, errorKind);
    }
}
