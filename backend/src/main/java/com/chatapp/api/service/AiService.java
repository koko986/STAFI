package com.chatapp.api.service;

import com.chatapp.api.model.AiRequest;
import com.chatapp.api.model.AiResponse;
import com.chatapp.api.model.Message;
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
    private final String localApiUrl;
    private final String localModel;
    private final SupabaseDatabase database;
    private final ChatService chatService;

    public AiService(
            RestClient.Builder restClientBuilder,
            @Value("${app.ai-api-url:}") String apiUrl,
            @Value("${app.ai-model:}") String model,
            @Value("${app.ai-api-key:}") String apiKey,
            @Value("${app.ai-local-api-url:}") String localApiUrl,
            @Value("${app.ai-local-model:}") String localModel,
            SupabaseDatabase database,
            ChatService chatService
    ) {
        this.restClient = restClientBuilder.build();
        this.apiUrl = apiUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.localApiUrl = localApiUrl;
        this.localModel = localModel;
        this.database = database;
        this.chatService = chatService;
    }

    public AiResponse respond(AiRequest request, UUID requesterId) {
        if (request.conversationId() != null) {
            chatService.requireMembership(request.conversationId(), requesterId);
        }

        String normalizedAction = normalizeAction(request.action());
        AiResponse response;
        response = new AiResponse(request.action(), aiText(request));

        Message savedMessage = null;
        if ("chat".equals(normalizedAction)
                && request.conversationId() != null
                && chatService.isAiConversation(request.conversationId())) {
            savedMessage = chatService.addAssistantMessage(request.conversationId(), response.text());
            response = new AiResponse(response.action(), response.text(), savedMessage);
        }

        Map<String, Object> event = new LinkedHashMap<>();
        event.put("requester_id", requesterId);
        event.put("conversation_id", request.conversationId());
        event.put("action", normalizedAction);
        event.put("prompt", request.prompt());
        event.put("response", response.text());
        database.insert("ai_events", event);
        return response;
    }

    private String systemInstruction(String action) {
        return switch (action) {
            case "summarize" -> "Summarize this chat accurately in concise bullet points. Do not invent facts.";
            case "question" -> "Answer the user's question using the provided chat context when relevant. Be concise, useful, and clear when the context is missing.";
            case "draft-reply" -> "Draft one friendly, concise reply to the chat. Return only the reply.";
            default -> "You are a concise conversational assistant inside a private chat application. Ask helpful follow-up questions when the user is unclear.";
        };
    }

    private String aiText(AiRequest request) {
        String hosted = hostedProviderResponse(request);
        if (hosted != null) return hosted;
        String local = localProviderResponse(request);
        return local == null ? offlineResponse(request) : local;
    }

    private String hostedProviderResponse(AiRequest request) {
        if (apiUrl.isBlank() || model.isBlank() || apiKey.isBlank()) return null;
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
                            "temperature", 0.45
                    ))
                    .retrieve()
                    .body(JsonNode.class);
            String text = result == null
                    ? ""
                    : result.path("choices").path(0).path("message").path("content").asText("");
            return text.isBlank() ? null : text;
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private String localProviderResponse(AiRequest request) {
        if (localApiUrl.isBlank() || localModel.isBlank()) return null;
        try {
            JsonNode result = restClient.post()
                    .uri(localApiUrl)
                    .body(Map.of(
                            "model", localModel,
                            "stream", false,
                            "messages", List.of(
                                    Map.of("role", "system", "content", systemInstruction(request.action())),
                                    Map.of("role", "user", "content", request.prompt())
                            )
                    ))
                    .retrieve()
                    .body(JsonNode.class);
            String text = result == null ? "" : result.path("message").path("content").asText("");
            return text.isBlank() ? null : text;
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private String offlineResponse(AiRequest request) {
        String prompt = request.prompt() == null ? "" : request.prompt().trim();
        return switch (normalizeAction(request.action())) {
            case "summarize" -> summarizeOffline(prompt);
            case "question" -> answerOffline(prompt);
            case "draft-reply" -> "Thanks for the update. I will check it and get back to you shortly.";
            default -> chatOffline(prompt);
        };
    }

    private String chatOffline(String prompt) {
        String latest = latestUserText(prompt);
        if (latest.isBlank()) {
            return "I'm here. Tell me what you want to talk about.";
        }
        if (latest.endsWith("?")) {
            return answerOffline(latest);
        }
        return "I hear you. " + shortEcho(latest) + " What would you like to do next?";
    }

    private String answerOffline(String prompt) {
        String latest = latestUserText(prompt);
        if (latest.isBlank()) {
            return "Ask me anything about the chat, and I will help.";
        }
        return "Based on what I can see here, the main point is: " + shortEcho(latest)
                + " If you want, ask a more specific question and I will narrow it down.";
    }

    private String summarizeOffline(String prompt) {
        List<String> lines = prompt.lines()
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .limit(6)
                .toList();
        if (lines.isEmpty()) return "No chat messages yet.";
        return "Quick summary:\n- " + String.join("\n- ", lines);
    }

    private String latestUserText(String prompt) {
        if (prompt.isBlank()) return "";
        return prompt.lines()
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .reduce((previous, current) -> current)
                .orElse("")
                .replaceFirst("^(Me|User request|AI|Chat context):\\s*", "")
                .trim();
    }

    private String shortEcho(String text) {
        String cleaned = text.replaceAll("\\s+", " ").trim();
        return cleaned.length() > 180 ? cleaned.substring(0, 177) + "..." : cleaned;
    }

    private String normalizeAction(String action) {
        return switch (action) {
            case "summarize", "draft-reply", "question" -> action;
            default -> "chat";
        };
    }
}
