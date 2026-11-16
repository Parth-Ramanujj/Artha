package com.rmyndharis.artha.resources;

import static com.rmyndharis.artha.http.Http.encodeSegment;

import com.rmyndharis.artha.ArthaClient;
import com.rmyndharis.artha.http.HttpMethod;
import com.rmyndharis.artha.model.ChannelMessageQuery;
import com.rmyndharis.artha.model.ChannelMessageRecord;
import com.rmyndharis.artha.model.ChannelRecord;
import com.rmyndharis.artha.model.SubscribeChannelRequest;
import com.rmyndharis.artha.model.SuccessResult;
import java.util.List;

/**
 * Channels resource — WhatsApp Channels / Newsletters.
 *
 * <p>Backed by {@code sessions/:sessionId/channels}.
 */
public final class ChannelsResource {
    private final ArthaClient client;

    public ChannelsResource(ArthaClient client) {
        this.client = client;
    }

    /** List all channels/newsletters the session is subscribed to. */
    public List<ChannelRecord> list(String sessionId) {
        return client.requestList(
            HttpMethod.GET, "/api/sessions/" + encodeSegment(sessionId) + "/channels", null, null, ChannelRecord.class);
    }

    /** Get a single channel by id. */
    public ChannelRecord get(String sessionId, String channelId) {
        return client.request(
            HttpMethod.GET,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId),
            null,
            null,
            ChannelRecord.class);
    }

    /** Get recent messages from a channel. */
    public List<ChannelMessageRecord> messages(String sessionId, String channelId, ChannelMessageQuery query) {
        return client.requestList(
            HttpMethod.GET,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId) + "/messages",
            query,
            null,
            ChannelMessageRecord.class);
    }

    /** Subscribe to a channel using its invite code. Requires an OPERATOR-level key. */
    public ChannelRecord subscribe(String sessionId, SubscribeChannelRequest body) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/subscribe",
            null,
            body,
            ChannelRecord.class);
    }

    /** Unsubscribe from a channel. Requires an OPERATOR-level key. */
    public SuccessResult unsubscribe(String sessionId, String channelId) {
        return client.request(
            HttpMethod.DELETE,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId),
            null,
            null,
            SuccessResult.class);
    }
}
