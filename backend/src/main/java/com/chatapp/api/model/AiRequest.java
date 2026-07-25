package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public record AiRequest(
        UUID conversationId,
        @NotBlank String action,
        @NotBlank String prompt
) {
}

