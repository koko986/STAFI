package com.chatapp.api.model;

import java.time.Instant;
import java.util.UUID;

public record PresenceEvent(
        UUID userId,
        boolean online,
        Instant seenAt
) {
    public PresenceEvent withServerTime() {
        return new PresenceEvent(userId, online, Instant.now());
    }
}
