package com.chatapp.api.service;

import com.chatapp.api.model.Story;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class StoryService {
    private final SupabaseDatabase database;
    private final StorageService storageService;

    public StoryService(SupabaseDatabase database, StorageService storageService) {
        this.database = database;
        this.storageService = storageService;
    }

    public List<Story> listActive() {
        JsonNode rows = database.query(
                "stories",
                Map.of(
                        "expires_at", "gt." + Instant.now(),
                        "select", "*",
                        "order", "created_at.desc"
                )
        );
        List<Story> stories = new ArrayList<>();
        if (rows != null && rows.isArray()) rows.forEach(row -> stories.add(toStory(row)));
        return stories;
    }

    public Story create(Story request, UUID ownerId) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("owner_id", ownerId);
        row.put("media_path", request.mediaPath());
        row.put("caption", request.caption());
        return toStory(database.first(database.insert("stories", row)));
    }

    private Story toStory(JsonNode row) {
        return new Story(
                UUID.fromString(row.path("id").asText()),
                UUID.fromString(row.path("owner_id").asText()),
                storageService.resolveUrl("stories", row.path("media_path").asText()),
                textOrNull(row, "caption"),
                Instant.parse(row.path("expires_at").asText()),
                Instant.parse(row.path("created_at").asText())
        );
    }

    private String textOrNull(JsonNode row, String field) {
        JsonNode value = row.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
