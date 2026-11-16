package com.rmyndharis.artha.resources;

import static com.rmyndharis.artha.http.Http.encodeSegment;

import com.rmyndharis.artha.ArthaClient;
import com.rmyndharis.artha.http.HttpMethod;
import com.rmyndharis.artha.model.SetProfileNameRequest;
import com.rmyndharis.artha.model.SetProfilePictureRequest;
import com.rmyndharis.artha.model.SetProfileStatusRequest;
import com.rmyndharis.artha.model.SuccessResult;

/** Profile resource — the linked account's display name, status text and picture. */
public final class ProfileResource {
    private final ArthaClient client;

    public ProfileResource(ArthaClient client) {
        this.client = client;
    }

    /** Set the account display name. */
    public SuccessResult setProfileName(String sessionId, String name) {
        return client.request(
            HttpMethod.PUT,
            "/api/sessions/" + encodeSegment(sessionId) + "/profile/name",
            null,
            new SetProfileNameRequest(name),
            SuccessResult.class);
    }

    /** Set the account about/status text (an empty string clears it). */
    public SuccessResult setProfileStatus(String sessionId, String status) {
        return client.request(
            HttpMethod.PUT,
            "/api/sessions/" + encodeSegment(sessionId) + "/profile/status",
            null,
            new SetProfileStatusRequest(status),
            SuccessResult.class);
    }

    /** Set the account profile picture from a {@code url} or a {@code base64} + {@code mimetype} pair. */
    public SuccessResult setProfilePicture(String sessionId, SetProfilePictureRequest body) {
        return client.request(
            HttpMethod.PUT,
            "/api/sessions/" + encodeSegment(sessionId) + "/profile/picture",
            null,
            body,
            SuccessResult.class);
    }
}
