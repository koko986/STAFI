package com.chatapp.api.service;

import com.chatapp.api.model.ConnectionView;
import com.chatapp.api.model.Profile;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class ConnectionService {
    private final SupabaseDatabase database;
    private final ProfileService profileService;

    public ConnectionService(SupabaseDatabase database, ProfileService profileService) {
        this.database = database;
        this.profileService = profileService;
    }

    public List<ConnectionView> list(UUID userId) {
        JsonNode rows = database.query(
                "connections",
                Map.of(
                        "or", "(requester_id.eq." + userId + ",recipient_id.eq." + userId + ")",
                        "select", "*",
                        "order", "updated_at.desc"
                )
        );
        List<ConnectionView> connections = new ArrayList<>();
        if (rows != null && rows.isArray()) {
            rows.forEach(row -> connections.add(toView(row, userId)));
        }
        return connections;
    }

    public ConnectionView request(UUID userId, UUID profileId) {
        if (userId.equals(profileId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot add yourself as a contact.");
        }
        profileService.find(profileId)
                .filter(Profile::onboarded)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found."));

        JsonNode existing = findBetween(userId, profileId);
        if (existing != null) {
            boolean incoming = profileId.toString().equals(existing.path("requester_id").asText());
            if (incoming && "pending".equals(existing.path("status").asText())) {
                JsonNode accepted = database.first(database.update(
                        "connections",
                        Map.of("id", "eq." + existing.path("id").asText()),
                        Map.of("status", "accepted")
                ));
                return toView(accepted, userId);
            }
            return toView(existing, userId);
        }

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("requester_id", userId);
        row.put("recipient_id", profileId);
        row.put("status", "pending");
        return toView(database.first(database.insert("connections", row)), userId);
    }

    public ConnectionView accept(UUID connectionId, UUID userId) {
        JsonNode connection = requireParticipant(connectionId, userId);
        if (!userId.toString().equals(connection.path("recipient_id").asText())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the recipient can accept this request.");
        }
        JsonNode accepted = database.first(database.update(
                "connections",
                Map.of("id", "eq." + connectionId),
                Map.of("status", "accepted")
        ));
        return toView(accepted, userId);
    }

    public void remove(UUID connectionId, UUID userId) {
        requireParticipant(connectionId, userId);
        database.delete("connections", Map.of("id", "eq." + connectionId));
    }

    public Set<UUID> acceptedProfileIds(UUID userId) {
        Set<UUID> profileIds = new HashSet<>();
        list(userId).stream()
                .filter(connection -> "accepted".equals(connection.status()))
                .forEach(connection -> profileIds.add(connection.profile().id()));
        return profileIds;
    }

    public boolean areContacts(UUID firstUserId, UUID secondUserId) {
        if (firstUserId.equals(secondUserId)) return true;
        JsonNode connection = findBetween(firstUserId, secondUserId);
        return connection != null && "accepted".equals(connection.path("status").asText());
    }

    private JsonNode findBetween(UUID firstUserId, UUID secondUserId) {
        return database.first(database.query(
                "connections",
                Map.of(
                        "or", "(and(requester_id.eq." + firstUserId + ",recipient_id.eq." + secondUserId
                                + "),and(requester_id.eq." + secondUserId + ",recipient_id.eq." + firstUserId + "))",
                        "select", "*",
                        "limit", "1"
                )
        ));
    }

    private JsonNode requireParticipant(UUID connectionId, UUID userId) {
        JsonNode connection = database.first(database.query(
                "connections",
                Map.of(
                        "id", "eq." + connectionId,
                        "or", "(requester_id.eq." + userId + ",recipient_id.eq." + userId + ")",
                        "select", "*",
                        "limit", "1"
                )
        ));
        if (connection == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Connection not found.");
        }
        return connection;
    }

    private ConnectionView toView(JsonNode row, UUID userId) {
        if (row == null) {
            throw new IllegalStateException("Supabase did not return a connection.");
        }
        UUID requesterId = UUID.fromString(row.path("requester_id").asText());
        UUID recipientId = UUID.fromString(row.path("recipient_id").asText());
        boolean outgoing = requesterId.equals(userId);
        UUID otherProfileId = outgoing ? recipientId : requesterId;
        Profile profile = profileService.find(otherProfileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Connected profile not found."));
        String direction = "accepted".equals(row.path("status").asText())
                ? "accepted"
                : outgoing ? "outgoing" : "incoming";
        return new ConnectionView(
                UUID.fromString(row.path("id").asText()),
                row.path("status").asText(),
                direction,
                profile,
                Instant.parse(row.path("updated_at").asText())
        );
    }
}
