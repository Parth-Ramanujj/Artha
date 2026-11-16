package com.rmyndharis.artha.resources;

import static com.rmyndharis.artha.http.Http.encodeSegment;

import com.rmyndharis.artha.ArthaClient;
import com.rmyndharis.artha.http.BinaryResponse;
import com.rmyndharis.artha.http.HttpMethod;
import com.rmyndharis.artha.model.SendImageStatusRequest;
import com.rmyndharis.artha.model.SendTextStatusRequest;
import com.rmyndharis.artha.model.SendVideoStatusRequest;
import com.rmyndharis.artha.model.StatusListResult;
import com.rmyndharis.artha.model.StatusResult;

/**
 * Status (Stories) resource — WhatsApp status updates.
 *
 * <p>NOTE: this is WhatsApp "Status/Stories", distinct from session lifecycle status.
 */
public final class StatusResource {
    private final ArthaClient client;

    public StatusResource(ArthaClient client) {
        this.client = client;
    }

    /** Get all status updates. */
    public StatusListResult list(String sessionId) {
        return client.request(
            HttpMethod.GET,
            "/api/sessions/" + encodeSegment(sessionId) + "/status",
            null,
            null,
            StatusListResult.class);
    }

    /** Get status updates from a specific contact. */
    public StatusListResult fromContact(String sessionId, String contactId) {
        return client.request(
            HttpMethod.GET,
            "/api/sessions/" + encodeSegment(sessionId) + "/status/" + encodeSegment(contactId),
            null,
            null,
            StatusListResult.class);
    }

    /** Fetch the stored media bytes for a status update (404 when there is no stored media). */
    public BinaryResponse media(String sessionId, String statusId) {
        return client.requestBytes(
            HttpMethod.GET,
            "/api/sessions/" + encodeSegment(sessionId) + "/status/" + encodeSegment(statusId) + "/media",
            null);
    }

    /** Post a text status update. */
    public StatusResult sendText(String sessionId, SendTextStatusRequest body) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/status/send-text",
            null,
            body,
            StatusResult.class);
    }

    /** Post an image status update. */
    public StatusResult sendImage(String sessionId, SendImageStatusRequest body) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/status/send-image",
            null,
            body,
            StatusResult.class);
    }

    /** Post a video status update. */
    public StatusResult sendVideo(String sessionId, SendVideoStatusRequest body) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/status/send-video",
            null,
            body,
            StatusResult.class);
    }

    /** Delete a status update by id. */
    public void delete(String sessionId, String statusId) {
        client.requestVoid(
            HttpMethod.DELETE,
            "/api/sessions/" + encodeSegment(sessionId) + "/status/" + encodeSegment(statusId),
            null,
            null);
    }
}
