package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.UUID;

public record Story(
        UUID id,
        UUID ownerId,
        @NotBlank String mediaPath,
        String caption,
        Instant expiresAt,
        Instant createdAt
) {
}

