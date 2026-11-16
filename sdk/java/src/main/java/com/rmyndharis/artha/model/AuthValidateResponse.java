package com.rmyndharis.artha.model;

/** Result of validating the configured API key. */
public record AuthValidateResponse(boolean valid, String role) {}
