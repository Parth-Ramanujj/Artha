package com.rmyndharis.artha.resources;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.rmyndharis.artha.ClientConfig;
import com.rmyndharis.artha.ArthaClient;
import com.rmyndharis.artha.http.HttpMethod;
import com.rmyndharis.artha.model.HealthReadyResponse;
import com.rmyndharis.artha.model.HealthResponse;
import com.rmyndharis.artha.support.MockTransport;
import org.junit.jupiter.api.Test;

class HealthResourceTest {
    final MockTransport tx = new MockTransport();
    final ArthaClient client = new ArthaClient(
        ClientConfig.builder().baseUrl("http://h").apiKey("k").transport(tx).build());

    @Test
    void checkHitsHealthRoot() {
        tx.respond(200, "{\"status\":\"ok\",\"version\":\"1.2.3\"}");
        HealthResponse res = client.health.check();
        assertEquals("http://h/api/health", tx.lastRequest().url());
        assertEquals(HttpMethod.GET, tx.lastRequest().method());
        assertEquals("1.2.3", res.version());
    }

    @Test
    void liveHitsLivePath() {
        tx.respond(200, "{\"status\":\"ok\"}");
        client.health.live();
        assertEquals("http://h/api/health/live", tx.lastRequest().url());
        assertEquals(HttpMethod.GET, tx.lastRequest().method());
    }

    @Test
    void readyHitsReadyPath() {
        tx.respond(200, "{\"status\":\"ok\",\"details\":{\"mainDatabase\":\"up\",\"dataDatabase\":\"up\"}}");
        HealthReadyResponse res = client.health.ready();
        assertEquals("http://h/api/health/ready", tx.lastRequest().url());
        assertEquals(HttpMethod.GET, tx.lastRequest().method());
        assertEquals("up", res.details().mainDatabase());
    }
}
