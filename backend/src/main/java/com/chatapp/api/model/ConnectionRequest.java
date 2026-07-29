package com.chatapp.api.model;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record ConnectionRequest(@NotNull UUID profileId) {
}
