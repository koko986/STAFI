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
    private static final List<String> FALLBACK_MODELS = List.of("qwen/qwen3.6-27b", "openai/gpt-oss-20b");

    private final RestClient restClient;
    private final String groqUrl;
    private final String model;
    private final String ttsModel;
    private final String ttsVoice;
    private final String summarizeKey;
    private final String voiceKey;
    private final String conversationKey;
    private final SupabaseDatabase database;
    private final ChatService chatService;

    public AiService(
            RestClient.Builder restClientBuilder,
            @Value("${app.groq-api-url:}") String groqUrl,
            @Value("${app.groq-model:}") String model,
            @Value("${app.groq-tts-model:}") String ttsModel,
            @Value("${app.groq-tts-voice:}") String ttsVoice,
            @Value("${app.groq-summarize-key:}") String summarizeKey,
            @Value("${app.groq-voice-key:}") String voiceKey,
            @Value("${app.groq-conversation-key:}") String conversationKey,
            SupabaseDatabase database,
            ChatService chatService
    ) {
        this.restClient = restClientBuilder.build();
        this.groqUrl = groqUrl.replaceAll("/+$", "");
        this.model = model;
        this.ttsModel = ttsModel;
        this.ttsVoice = ttsVoice;
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

        try {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("requester_id", requesterId);
            event.put("conversation_id", request.conversationId());
            event.put("action", normalizedAction);
            event.put("prompt", request.prompt());
            event.put("response", response.text());
            database.insert("ai_events", event);
        } catch (RuntimeException exception) {
            log.warn("Could not record AI event: {}", exception.getMessage());
        }
        return response;
    }

    private String systemInstruction(String action) {
        return switch (action) {
            case "summarize" -> "Summarize this chat in at most 3 very short bullet points, under 60 words total. Do not invent facts.";
            case "question" -> "Answer the user's question using the provided chat context when relevant. Be concise, useful, and clear when the context is missing.";
            case "draft-reply" -> "Draft one friendly, concise reply to the chat. Return only the reply.";
            case "voice" -> "You are a concise voice assistant inside a private chat application. Speak in short, natural sentences because your answers are read aloud.";
            default -> "You are a concise conversational assistant inside a private chat application. Ask helpful follow-up questions when the user is unclear.";
        };
    }

    private String aiText(AiRequest request) {
        String action = normalizeAction(request.action());
        String key = apiKeyFor(action);
        if (!groqUrl.isBlank() && !model.isBlank() && !key.isBlank()) {
            String hosted = groqResponse(action, key, request.prompt());
            if (hosted != null) return hosted;
        }
        return offlineResponse(request);
    }

    public byte[] synthesizeSpeech(String text) {
        String key = firstConfigured(voiceKey, conversationKey, summarizeKey);
        if (groqUrl.isBlank() || ttsModel.isBlank() || key.isBlank()) {
            throw new IllegalStateException("Groq text-to-speech is not configured.");
        }
        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("model", ttsModel);
        requestBody.put("voice", ttsVoice);
        requestBody.put("input", text);
        requestBody.put("response_format", "wav");
        return restClient.post()
                .uri(groqUrl + "/audio/speech")
                .header("Authorization", "Bearer " + key)
                .body(requestBody)
                .retrieve()
                .body(byte[].class);
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

    private String groqResponse(String action, String apiKey, String prompt) {
        for (String candidate : candidateModels()) {
            try {
                Map<String, Object> requestBody = new LinkedHashMap<>();
                requestBody.put("model", candidate);
                requestBody.put("messages", List.of(
                        Map.of("role", "system", "content", systemInstruction(action)),
                        Map.of("role", "user", "content", prompt)
                ));
                requestBody.put("temperature", 0.45);

                JsonNode result = restClient.post()
                        .uri(groqUrl + "/chat/completions")
                        .header("Authorization", "Bearer " + apiKey)
                        .body(requestBody)
                        .retrieve()
                        .body(JsonNode.class);

                JsonNode content = result == null ? null : result.path("choices").path(0).path("message").path("content");
                String text = content == null ? "" : content.asText("").trim();
                if (text.isBlank()) {
                    log.warn("Groq model {} returned an empty response.", candidate);
                    continue;
                }
                return text;
            } catch (RestClientResponseException exception) {
                int status = exception.getStatusCode().value();
                if (status == 429 || status == 404 || status >= 500) {
                    log.warn("Groq model {} unavailable ({}): {}", candidate, status, responseError(exception));
                } else if (status == 400 && responseError(exception).toLowerCase().contains("model")) {
                    log.warn("Groq model {} not found ({}): {}", candidate, status, responseError(exception));
                } else {
                    log.warn("Groq model {} rejected the request ({}): {}", candidate, status, responseError(exception));
                    break;
                }
            } catch (RuntimeException exception) {
                log.warn("Groq API request failed: {}", exception.getMessage());
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
                .limit(3)
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
