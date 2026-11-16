package com.rmyndharis.artha.resources;

import static com.rmyndharis.artha.http.Http.encodeSegment;

import com.rmyndharis.artha.ArthaClient;
import com.rmyndharis.artha.http.HttpMethod;
import com.rmyndharis.artha.model.ChatSummary;
import com.rmyndharis.artha.model.DeleteChatRequest;
import com.rmyndharis.artha.model.ListChatsQuery;
import com.rmyndharis.artha.model.MarkChatRequest;
import com.rmyndharis.artha.model.SendChatStateRequest;
import com.rmyndharis.artha.model.SuccessResult;
import java.util.List;

/**
 * Chats resource — chat-list operations (read/unread/delete/typing state).
 *
 * <p>NOTE: these endpoints live under the session controller
 * ({@code /api/sessions/:id/chats/*}), but are surfaced here as a dedicated
 * resource for clarity.
 */
public final class ChatsResource {
    private final ArthaClient client;

    public ChatsResource(ArthaClient client) {
        this.client = client;
    }

    /** List active chats, most recent first. */
    public List<ChatSummary> list(String sessionId) {
        return list(sessionId, null);
    }

    /** List active chats, most recent first. */
    public List<ChatSummary> list(String sessionId, ListChatsQuery query) {
        return client.requestList(
            HttpMethod.GET, "/api/sessions/" + encodeSegment(sessionId) + "/chats", query, null, ChatSummary.class);
    }

    /** Mark a chat as read/seen. */
    public SuccessResult markRead(String sessionId, MarkChatRequest body) {
        return client.request(
            HttpMethod.POST, "/api/sessions/" + encodeSegment(sessionId) + "/chats/read", null, body, SuccessResult.class);
    }

    /** Mark a chat as unread. */
    public SuccessResult markUnread(String sessionId, MarkChatRequest body) {
        return client.request(
            HttpMethod.POST, "/api/sessions/" + encodeSegment(sessionId) + "/chats/unread", null, body, SuccessResult.class);
    }

    /** Delete a chat from the chat list. */
    public SuccessResult delete(String sessionId, DeleteChatRequest body) {
        return client.request(
            HttpMethod.POST, "/api/sessions/" + encodeSegment(sessionId) + "/chats/delete", null, body, SuccessResult.class);
    }

    /** Send a chat presence state (typing/recording/paused). */
    public SuccessResult sendState(String sessionId, SendChatStateRequest body) {
        return client.request(
            HttpMethod.POST, "/api/sessions/" + encodeSegment(sessionId) + "/chats/typing", null, body, SuccessResult.class);
    }
}
