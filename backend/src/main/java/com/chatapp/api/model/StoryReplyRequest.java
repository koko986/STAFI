package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record StoryReplyRequest(
        @NotBlank
        @Size(max = 500)
        String body
) {
}
