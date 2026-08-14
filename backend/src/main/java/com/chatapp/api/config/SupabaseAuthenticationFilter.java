package com.chatapp.api.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class SupabaseAuthenticationFilter extends OncePerRequestFilter {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String supabaseUrl;
    private final String apiKey;

    public SupabaseAuthenticationFilter(
            RestClient.Builder restClientBuilder,
            ObjectMapper objectMapper,
            @Value("${app.supabase-url:}") String supabaseUrl,
            @Value("${app.supabase-publishable-key:}") String publishableKey,
            @Value("${app.supabase-service-role-key:}") String serviceRoleKey
    ) {
        this.restClient = restClientBuilder.build();
        this.objectMapper = objectMapper;
        this.supabaseUrl = supabaseUrl.replaceAll("/+$", "");
        this.apiKey = serviceRoleKey.isBlank() ? publishableKey : serviceRoleKey;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "OPTIONS".equalsIgnoreCase(request.getMethod())
                || path.startsWith("/ws")
                || path.startsWith("/actuator/health");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }
        if (supabaseUrl.isBlank() || apiKey.isBlank()) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            String token = authorization.substring("Bearer ".length()).trim();
            JsonNode user = restClient.get()
                    .uri(supabaseUrl + "/auth/v1/user")
                    .header("apikey", apiKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .body(JsonNode.class);

            if (user != null && user.hasNonNull("id")) {
                Jwt jwt = jwtFromUser(token, user);
                SecurityContextHolder.getContext().setAuthentication(
                        new UsernamePasswordAuthenticationToken(jwt, token, List.of())
                );
            }
        } catch (RestClientResponseException ignored) {
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request, response);
    }

    private Jwt jwtFromUser(String token, JsonNode user) {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", user.path("id").asText());
        putText(claims, user, "email");
        putText(claims, user, "phone");
        putObject(claims, user, "user_metadata");
        putObject(claims, user, "app_metadata");

        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plusSeconds(3600);
        return new Jwt(token, issuedAt, expiresAt, Map.of("alg", "supabase"), claims);
    }

    private void putText(Map<String, Object> claims, JsonNode user, String field) {
        if (user.hasNonNull(field)) claims.put(field, user.path(field).asText());
    }

    private void putObject(Map<String, Object> claims, JsonNode user, String field) {
        JsonNode value = user.get(field);
        if (value == null || value.isNull()) return;
        claims.put(field, objectMapper.convertValue(value, new TypeReference<Map<String, Object>>() {}));
    }
}
