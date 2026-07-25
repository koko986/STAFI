package com.chatapp.api.model;

import java.util.UUID;

public record Profile(
        UUID id,
        String displayName,
        String avatarPath,
        String themeMode,
        String accentColor
) {
}

