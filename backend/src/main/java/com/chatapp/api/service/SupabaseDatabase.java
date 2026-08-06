package com.chatapp.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Map;

@Service
public class SupabaseDatabase {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String restUrl;
    private final boolean configured;

    public SupabaseDatabase(
            RestClient.Builder restClientBuilder,
            ObjectMapper objectMapper,
            @Value("${app.supabase-url:}") String supabaseUrl,
            @Value("${app.supabase-service-role-key:}") String serviceKey
    ) {
        String normalizedUrl = supabaseUrl.replaceAll("/+$", "");
        this.restUrl = normalizedUrl + "/rest/v1";
        this.objectMapper = objectMapper;
        this.configured = !normalizedUrl.isBlank() && !serviceKey.isBlank();
        this.restClient = restClientBuilder
                .defaultHeader("apikey", serviceKey)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                .defaultHeader(HttpHeaders.USER_AGENT, "JavaChatBackend/1.0")
                .build();
    }

    public JsonNode query(String table, Map<String, String> parameters) {
        requireConfigured();
        try {
            return restClient.get()
                    .uri(uri(table, parameters))
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        }
    }

    public JsonNode insert(String table, Object body) {
        requireConfigured();
        try {
            return restClient.post()
                    .uri(uri(table, Map.of()))
                    .header("Prefer", "return=representation")
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        }
    }

    public JsonNode update(String table, Map<String, String> filters, Object body) {
        requireConfigured();
        try {
            return restClient.patch()
                    .uri(uri(table, filters))
                    .header("Prefer", "return=representation")
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        }
    }

    public JsonNode delete(String table, Map<String, String> filters) {
        requireConfigured();
        try {
            return restClient.delete()
                    .uri(uri(table, filters))
                    .header("Prefer", "return=representation")
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        }
    }

    public JsonNode rpc(String function, Object body) {
        requireConfigured();
        try {
            return restClient.post()
                    .uri(uri("rpc/" + function, Map.of()))
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            throw translate(exception);
        }
    }

    public JsonNode first(JsonNode response) {
        if (response == null || response.isNull()) return null;
        if (response.isArray()) return response.isEmpty() ? null : response.get(0);
        return response;
    }

    private URI uri(String path, Map<String, String> parameters) {
        MultiValueMap<String, String> query = new LinkedMultiValueMap<>();
        parameters.forEach(query::add);
        return UriComponentsBuilder
                .fromUriString(restUrl + "/" + path)
                .queryParams(query)
                .build()
                .encode()
                .toUri();
    }

    private void requireConfigured() {
        if (!configured) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Supabase database is not configured on the Java backend."
            );
        }
    }

    private ResponseStatusException translate(RestClientResponseException exception) {
        HttpStatus status = switch (exception.getStatusCode().value()) {
            case 400, 422 -> HttpStatus.BAD_REQUEST;
            case 401, 403 -> HttpStatus.BAD_GATEWAY;
            case 404 -> HttpStatus.NOT_FOUND;
            case 409 -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_GATEWAY;
        };
        String message = "Supabase database request failed.";
        try {
            JsonNode error = objectMapper.readTree(exception.getResponseBodyAsString());
            message = error.path("message").asText(error.path("hint").asText(message));
        } catch (Exception ignored) {
            // Keep the safe fallback instead of exposing a raw upstream response.
        }
        return new ResponseStatusException(status, message, exception);
    }
}
