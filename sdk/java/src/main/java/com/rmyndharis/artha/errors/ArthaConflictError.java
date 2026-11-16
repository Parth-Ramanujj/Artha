package com.rmyndharis.artha.errors;

/** 409 Conflict — typically an engine-not-ready condition from the backend. */
public class ArthaConflictError extends ArthaApiError {
    public ArthaConflictError(String message, int status, Object body, String errorKind) {
        super(message, status, body, errorKind);
    }
}
