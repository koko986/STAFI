package com.chatapp.api.service;

import com.chatapp.api.model.Conversation;
import com.chatapp.api.model.Message;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

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
        if (rows != null && rows.isArray()) {
            rows.forEach(row -> messages.add(toMessage(row)));
        }
        Set<UUID> hiddenMessageIds = hiddenMessageIds(userId);
        List<Message> visibleMessages = messages.stream()
                .filter(message -> !hiddenMessageIds.contains(message.id()))
                .toList();
        if (visibleMessages.isEmpty()) return List.of();
        if (!visibleMessages.isEmpty()) {
            database.update(
                    "conversation_members",
                    Map.of(
                            "conversation_id", "eq." + conversationId,
                            "user_id", "eq." + userId
                    ),
                    Map.of("last_read_message_id", visibleMessages.get(visibleMessages.size() - 1).id())
            );
        }
        return hydrateMessages(visibleMessages, userId);
    }

    public Message addMessage(Message request, UUID userId) {
        requireMembership(request.conversationId(), userId);
        String type = request.type().trim().toLowerCase();
        if (!List.of("text", "voice", "photo", "video", "file").contains(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported message type.");
        }
        if (request.replyToMessageId() != null) {
            requireMessageInConversation(request.replyToMessageId(), request.conversationId());
        }

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", request.id() == null ? UUID.randomUUID() : request.id());
        row.put("conversation_id", request.conversationId());
        row.put("sender_id", userId);
        row.put("type", type);
        row.put("body", request.body());
        row.put("media_path", request.mediaPath());
        if (request.replyToMessageId() != null) {
            row.put("reply_to_message_id", request.replyToMessageId());
        }
        Message stored = toMessage(database.first(insertMessage(row)));
        if (stored.replyToMessageId() == null && request.replyToMessageId() != null) {
            stored = withMessageContext(stored, request.replyToMessageId(), null);
        }
        return prepareNewMessage(stored);
    }

    public boolean isAiConversation(UUID conversationId) {
        JsonNode row = database.first(database.query(
                "conversations",
                Map.of(
                        "id", "eq." + conversationId,
                        "select", "type",
                        "limit", "1"
                )
        ));
        return row != null && "ai_private".equals(row.path("type").asText());
    }

    public Message addAssistantMessage(UUID conversationId, String body) {
        if (!isAiConversation(conversationId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "AI messages can be saved only in AI chats.");
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("conversation_id", conversationId);
        row.put("type", "ai");
        row.put("body", body);
        return prepareNewMessage(toMessage(database.first(insertMessage(row))));
    }

    public Message deleteMessage(UUID messageId, UUID userId) {
        JsonNode row = findMessageRow(messageId);
        if (row == null || !row.path("deleted_at").isNull()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found.");
        }
        UUID conversationId = UUID.fromString(row.path("conversation_id").asText());
        requireMembership(conversationId, userId);
        UUID senderId = uuidOrNull(row, "sender_id");
        if (!userId.equals(senderId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can delete only messages you sent.");
        }
        JsonNode updated = database.first(database.update(
                "messages",
                Map.of("id", "eq." + messageId),
                Map.of("deleted_at", Instant.now().toString())
        ));
        return toMessage(updated);
    }

    public Message hideMessageForUser(UUID messageId, UUID userId) {
        JsonNode row = findMessageRow(messageId);
        if (row == null || !row.path("deleted_at").isNull()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found.");
        }
        UUID conversationId = UUID.fromString(row.path("conversation_id").asText());
        requireMembership(conversationId, userId);
        JsonNode existing = database.first(database.query(
                "message_deletions",
                Map.of(
                        "message_id", "eq." + messageId,
                        "user_id", "eq." + userId,
                        "select", "message_id",
                        "limit", "1"
                )
        ));
        if (existing == null) {
            database.insert("message_deletions", Map.of("message_id", messageId, "user_id", userId));
        }
        return toMessage(row);
    }

    public Message forwardMessage(UUID messageId, UUID targetConversationId, UUID userId) {
        JsonNode source = findMessageRow(messageId);
        if (source == null || !source.path("deleted_at").isNull()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found.");
        }
        requireMembership(UUID.fromString(source.path("conversation_id").asText()), userId);
        requireMembership(targetConversationId, userId);

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("conversation_id", targetConversationId);
        row.put("sender_id", userId);
        row.put("type", source.path("type").asText());
        row.put("body", textOrNull(source, "body"));
        row.put("media_path", textOrNull(source, "media_path"));
        row.put("forwarded_from_message_id", messageId);
        Message stored = toMessage(database.first(insertMessage(row)));
        if (stored.forwardedFromMessageId() == null) {
            stored = withMessageContext(stored, null, messageId);
        }
        return prepareNewMessage(stored);
    }

    public Message reactToMessage(UUID messageId, UUID userId, String emoji) {
        JsonNode message = findMessageRow(messageId);
        if (message == null || !message.path("deleted_at").isNull()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found.");
        }
        UUID conversationId = UUID.fromString(message.path("conversation_id").asText());
        requireMembership(conversationId, userId);
        String normalizedEmoji = normalizeReaction(emoji);
        JsonNode existing = database.first(database.query(
                "message_reactions",
                Map.of(
                        "message_id", "eq." + messageId,
                        "user_id", "eq." + userId,
                        "select", "message_id",
                        "limit", "1"
                )
        ));
        if (existing == null) {
            database.insert("message_reactions", Map.of(
                    "message_id", messageId,
                    "user_id", userId,
                    "emoji", normalizedEmoji
            ));
        } else {
            database.update(
                    "message_reactions",
                    Map.of(
                            "message_id", "eq." + messageId,
                            "user_id", "eq." + userId
                    ),
                    Map.of("emoji", normalizedEmoji)
            );
        }
        return withReactionSummary(toMessage(message), userId);
    }

    public Message removeMessageReaction(UUID messageId, UUID userId) {
        JsonNode message = findMessageRow(messageId);
        if (message == null || !message.path("deleted_at").isNull()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Message not found.");
        }
        requireMembership(UUID.fromString(message.path("conversation_id").asText()), userId);
        database.delete(
                "message_reactions",
                Map.of(
                        "message_id", "eq." + messageId,
                        "user_id", "eq." + userId
                )
        );
        return withReactionSummary(toMessage(message), userId);
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
                uuidOrNull(row, "reply_to_message_id"),
                null,
                uuidOrNull(row, "forwarded_from_message_id"),
                !row.path("forwarded_from_message_id").isMissingNode() && !row.path("forwarded_from_message_id").isNull(),
                Map.of(),
                null,
                null,
                Instant.parse(row.path("created_at").asText()),
                instantOrNull(row, "deleted_at")
        );
    }

    private List<Message> hydrateMessages(List<Message> messages, UUID viewerId) {
        Map<UUID, Integer> positions = new HashMap<>();
        for (int index = 0; index < messages.size(); index++) {
            positions.put(messages.get(index).id(), index);
        }

        Map<UUID, Map<String, Integer>> reactionCounts = new HashMap<>();
        Map<UUID, String> ownReactions = new HashMap<>();
        String messageIds = messages.stream()
                .map(message -> message.id().toString())
                .collect(Collectors.joining(","));
        JsonNode reactionRows = null;
        try {
            reactionRows = database.query(
                    "message_reactions",
                    Map.of(
                            "message_id", "in.(" + messageIds + ")",
                            "select", "message_id,emoji,user_id"
                    )
            );
        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode() != HttpStatus.NOT_FOUND) throw exception;
        }
        if (reactionRows != null && reactionRows.isArray()) {
            for (JsonNode row : reactionRows) {
                UUID messageId = uuidOrNull(row, "message_id");
                if (messageId == null) continue;
                String emoji = row.path("emoji").asText();
                reactionCounts.computeIfAbsent(messageId, ignored -> new LinkedHashMap<>())
                        .merge(emoji, 1, Integer::sum);
                if (viewerId.equals(uuidOrNull(row, "user_id"))) {
                    ownReactions.put(messageId, emoji);
                }
            }
        }

        JsonNode memberRows = database.query(
                "conversation_members",
                Map.of(
                        "conversation_id", "eq." + messages.get(0).conversationId(),
                        "select", "user_id,last_read_message_id"
                )
        );
        List<Message> hydrated = new ArrayList<>();
        for (int index = 0; index < messages.size(); index++) {
            Message message = messages.get(index);
            hydrated.add(new Message(
                    message.id(),
                    message.conversationId(),
                    message.senderId(),
                    message.type(),
                    message.body(),
                    message.mediaPath(),
                    message.replyToMessageId(),
                    replyPreview(message.replyToMessageId(), messages),
                    message.forwardedFromMessageId(),
                    message.forwarded(),
                    reactionCounts.getOrDefault(message.id(), Map.of()),
                    ownReactions.get(message.id()),
                    statusFor(message, viewerId, positions, index, memberRows),
                    message.createdAt(),
                    message.deletedAt()
            ));
        }
        return hydrated;
    }

    private Message prepareNewMessage(Message message) {
        return new Message(
                message.id(),
                message.conversationId(),
                message.senderId(),
                message.type(),
                message.body(),
                message.mediaPath(),
                message.replyToMessageId(),
                replyPreview(message.replyToMessageId(), List.of()),
                message.forwardedFromMessageId(),
                message.forwarded(),
                Map.of(),
                null,
                "delivered",
                message.createdAt(),
                message.deletedAt()
        );
    }

    private JsonNode insertMessage(Map<String, Object> row) {
        try {
            return database.insert("messages", row);
        } catch (ResponseStatusException exception) {
            String reason = exception.getReason() == null ? "" : exception.getReason();
            boolean missingActionColumn = exception.getStatusCode() == HttpStatus.BAD_REQUEST
                    && (reason.contains("reply_to_message_id") || reason.contains("forwarded_from_message_id"));
            if (!missingActionColumn) throw exception;
            row.remove("reply_to_message_id");
            row.remove("forwarded_from_message_id");
            return database.insert("messages", row);
        }
    }

    private Message withMessageContext(Message message, UUID replyToMessageId, UUID forwardedFromMessageId) {
        return new Message(
                message.id(),
                message.conversationId(),
                message.senderId(),
                message.type(),
                message.body(),
                message.mediaPath(),
                replyToMessageId,
                message.replyPreview(),
                forwardedFromMessageId,
                forwardedFromMessageId != null,
                message.reactions(),
                message.ownReaction(),
                message.status(),
                message.createdAt(),
                message.deletedAt()
        );
    }

    private Message withReactionSummary(Message message, UUID viewerId) {
        ReactionSummary reactions = reactionSummary(message.id(), viewerId);
        return new Message(
                message.id(),
                message.conversationId(),
                message.senderId(),
                message.type(),
                message.body(),
                message.mediaPath(),
                message.replyToMessageId(),
                replyPreview(message.replyToMessageId(), List.of()),
                message.forwardedFromMessageId(),
                message.forwarded(),
                reactions.counts(),
                reactions.ownReaction(),
                null,
                message.createdAt(),
                message.deletedAt()
        );
    }

    private String replyPreview(UUID replyToMessageId, List<Message> conversationMessages) {
        if (replyToMessageId == null) return null;
        return conversationMessages.stream()
                .filter(message -> replyToMessageId.equals(message.id()))
                .findFirst()
                .map(this::previewText)
                .orElseGet(() -> {
                    JsonNode row = findMessageRow(replyToMessageId);
                    return row == null ? "Message" : previewText(toMessage(row));
                });
    }

    private String previewText(Message message) {
        String text = "voice".equals(message.type()) ? "Voice message" : message.body();
        if (text == null || text.isBlank()) return "Message";
        return text.length() > 90 ? text.substring(0, 87) + "..." : text;
    }

    private String statusFor(
            Message message,
            UUID viewerId,
            Map<UUID, Integer> positions,
            int messageIndex,
            JsonNode members
    ) {
        if (message.deletedAt() != null || message.senderId() == null || !message.senderId().equals(viewerId)) {
            return null;
        }
        int otherMembers = 0;
        int seenMembers = 0;
        if (members != null && members.isArray()) {
            for (JsonNode member : members) {
                UUID memberId = uuidOrNull(member, "user_id");
                if (viewerId.equals(memberId)) continue;
                otherMembers++;
                UUID lastReadId = uuidOrNull(member, "last_read_message_id");
                Integer readPosition = lastReadId == null ? null : positions.get(lastReadId);
                if (readPosition != null && readPosition >= messageIndex) {
                    seenMembers++;
                }
            }
        }
        if (otherMembers == 0) return "sent";
        return seenMembers == otherMembers ? "seen" : "delivered";
    }

    private ReactionSummary reactionSummary(UUID messageId, UUID viewerId) {
        JsonNode rows = database.query(
                "message_reactions",
                Map.of(
                        "message_id", "eq." + messageId,
                        "select", "emoji,user_id"
                )
        );
        Map<String, Integer> counts = new LinkedHashMap<>();
        String ownReaction = null;
        if (rows != null && rows.isArray()) {
            for (JsonNode row : rows) {
                String emoji = row.path("emoji").asText();
                counts.put(emoji, counts.getOrDefault(emoji, 0) + 1);
                UUID userId = uuidOrNull(row, "user_id");
                if (viewerId.equals(userId)) {
                    ownReaction = emoji;
                }
            }
        }
        return new ReactionSummary(counts, ownReaction);
    }

    private Set<UUID> hiddenMessageIds(UUID viewerId) {
        JsonNode rows = database.query(
                "message_deletions",
                Map.of("user_id", "eq." + viewerId, "select", "message_id")
        );
        if (rows == null || !rows.isArray()) return Set.of();
        return StreamSupport.stream(rows.spliterator(), false)
                .map(row -> uuidOrNull(row, "message_id"))
                .filter(id -> id != null)
                .collect(Collectors.toSet());
    }

    private String normalizeReaction(String emoji) {
        String normalized = emoji == null ? "" : emoji.trim().toLowerCase();
        if (!List.of("heart", "fire", "like", "laugh", "clap").contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported message reaction.");
        }
        return normalized;
    }

    private void requireMessageInConversation(UUID messageId, UUID conversationId) {
        JsonNode row = database.first(database.query(
                "messages",
                Map.of(
                        "id", "eq." + messageId,
                        "conversation_id", "eq." + conversationId,
                        "deleted_at", "is.null",
                        "select", "id",
                        "limit", "1"
                )
        ));
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reply message is not in this conversation.");
        }
    }

    private JsonNode findMessageRow(UUID messageId) {
        return database.first(database.query(
                "messages",
                Map.of(
                        "id", "eq." + messageId,
                        "select", "*",
                        "limit", "1"
                )
        ));
    }

    private String resolveMessageMedia(JsonNode row) {
        String path = textOrNull(row, "media_path");
        String type = row.path("type").asText();
        if ("voice".equals(type)) {
            return storageService.resolveUrl("voice-messages", path);
        }
        return ("photo".equals(type) || "video".equals(type) || "file".equals(type))
                ? storageService.resolveUrl("chat-files", path)
                : path;
    }

    private UUID uuidOrNull(JsonNode row, String field) {
        String value = textOrNull(row, field);
        return value == null || value.isBlank() ? null : UUID.fromString(value);
    }

    private Instant instantOrNull(JsonNode row, String field) {
        String value = textOrNull(row, field);
        return value == null || value.isBlank() ? null : Instant.parse(value);
    }

    private String textOrNull(JsonNode row, String field) {
        JsonNode value = row.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private record ReactionSummary(Map<String, Integer> counts, String ownReaction) {
    }
}
