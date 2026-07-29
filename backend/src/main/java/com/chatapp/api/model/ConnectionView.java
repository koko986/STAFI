package com.chatapp.api.model;

import java.time.Instant;
import java.util.UUID;

public record ConnectionView(
        UUID id,
        String status,
        String direction,
        Profile profile,
        Instant updatedAt
) {
}
