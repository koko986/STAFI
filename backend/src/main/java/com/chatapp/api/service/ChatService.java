package com.chatapp.api.service;

import com.chatapp.api.model.Conversation;
import com.chatapp.api.model.Message;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ChatService {
    private final SupabaseDatabase database;
    private final StorageService storageService;
    private final ProfileService profileService;

    public ChatService(
            SupabaseDatabase database,
            StorageService storageService,
            ProfileService profileService
    ) {
        this.database = database;
        this.storageService = storageService;
        this.profileService = profileService;
    }

    public List<Conversation> listConversations(UUID userId) {
        database.rpc("ensure_ai_conversation", Map.of("requester_id", userId));
        JsonNode rows = database.rpc("list_user_conversations", Map.of("requester_id", userId));
        List<Conversation> conversations = new ArrayList<>();
        if (rows != null && rows.isArray()) {
            rows.forEach(row -> conversations.add(toConversation(row, userId)));
        }
        return conversations;
    }

    public Conversation createConversation(Conversation request, UUID userId) {
        if (!"ai_private".equals(request.type())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Use the direct or group conversation endpoint."
            );
        }
        return toConversation(database.first(database.rpc(
                "ensure_ai_conversation",
                Map.of("requester_id", userId)
        )), userId);
    }

    public Conversation startDirectConversation(UUID userId, UUID profileId) {
        Conversation stored = toConversation(database.first(database.rpc(
                "start_direct_conversation",
                Map.of(
                        "requester_id", userId,
                        "other_user_id", profileId
                )
        )), userId);
        return listConversations(userId).stream()
                .filter(conversation -> conversation.id().equals(stored.id()))
                .findFirst()
                .orElse(stored);
    }

    public Conversation createGroup(UUID userId, String title, List<UUID> memberIds) {
        return toConversation(database.first(database.rpc(
                "create_group_conversation",
                Map.of(
                        "requester_id", userId,
                        "group_title", title.trim(),
                        "member_ids", memberIds
                )
        )), userId);
    }

    public List<Message> listMessages(UUID conversationId, UUID userId) {
        requireMembership(conversationId, userId);
        JsonNode rows = database.query(
                "messages",
                Map.of(
                        "conversation_id", "eq." + conversationId,
                        "deleted_at", "is.null",
                        "select", "*",
                        "order", "created_at.asc"
                )
        );
        List<Message> messages = new ArrayList<>();
        if (rows != null && rows.isArray()) rows.forEach(row -> messages.add(toMessage(row)));
        if (!messages.isEmpty()) {
            database.update(
                    "conversation_members",
                    Map.of(
                            "conversation_id", "eq." + conversationId,
                            "user_id", "eq." + userId
                    ),
                    Map.of("last_read_message_id", messages.get(messages.size() - 1).id())
            );
        }
        return messages;
    }

    public Message addMessage(Message request, UUID userId) {
        requireMembership(request.conversationId(), userId);
        String type = request.type().trim().toLowerCase();
        if (!List.of("text", "voice").contains(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported message type.");
        }

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", request.id() == null ? UUID.randomUUID() : request.id());
        row.put("conversation_id", request.conversationId());
        row.put("sender_id", userId);
        row.put("type", type);
        row.put("body", request.body());
        row.put("media_path", request.mediaPath());
        return toMessage(database.first(database.insert("messages", row)));
    }

    public void requireMembership(UUID conversationId, UUID userId) {
        JsonNode membership = database.first(database.query(
                "conversation_members",
                Map.of(
                        "conversation_id", "eq." + conversationId,
                        "user_id", "eq." + userId,
                        "select", "conversation_id",
                        "limit", "1"
                )
        ));
        if (membership == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a member of this conversation.");
        }
    }

    private Conversation toConversation(JsonNode row, UUID viewerId) {
        if (row == null) throw new IllegalStateException("Supabase did not return a conversation.");
        UUID conversationId = UUID.fromString(row.path("id").asText());
        String type = row.path("type").asText();
        return new Conversation(
                conversationId,
                type,
                row.path("title").asText("Untitled chat"),
                UUID.fromString(row.path("created_by").asText()),
                "direct".equals(type) ? directProfile(conversationId, viewerId) : null,
                Instant.parse(row.path("created_at").asText())
        );
    }

    private com.chatapp.api.model.Profile directProfile(UUID conversationId, UUID viewerId) {
        JsonNode row = database.first(database.query(
                "conversation_members",
                Map.of(
                        "conversation_id", "eq." + conversationId,
                        "user_id", "neq." + viewerId,
                        "select", "user_id",
                        "limit", "1"
                )
        ));
        if (row == null) return null;
        return profileService.find(UUID.fromString(row.path("user_id").asText())).orElse(null);
    }

    private Message toMessage(JsonNode row) {
        return new Message(
                UUID.fromString(row.path("id").asText()),
                UUID.fromString(row.path("conversation_id").asText()),
                uuidOrNull(row, "sender_id"),
                row.path("type").asText(),
                textOrNull(row, "body"),
                resolveMessageMedia(row),
                Instant.parse(row.path("created_at").asText())
        );
    }

    private String resolveMessageMedia(JsonNode row) {
        String path = textOrNull(row, "media_path");
        return "voice".equals(row.path("type").asText())
                ? storageService.resolveUrl("voice-messages", path)
                : path;
    }

    private UUID uuidOrNull(JsonNode row, String field) {
        String value = textOrNull(row, field);
        return value == null || value.isBlank() ? null : UUID.fromString(value);
    }

    private String textOrNull(JsonNode row, String field) {
        JsonNode value = row.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
