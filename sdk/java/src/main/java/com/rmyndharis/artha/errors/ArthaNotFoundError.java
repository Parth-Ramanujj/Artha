package com.rmyndharis.artha.errors;

/** 404 Not Found. */
public class ArthaNotFoundError extends ArthaApiError {
    public ArthaNotFoundError(String message, int status, Object body, String errorKind) {
        super(message, status, body, errorKind);
    }
}
