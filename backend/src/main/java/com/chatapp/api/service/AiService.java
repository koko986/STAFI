package com.chatapp.api.service;

import com.chatapp.api.model.AiRequest;
import com.chatapp.api.model.AiResponse;
import com.chatapp.api.model.Message;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AiService {
    private static final Logger log = LoggerFactory.getLogger(AiService.class);
    private static final List<String> FALLBACK_MODELS = List.of("gemini-3.6-flash", "gemini-2.5-flash");

    private final RestClient restClient;
    private final String geminiUrl;
    private final String model;
    private final String summarizeKey;
    private final String voiceKey;
    private final String conversationKey;
    private final SupabaseDatabase database;
    private final ChatService chatService;

    public AiService(
            RestClient.Builder restClientBuilder,
            @Value("${app.gemini-api-url:}") String geminiUrl,
            @Value("${app.gemini-model:}") String model,
            @Value("${app.gemini-summarize-key:}") String summarizeKey,
            @Value("${app.gemini-voice-key:}") String voiceKey,
            @Value("${app.gemini-conversation-key:}") String conversationKey,
            SupabaseDatabase database,
            ChatService chatService
    ) {
        this.restClient = restClientBuilder.build();
        this.geminiUrl = geminiUrl.replaceAll("/+$", "");
        this.model = model;
        this.summarizeKey = summarizeKey;
        this.voiceKey = voiceKey;
        this.conversationKey = conversationKey;
        this.database = database;
        this.chatService = chatService;
    }

    public AiResponse respond(AiRequest request, UUID requesterId) {
        if (request.conversationId() != null) {
            chatService.requireMembership(request.conversationId(), requesterId);
        }

        String normalizedAction = normalizeAction(request.action());
        AiResponse response = new AiResponse(request.action(), aiText(request));

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
            case "voice" -> "You are a concise voice assistant inside a private chat application. Speak in short, natural sentences because your answers are read aloud.";
            default -> "You are a concise conversational assistant inside a private chat application. Ask helpful follow-up questions when the user is unclear.";
        };
    }

    private String aiText(AiRequest request) {
        String action = normalizeAction(request.action());
        String key = apiKeyFor(action);
        if (!geminiUrl.isBlank() && !model.isBlank() && !key.isBlank()) {
            String hosted = geminiResponse(action, key, request.prompt());
            if (hosted != null) return hosted;
        }
        return offlineResponse(request);
    }

    private String apiKeyFor(String action) {
        return switch (action) {
            case "summarize" -> firstConfigured(summarizeKey, conversationKey, voiceKey);
            case "voice" -> firstConfigured(voiceKey, conversationKey, summarizeKey);
            default -> firstConfigured(conversationKey, summarizeKey, voiceKey);
        };
    }

    private String firstConfigured(String... keys) {
        for (String key : keys) {
            if (key != null && !key.isBlank()) return key;
        }
        return "";
    }

    private String geminiResponse(String action, String apiKey, String prompt) {
        for (String candidate : candidateModels()) {
            try {
                Map<String, Object> requestBody = new LinkedHashMap<>();
                requestBody.put("systemInstruction", Map.of("parts", List.of(Map.of("text", systemInstruction(action)))));
                requestBody.put("contents", List.of(Map.of(
                        "role", "user",
                        "parts", List.of(Map.of("text", prompt))
                )));
                requestBody.put("generationConfig", Map.of("temperature", 0.45));

                JsonNode result = restClient.post()
                        .uri(geminiUrl + "/models/" + candidate + ":generateContent?key=" + apiKey)
                        .body(requestBody)
                        .retrieve()
                        .body(JsonNode.class);

                JsonNode parts = result == null ? null : result.path("candidates").path(0).path("content").path("parts");
                if (parts == null || !parts.isArray()) {
                    log.warn("Gemini model {} returned an unexpected response.", candidate);
                    continue;
                }
                List<String> pieces = new ArrayList<>();
                for (JsonNode part : parts) {
                    String text = part.path("text").asText("");
                    if (!text.isBlank()) pieces.add(text);
                }
                String text = String.join("", pieces).trim();
                if (text.isBlank()) {
                    log.warn("Gemini model {} returned an empty response.", candidate);
                    continue;
                }
                return text;
            } catch (RestClientResponseException exception) {
                int status = exception.getStatusCode().value();
                if (status == 429 || status == 404 || status >= 500) {
                    log.warn("Gemini model {} unavailable ({}): {}", candidate, status, responseError(exception));
                } else {
                    log.warn("Gemini model {} rejected the request ({}): {}", candidate, status, responseError(exception));
                    break;
                }
            } catch (RuntimeException exception) {
                log.warn("Gemini API request failed: {}", exception.getMessage());
                break;
            }
        }
        return null;
    }

    private List<String> candidateModels() {
        List<String> candidates = new ArrayList<>();
        if (!model.isBlank()) candidates.add(model);
        for (String fallback : FALLBACK_MODELS) {
            if (!candidates.contains(fallback)) candidates.add(fallback);
        }
        return candidates;
    }

    private String responseError(RestClientResponseException exception) {
        try {
            String body = exception.getResponseBodyAsString();
            JsonNode error = new ObjectMapper().readTree(body);
            return error.path("error").path("message").asText(body);
        } catch (Exception ignored) {
            return exception.getMessage();
        }
    }

    private String offlineResponse(AiRequest request) {
        String prompt = request.prompt() == null ? "" : request.prompt().trim();
        return switch (normalizeAction(request.action())) {
            case "summarize" -> summarizeOffline(prompt);
            case "question" -> answerOffline(prompt);
            case "draft-reply" -> "Thanks for the update. I will check it and get back to you shortly.";
            case "voice" -> chatOffline(prompt);
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
            case "summarize", "draft-reply", "question", "voice" -> action;
            default -> "chat";
        };
    }
}
