package com.chatapp.api.service;

import com.chatapp.api.model.MediaUploadResponse;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class StorageService {
    private static final long STORY_VIDEO_MAX_BYTES = 12L * 1024 * 1024;
    private static final Map<String, BucketRules> BUCKETS = Map.of(
            "avatars", new BucketRules(
                    5L * 1024 * 1024,
                    Set.of("image/jpeg", "image/png", "image/webp"),
                    true
            ),
            "voice-messages", new BucketRules(
                    10L * 1024 * 1024,
                    Set.of("audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4"),
                    false
            ),
            "stories", new BucketRules(
                    25L * 1024 * 1024,
                    Set.of("image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"),
                    false
            )
    );

    private static final Map<String, String> EXTENSIONS = Map.ofEntries(
            Map.entry("image/jpeg", "jpg"),
            Map.entry("image/png", "png"),
            Map.entry("image/webp", "webp"),
            Map.entry("audio/webm", "webm"),
            Map.entry("audio/ogg", "ogg"),
            Map.entry("audio/mpeg", "mp3"),
            Map.entry("audio/mp4", "m4a"),
            Map.entry("video/mp4", "mp4"),
            Map.entry("video/webm", "webm")
    );

    private final RestClient restClient;
    private final String supabaseUrl;
    private final String serviceKey;

    public StorageService(
            RestClient.Builder restClientBuilder,
            @Value("${app.supabase-url:}") String supabaseUrl,
            @Value("${app.supabase-service-role-key:}") String serviceKey
    ) {
        this.restClient = restClientBuilder.build();
        this.supabaseUrl = supabaseUrl.replaceAll("/+$", "");
        this.serviceKey = serviceKey;
    }

    public MediaUploadResponse upload(String bucket, UUID userId, MultipartFile file) {
        requireConfigured();
        BucketRules rules = BUCKETS.get(bucket);
        if (rules == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported media bucket.");
        }
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a file to upload.");
        }

        String contentType = normalizeContentType(file.getContentType());
        if (!rules.contentTypes().contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "This file type is not supported.");
        }
        if (file.getSize() > rules.maxBytes()) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "The selected file is too large.");
        }
        if ("stories".equals(bucket) && contentType.startsWith("video/") && file.getSize() > STORY_VIDEO_MAX_BYTES) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Story videos must be 12 MB or smaller."
            );
        }

        String path = userId + "/" + UUID.randomUUID() + "." + EXTENSIONS.get(contentType);
        try {
            restClient.post()
                    .uri(supabaseUrl + "/storage/v1/object/" + bucket + "/" + path)
                    .header("apikey", serviceKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                    .header("x-upsert", "false")
                    .contentType(org.springframework.http.MediaType.parseMediaType(contentType))
                    .body(file.getBytes())
                    .retrieve()
                    .toBodilessEntity();

            String url = resolveUrl(bucket, path);
            return new MediaUploadResponse(path, url);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the uploaded file.", exception);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Supabase could not store the file. Check the storage configuration.",
                    exception
            );
        }
    }

    public String resolveUrl(String bucket, String path) {
        if (path == null || path.isBlank() || path.startsWith("http://") || path.startsWith("https://")) {
            return path;
        }
        requireConfigured();
        BucketRules rules = BUCKETS.get(bucket);
        if (rules == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported media bucket.");
        }
        if (rules.publicRead()) {
            return supabaseUrl + "/storage/v1/object/public/" + bucket + "/" + path;
        }

        JsonNode response = restClient.post()
                .uri(supabaseUrl + "/storage/v1/object/sign/" + bucket + "/" + path)
                .header("apikey", serviceKey)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                .body(Map.of("expiresIn", 24 * 60 * 60))
                .retrieve()
                .body(JsonNode.class);

        String signedUrl = response == null ? "" : response.path("signedURL").asText("");
        if (signedUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Supabase did not return a media URL.");
        }
        return signedUrl.startsWith("http") ? signedUrl : supabaseUrl + "/storage/v1" + signedUrl;
    }

    public void delete(String bucket, String path) {
        if (path == null || path.isBlank() || path.startsWith("http://") || path.startsWith("https://")) {
            return;
        }
        requireConfigured();
        if (!BUCKETS.containsKey(bucket)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported media bucket.");
        }
        restClient.delete()
                .uri(supabaseUrl + "/storage/v1/object/" + bucket + "/" + path)
                .header("apikey", serviceKey)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                .retrieve()
                .toBodilessEntity();
    }

    private void requireConfigured() {
        if (supabaseUrl.isBlank() || serviceKey.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Supabase storage is not configured on the Java backend."
            );
        }
    }

    private String normalizeContentType(String contentType) {
        if (contentType == null) return "";
        return contentType.split(";", 2)[0].trim().toLowerCase();
    }

    private record BucketRules(long maxBytes, Set<String> contentTypes, boolean publicRead) {
    }
}
