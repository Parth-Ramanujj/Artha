package com.rmyndharis.artha.model;

/** Readiness probe payload — checks both DB connections. {@code details} is {@code null} when absent. */
public record HealthReadyResponse(String status, HealthReadyDetails details) {}
