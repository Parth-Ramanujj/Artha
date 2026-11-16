package com.rmyndharis.artha.errors;

/** 501 Not Implemented — the active engine does not support this operation. */
public class ArthaNotImplementedError extends ArthaApiError {
    public ArthaNotImplementedError(String message, int status, Object body, String errorKind) {
        super(message, status, body, errorKind);
    }
}
