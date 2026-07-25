package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public record Message(
        UUID id,
        @NotNull UUID conversationId,
        UUID senderId,
        @NotBlank String type,
        String body,
        String mediaPath,
        Instant createdAt
) {
    public Message withServerFields(UUID senderId) {
        return new Message(
                id == null ? UUID.randomUUID() : id,
                conversationId,
                senderId,
                type,
                body,
                mediaPath,
                createdAt == null ? Instant.now() : createdAt
        );
    }
}

