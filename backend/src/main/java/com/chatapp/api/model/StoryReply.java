package com.chatapp.api.model;

import java.time.Instant;
import java.util.UUID;

public record StoryReply(
        UUID id,
        UUID storyId,
        UUID senderId,
        String senderName,
        String senderAvatarPath,
        String body,
        Instant createdAt
) {
}
