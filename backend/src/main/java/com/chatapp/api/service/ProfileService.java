package com.chatapp.api.service;

import com.chatapp.api.model.Profile;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class ProfileService {
    private final SupabaseDatabase database;

    public ProfileService(SupabaseDatabase database) {
        this.database = database;
    }

    public Profile getOrCreate(UUID userId, Jwt jwt) {
        Optional<Profile> existing = find(userId);
        if (existing.isPresent()) return existing.get();

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", userId);
        row.put("display_name", claim(jwt, "full_name", claim(jwt, "name", "New User")));
        row.put("username", suggestedUsername(jwt, userId));
        row.put("bio", "");
        row.put("avatar_path", claim(jwt, "avatar_url", claim(jwt, "picture", null)));
        row.put("theme_mode", "system");
        row.put("accent_color", "#2563eb");
        row.put("onboarded", false);
        return toProfile(database.first(database.insert("profiles", row)));
    }

    public Profile update(UUID userId, Profile request, Jwt jwt) {
        Profile current = getOrCreate(userId, jwt);
        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put("display_name", request.displayName().trim());
        updates.put("username", request.username().trim().toLowerCase(Locale.ROOT));
        updates.put("bio", request.bio() == null ? "" : request.bio().trim());
        updates.put("avatar_path", request.avatarPath());
        updates.put("theme_mode", request.themeMode() == null ? current.themeMode() : request.themeMode());
        updates.put("accent_color", request.accentColor() == null ? current.accentColor() : request.accentColor());
        updates.put("onboarded", true);

        JsonNode saved = database.first(database.update(
                "profiles",
                Map.of("id", "eq." + userId),
                updates
        ));
        return toProfile(saved);
    }

    public List<Profile> search(String query, UUID currentUserId) {
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        needle = needle.replaceFirst("^@+", "");
        needle = needle.replaceAll("[,*()]", "");
        needle = needle.substring(0, Math.min(needle.length(), 48));
        String normalizedNeedle = needle;

        Map<String, String> parameters = new LinkedHashMap<>();
        parameters.put("select", "*");
        parameters.put("id", "neq." + currentUserId);
        parameters.put("onboarded", "eq.true");
        parameters.put("order", "display_name.asc");
        parameters.put("limit", "20");
        if (!needle.isBlank()) {
            parameters.put("or", "(display_name.ilike.*" + needle + "*,username.ilike.*" + needle + "*)");
        }

        JsonNode rows = database.query("profiles", parameters);
        List<Profile> profiles = new ArrayList<>();
        if (rows != null && rows.isArray()) rows.forEach(row -> profiles.add(toProfile(row)));
        if (!normalizedNeedle.isBlank()) {
            profiles.sort((left, right) -> {
                boolean leftExact = left.username().equalsIgnoreCase(normalizedNeedle);
                boolean rightExact = right.username().equalsIgnoreCase(normalizedNeedle);
                if (leftExact != rightExact) return leftExact ? -1 : 1;
                return left.displayName().compareToIgnoreCase(right.displayName());
            });
        }
        return profiles;
    }

    public Optional<Profile> find(UUID profileId) {
        JsonNode row = database.first(database.query(
                "profiles",
                Map.of(
                        "id", "eq." + profileId,
                        "select", "*",
                        "limit", "1"
                )
        ));
        return Optional.ofNullable(row).map(this::toProfile);
    }

    private Profile toProfile(JsonNode row) {
        if (row == null) throw new IllegalStateException("Supabase did not return a profile.");
        return new Profile(
                UUID.fromString(row.path("id").asText()),
                row.path("display_name").asText("New User"),
                row.path("username").asText(),
                row.path("bio").asText(""),
                textOrNull(row, "avatar_path"),
                row.path("theme_mode").asText("system"),
                row.path("accent_color").asText("#2563eb"),
                row.path("onboarded").asBoolean(false)
        );
    }

    private String textOrNull(JsonNode row, String field) {
        JsonNode value = row.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    @SuppressWarnings("unchecked")
    private String claim(Jwt jwt, String name, String fallback) {
        if (jwt == null) return fallback;
        Object direct = jwt.getClaims().get(name);
        if (direct instanceof String value && !value.isBlank()) return value;
        Object metadata = jwt.getClaims().get("user_metadata");
        if (metadata instanceof Map<?, ?> values) {
            Object nested = ((Map<String, Object>) values).get(name);
            if (nested instanceof String value && !value.isBlank()) return value;
        }
        return fallback;
    }

    private String suggestedUsername(Jwt jwt, UUID userId) {
        String email = claim(jwt, "email", "");
        String base = email.contains("@") ? email.substring(0, email.indexOf('@')) : "user";
        base = base.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_]", "");
        if (base.length() < 3) base = "user";
        if (base.length() > 18) base = base.substring(0, 18);
        return base + "_" + userId.toString().substring(0, 5);
    }
}
