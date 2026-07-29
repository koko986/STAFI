package com.chatapp.api.service;

import com.chatapp.api.model.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ProfileService {
    private static final UUID DEMO_USER_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private final Map<UUID, Profile> profiles = new ConcurrentHashMap<>();

    public ProfileService() {
        profiles.put(DEMO_USER_ID, profile(DEMO_USER_ID, "Demo User", "demo_user", "Exploring Java Chat."));
        profiles.put(UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                profile(UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "Aye Aye", "aye_codes", "Java developer and coffee enthusiast."));
        profiles.put(UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc"),
                profile(UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc"), "Min Khant", "minkhant", "Building useful things with friends."));
        profiles.put(UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd"),
                profile(UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd"), "Su Myat", "sumyat", "Design, music, and weekend stories."));
        profiles.put(UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
                profile(UUID.fromString("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"), "Project Crew", "project_crew", "Students shipping their final project."));
    }

    public Profile getOrCreate(UUID userId, Jwt jwt) {
        return profiles.computeIfAbsent(userId, ignored -> new Profile(
                userId,
                claim(jwt, "full_name", claim(jwt, "name", "New User")),
                suggestedUsername(jwt, userId),
                "",
                claim(jwt, "avatar_url", claim(jwt, "picture", null)),
                "system",
                "#2563eb",
                false
        ));
    }

    public Profile update(UUID userId, Profile request, Jwt jwt) {
        String username = request.username().trim().toLowerCase(Locale.ROOT);
        boolean taken = profiles.values().stream()
                .anyMatch(profile -> !profile.id().equals(userId) && profile.username().equalsIgnoreCase(username));
        if (taken) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That username is already taken.");
        }

        Profile current = getOrCreate(userId, jwt);
        Profile updated = new Profile(
                userId,
                request.displayName().trim(),
                username,
                request.bio() == null ? "" : request.bio().trim(),
                request.avatarPath(),
                request.themeMode() == null ? current.themeMode() : request.themeMode(),
                request.accentColor() == null ? current.accentColor() : request.accentColor(),
                true
        );
        profiles.put(userId, updated);
        return updated;
    }

    public java.util.List<Profile> search(String query, UUID currentUserId) {
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        return profiles.values().stream()
                .filter(profile -> profile.onboarded() && !profile.id().equals(currentUserId))
                .filter(profile -> needle.isBlank()
                        || profile.displayName().toLowerCase(Locale.ROOT).contains(needle)
                        || profile.username().toLowerCase(Locale.ROOT).contains(needle))
                .sorted(Comparator.comparing(Profile::displayName))
                .limit(20)
                .toList();
    }

    public Optional<Profile> find(UUID profileId) {
        return Optional.ofNullable(profiles.get(profileId));
    }

    private Profile profile(UUID id, String displayName, String username, String bio) {
        return new Profile(id, displayName, username, bio, null, "system", "#2563eb", true);
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
