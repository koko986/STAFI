package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record GroupConversationRequest(
        @NotBlank @Size(max = 64) String title,
        @NotEmpty List<UUID> memberIds
) {
}
