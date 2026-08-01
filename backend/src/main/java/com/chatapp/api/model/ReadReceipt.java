package com.chatapp.api.model;

import java.util.UUID;

public record ReadReceipt(
        UUID conversationId,
        UUID userId,
        UUID lastReadMessageId
) {
}
