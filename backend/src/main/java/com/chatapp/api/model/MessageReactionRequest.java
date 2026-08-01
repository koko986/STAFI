package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;

public record MessageReactionRequest(
        @NotBlank String emoji
) {
}
