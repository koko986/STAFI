package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.UUID;

public record Conversation(
        UUID id,
        @NotBlank String type,
        String title,
        UUID createdBy,
        Profile profile,
        Instant createdAt
) {
}
