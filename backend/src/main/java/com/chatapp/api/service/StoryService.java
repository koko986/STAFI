package com.chatapp.api.service;

import com.chatapp.api.model.Story;
import com.chatapp.api.model.Message;
import com.chatapp.api.model.StoryReply;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class StoryService {
    private final SupabaseDatabase database;
    private final StorageService storageService;
    private final ProfileService profileService;
    private final ConnectionService connectionService;
    private final ChatService chatService;
    private static final Set<String> REACTIONS = Set.of("heart", "fire", "like", "laugh", "clap");

    public StoryService(
            SupabaseDatabase database,
            StorageService storageService,
            ProfileService profileService,
            ConnectionService connectionService,
            ChatService chatService
    ) {
        this.database = database;
        this.storageService = storageService;
        this.profileService = profileService;
        this.connectionService = connectionService;
        this.chatService = chatService;
    }

    public List<Story> listActive(UUID viewerId) {
        JsonNode rows = database.query(
                "stories",
                Map.of(
                        "expires_at", "gt." + Instant.now(),
                        "select", "*",
                        "order", "created_at.desc"
                )
        );
        Set<UUID> contactIds = connectionService.acceptedProfileIds(viewerId);
        Map<UUID, Integer> viewCounts = new HashMap<>();
        Set<UUID> viewedStoryIds = viewedStoryIds(viewerId);
        List<Story> stories = new ArrayList<>();
        if (rows != null && rows.isArray()) {
            rows.forEach(row -> {
                UUID ownerId = UUID.fromString(row.path("owner_id").asText());
                boolean visible = ownerId.equals(viewerId)
                        || "public".equals(row.path("visibility").asText())
                        || contactIds.contains(ownerId);
                if (visible) {
                    stories.add(toStory(
                            row,
                            viewerId,
                            viewCounts.computeIfAbsent(
                                    UUID.fromString(row.path("id").asText()),
                                    this::countViews
                            ),
                            viewedStoryIds
                    ));
                }
            });
        }
        return stories;
    }

    public Story create(Story request, UUID ownerId) {
        String visibility = request.visibility() == null ? "contacts" : request.visibility().trim().toLowerCase();
        if (!List.of("contacts", "public").contains(visibility)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Story visibility must be contacts or public.");
        }
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("owner_id", ownerId);
        row.put("media_path", request.mediaPath());
        row.put("caption", request.caption());
        row.put("visibility", visibility);
        return toStory(database.first(database.insert("stories", row)), ownerId, 0, Set.of());
    }

    public Story markViewed(UUID storyId, UUID viewerId) {
        JsonNode row = requireVisible(storyId, viewerId);
        UUID ownerId = UUID.fromString(row.path("owner_id").asText());
        if (!ownerId.equals(viewerId)) {
            JsonNode existing = database.first(database.query(
                    "story_views",
                    Map.of(
                            "story_id", "eq." + storyId,
                            "viewer_id", "eq." + viewerId,
                            "select", "story_id",
                            "limit", "1"
                    )
            ));
            if (existing == null) {
                database.insert(
                        "story_views",
                        Map.of("story_id", storyId, "viewer_id", viewerId)
                );
            }
        }
        return toStory(row, viewerId, countViews(storyId), Set.of(storyId));
    }

    public void delete(UUID storyId, UUID ownerId) {
        JsonNode row = database.first(database.query(
                "stories",
                Map.of(
                        "id", "eq." + storyId,
                        "owner_id", "eq." + ownerId,
                        "select", "*",
                        "limit", "1"
                )
        ));
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Story not found.");
        }
        database.delete("stories", Map.of("id", "eq." + storyId, "owner_id", "eq." + ownerId));
        try {
            storageService.delete("stories", row.path("media_path").asText());
        } catch (RuntimeException ignored) {
            // The story is already removed; an unavailable object can be cleaned up later.
        }
    }

    public Story react(UUID storyId, UUID userId, String emoji) {
        JsonNode row = requireVisible(storyId, userId);
        requireOtherUserStory(row, userId);
        String normalizedEmoji = emoji == null ? "" : emoji.trim().toLowerCase();
        if (!REACTIONS.contains(normalizedEmoji)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported story reaction.");
        }

        Map<String, String> filters = Map.of(
                "story_id", "eq." + storyId,
                "user_id", "eq." + userId
        );
        JsonNode existing = database.first(database.query(
                "story_reactions",
                Map.of(
                        "story_id", "eq." + storyId,
                        "user_id", "eq." + userId,
                        "select", "story_id",
                        "limit", "1"
                )
        ));
        if (existing == null) {
            database.insert(
                    "story_reactions",
                    Map.of("story_id", storyId, "user_id", userId, "emoji", normalizedEmoji)
            );
        } else {
            database.update("story_reactions", filters, Map.of("emoji", normalizedEmoji));
        }
        return toStory(row, userId, countViews(storyId), viewedStoryIds(userId));
    }

    public void removeReaction(UUID storyId, UUID userId) {
        JsonNode row = requireVisible(storyId, userId);
        requireOtherUserStory(row, userId);
        database.delete(
                "story_reactions",
                Map.of("story_id", "eq." + storyId, "user_id", "eq." + userId)
        );
    }

    public Story reply(UUID storyId, UUID senderId, String body) {
        JsonNode row = requireVisible(storyId, senderId);
        requireOtherUserStory(row, senderId);
        String message = body == null ? "" : body.trim();
        if (message.isBlank() || message.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Story reply must be 1-500 characters.");
        }

        UUID ownerId = UUID.fromString(row.path("owner_id").asText());
        database.insert(
                "story_replies",
                Map.of(
                        "story_id", storyId,
                        "sender_id", senderId,
                        "body", message
                )
        );
        var conversation = chatService.startDirectConversation(senderId, ownerId);
        chatService.addMessage(
                new Message(
                        UUID.randomUUID(),
                        conversation.id(),
                        senderId,
                        "text",
                        "Replied to your story: " + message,
                        null,
                        Instant.now()
                ),
                senderId
        );
        return toStory(row, senderId, countViews(storyId), viewedStoryIds(senderId));
    }

    private JsonNode requireVisible(UUID storyId, UUID viewerId) {
        JsonNode row = database.first(database.query(
                "stories",
                Map.of(
                        "id", "eq." + storyId,
                        "expires_at", "gt." + Instant.now(),
                        "select", "*",
                        "limit", "1"
                )
        ));
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Story not found or expired.");
        }
        UUID ownerId = UUID.fromString(row.path("owner_id").asText());
        boolean visible = ownerId.equals(viewerId)
                || "public".equals(row.path("visibility").asText())
                || connectionService.areContacts(ownerId, viewerId);
        if (!visible) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This story is for contacts only.");
        }
        return row;
    }

    private Set<UUID> viewedStoryIds(UUID viewerId) {
        JsonNode rows = database.query(
                "story_views",
                Map.of("viewer_id", "eq." + viewerId, "select", "story_id")
        );
        Set<UUID> storyIds = new HashSet<>();
        if (rows != null && rows.isArray()) {
            rows.forEach(row -> storyIds.add(UUID.fromString(row.path("story_id").asText())));
        }
        return storyIds;
    }

    private int countViews(UUID storyId) {
        JsonNode rows = database.query(
                "story_views",
                Map.of("story_id", "eq." + storyId, "select", "story_id")
        );
        return rows != null && rows.isArray() ? rows.size() : 0;
    }

    private void requireOtherUserStory(JsonNode row, UUID userId) {
        if (UUID.fromString(row.path("owner_id").asText()).equals(userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot interact with your own story.");
        }
    }

    private Map<String, Integer> reactionCounts(UUID storyId) {
        JsonNode rows = database.query(
                "story_reactions",
                Map.of("story_id", "eq." + storyId, "select", "emoji")
        );
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (rows != null && rows.isArray()) {
            rows.forEach(row -> counts.merge(row.path("emoji").asText(), 1, Integer::sum));
        }
        return counts;
    }

    private String ownReaction(UUID storyId, UUID viewerId) {
        JsonNode row = database.first(database.query(
                "story_reactions",
                Map.of(
                        "story_id", "eq." + storyId,
                        "user_id", "eq." + viewerId,
                        "select", "emoji",
                        "limit", "1"
                )
        ));
        return row == null ? null : row.path("emoji").asText(null);
    }

    private List<StoryReply> replies(UUID storyId, UUID ownerId, UUID viewerId) {
        Map<String, String> parameters = new LinkedHashMap<>();
        parameters.put("story_id", "eq." + storyId);
        parameters.put("select", "*");
        parameters.put("order", "created_at.asc");
        if (!ownerId.equals(viewerId)) {
            parameters.put("sender_id", "eq." + viewerId);
        }
        JsonNode rows = database.query("story_replies", parameters);
        List<StoryReply> replies = new ArrayList<>();
        if (rows != null && rows.isArray()) {
            rows.forEach(row -> {
                UUID senderId = UUID.fromString(row.path("sender_id").asText());
                var sender = profileService.find(senderId).orElse(null);
                replies.add(new StoryReply(
                        UUID.fromString(row.path("id").asText()),
                        storyId,
                        senderId,
                        sender == null ? "Unknown user" : sender.displayName(),
                        sender == null ? null : sender.avatarPath(),
                        row.path("body").asText(),
                        Instant.parse(row.path("created_at").asText())
                ));
            });
        }
        return replies;
    }

    private Story toStory(JsonNode row, UUID viewerId, int viewCount, Set<UUID> viewedStoryIds) {
        UUID ownerId = UUID.fromString(row.path("owner_id").asText());
        var owner = profileService.find(ownerId).orElse(null);
        UUID storyId = UUID.fromString(row.path("id").asText());
        return new Story(
                storyId,
                ownerId,
                owner == null ? "Unknown user" : owner.displayName(),
                owner == null ? null : owner.avatarPath(),
                storageService.resolveUrl("stories", row.path("media_path").asText()),
                textOrNull(row, "caption"),
                row.path("visibility").asText("contacts"),
                viewCount,
                ownerId.equals(viewerId) || viewedStoryIds.contains(storyId),
                reactionCounts(storyId),
                ownReaction(storyId, viewerId),
                replies(storyId, ownerId, viewerId),
                Instant.parse(row.path("expires_at").asText()),
                Instant.parse(row.path("created_at").asText())
        );
    }

    private String textOrNull(JsonNode row, String field) {
        JsonNode value = row.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
