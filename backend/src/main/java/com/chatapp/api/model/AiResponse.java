package com.chatapp.api.model;

public record AiResponse(String action, String text, Message message) {
    public AiResponse(String action, String text) {
        this(action, text, null);
    }
}
