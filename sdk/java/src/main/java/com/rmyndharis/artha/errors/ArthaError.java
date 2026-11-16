package com.rmyndharis.artha.errors;

/** Base class for every error thrown by the SDK. */
public class ArthaError extends RuntimeException {
    public ArthaError(String message) {
        super(message);
    }
}
