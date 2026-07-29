package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;

public record StoryReactionRequest(@NotBlank String emoji) {
}
