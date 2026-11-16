package com.rmyndharis.artha.errors;

/** Thrown when a request exceeds the configured timeout. */
public class ArthaTimeoutError extends ArthaError {
    public ArthaTimeoutError(long timeoutMs) {
        super("Request timed out after " + timeoutMs + "ms");
    }
}
