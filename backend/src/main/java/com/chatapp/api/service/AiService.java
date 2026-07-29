package com.chatapp.api.service;

import com.chatapp.api.model.AiRequest;
import com.chatapp.api.model.AiResponse;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class AiService {
    private final RestClient restClient;
    private final String apiUrl;
    private final String model;
    private final String apiKey;
    private final SupabaseDatabase database;
    private final ChatService chatService;

    public AiService(
            RestClient.Builder restClientBuilder,
            @Value("${app.ai-api-url:}") String apiUrl,
            @Value("${app.ai-model:}") String model,
            @Value("${app.ai-api-key:}") String apiKey,
            SupabaseDatabase database,
            ChatService chatService
    ) {
        this.restClient = restClientBuilder.build();
        this.apiUrl = apiUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.database = database;
        this.chatService = chatService;
    }

    public AiResponse respond(AiRequest request, UUID requesterId) {
        if (request.conversationId() != null) {
            chatService.requireMembership(request.conversationId(), requesterId);
        }

        AiResponse response;
        if (apiUrl.isBlank() || model.isBlank() || apiKey.isBlank()) {
            response = new AiResponse(request.action(), offlineResponse(request));
        } else {
            try {
                JsonNode result = restClient.post()
                        .uri(apiUrl)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                        .body(Map.of(
                                "model", model,
                                "messages", List.of(
                                        Map.of("role", "system", "content", systemInstruction(request.action())),
                                        Map.of("role", "user", "content", request.prompt())
                                ),
                                "temperature", 0.3
                        ))
                        .retrieve()
                        .body(JsonNode.class);

                String fallback = offlineResponse(request);
                String text = result == null
                        ? fallback
                        : result.path("choices").path(0).path("message").path("content").asText(fallback);
                response = new AiResponse(request.action(), text);
            } catch (RuntimeException exception) {
                response = new AiResponse(request.action(), offlineResponse(request));
            }
        }

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("requester_id", requesterId);
        event.put("conversation_id", request.conversationId());
        event.put("action", normalizeAction(request.action()));
        event.put("prompt", request.prompt());
        event.put("response", response.text());
        database.insert("ai_events", event);
        return response;
    }

    private String systemInstruction(String action) {
        return switch (action) {
            case "summarize" -> "Summarize this chat accurately in concise bullet points. Do not invent facts.";
            case "draft-reply" -> "Draft one friendly, concise reply to the chat. Return only the reply.";
            default -> "You are a concise assistant inside a private chat application.";
        };
    }

    private String offlineResponse(AiRequest request) {
        return switch (request.action()) {
            case "summarize" -> "AI summary is available after an AI provider is configured.";
            case "draft-reply" -> "Thanks for the update. I will check and get back to you shortly.";
            default -> "AI is available after an AI provider is configured.";
        };
    }

    private String normalizeAction(String action) {
        return switch (action) {
            case "summarize", "draft-reply" -> action;
            default -> "chat";
        };
    }
}
