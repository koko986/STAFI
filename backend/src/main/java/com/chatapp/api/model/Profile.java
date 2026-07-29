package com.chatapp.api.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record Profile(
        UUID id,
        @NotBlank @Size(max = 48) String displayName,
        @NotBlank
        @Pattern(regexp = "^[a-z0-9_]{3,24}$", message = "Username must be 3-24 lowercase letters, numbers, or underscores")
        String username,
        @Size(max = 160) String bio,
        String avatarPath,
        String themeMode,
        String accentColor,
        boolean onboarded
) {
}
