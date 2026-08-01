package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record Message(
        UUID id,
        @NotNull UUID conversationId,
        UUID senderId,
        @NotBlank String type,
        String body,
        String mediaPath,
        UUID replyToMessageId,
        String replyPreview,
        UUID forwardedFromMessageId,
        boolean forwarded,
        Map<String, Integer> reactions,
        String ownReaction,
        String status,
        Instant createdAt,
        Instant deletedAt
) {
    public Message(
            UUID id,
            UUID conversationId,
            UUID senderId,
            String type,
            String body,
            String mediaPath,
            Instant createdAt
    ) {
        this(
                id,
                conversationId,
                senderId,
                type,
                body,
                mediaPath,
                null,
                null,
                null,
                false,
                Map.of(),
                null,
                null,
                createdAt,
                null
        );
    }

    public Message withServerFields(UUID senderId) {
        return new Message(
                id == null ? UUID.randomUUID() : id,
                conversationId,
                senderId,
                type,
                body,
                mediaPath,
                replyToMessageId,
                replyPreview,
                forwardedFromMessageId,
                forwarded,
                reactions,
                ownReaction,
                status,
                createdAt == null ? Instant.now() : createdAt,
                deletedAt
        );
    }

    public Message forBroadcast() {
        return new Message(
                id,
                conversationId,
                senderId,
                type,
                body,
                mediaPath,
                replyToMessageId,
                replyPreview,
                forwardedFromMessageId,
                forwarded,
                reactions,
                null,
                null,
                createdAt,
                deletedAt
        );
    }
}
