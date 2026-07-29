package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record Story(
        UUID id,
        UUID ownerId,
        String ownerName,
        String ownerAvatarPath,
        @NotBlank String mediaPath,
        String caption,
        String visibility,
        int viewCount,
        boolean viewed,
        Map<String, Integer> reactions,
        String ownReaction,
        List<StoryReply> replies,
        Instant expiresAt,
        Instant createdAt
) {
}
