package com.chatapp.api.service;

import com.chatapp.api.model.MediaUploadResponse;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class StorageService {
    private static final Logger log = LoggerFactory.getLogger(StorageService.class);
    private static final long STORY_VIDEO_MAX_BYTES = 12L * 1024 * 1024;
    private static final long CHAT_FILE_MAX_BYTES = 200L * 1024 * 1024;
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
            ),
            "chat-files", new BucketRules(
                    CHAT_FILE_MAX_BYTES,
                    Set.of(
                            "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
                            "video/mp4", "video/webm", "video/quicktime",
                            "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm",
                            "application/pdf", "application/zip",
                            "application/msword",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "application/vnd.ms-excel",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/vnd.ms-powerpoint",
                            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                            "text/plain", "text/csv", "text/markdown"
                    ),
                    false
            )
    );

    private static final Map<String, String> EXTENSIONS = Map.ofEntries(
            Map.entry("image/jpeg", "jpg"),
            Map.entry("image/png", "png"),
            Map.entry("image/webp", "webp"),
            Map.entry("image/gif", "gif"),
            Map.entry("image/heic", "heic"),
            Map.entry("image/heif", "heif"),
            Map.entry("audio/webm", "webm"),
            Map.entry("audio/ogg", "ogg"),
            Map.entry("audio/mpeg", "mp3"),
            Map.entry("audio/mp4", "m4a"),
            Map.entry("audio/wav", "wav"),
            Map.entry("video/mp4", "mp4"),
            Map.entry("video/webm", "webm"),
            Map.entry("video/quicktime", "mov"),
            Map.entry("application/pdf", "pdf"),
            Map.entry("application/zip", "zip"),
            Map.entry("application/msword", "doc"),
            Map.entry("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
            Map.entry("application/vnd.ms-excel", "xls"),
            Map.entry("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
            Map.entry("application/vnd.ms-powerpoint", "ppt"),
            Map.entry("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"),
            Map.entry("text/plain", "txt"),
            Map.entry("text/csv", "csv"),
            Map.entry("text/markdown", "md")
    );

    private final RestClient restClient;
    private final String supabaseUrl;
    private final String serviceKey;
    private final String publicBaseUrl;
    private final Path localUploadRoot;
    private final Set<String> ensuredBuckets = ConcurrentHashMap.newKeySet();

    public StorageService(
            RestClient.Builder restClientBuilder,
            @Value("${app.supabase-url:}") String supabaseUrl,
            @Value("${app.supabase-service-role-key:}") String serviceKey,
            @Value("${app.public-base-url:http://localhost:${server.port:8080}}") String publicBaseUrl,
            @Value("${app.local-upload-dir:uploads}") String localUploadDir
    ) {
        this.restClient = restClientBuilder.build();
        this.supabaseUrl = supabaseUrl.replaceAll("/+$", "");
        this.serviceKey = serviceKey;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
        this.localUploadRoot = Path.of(localUploadDir).toAbsolutePath().normalize();
    }

    public MediaUploadResponse upload(String bucket, UUID userId, MultipartFile file) {
        BucketRules rules = BUCKETS.get(bucket);
        if (rules == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported media bucket.");
        }
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a file to upload.");
        }

        String contentType = normalizeContentType(file);
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
        if (!isSupabaseConfigured()) {
            return saveLocal(bucket, path, file);
        }
        ensureBucket(bucket);
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
        BucketRules rules = BUCKETS.get(bucket);
        if (rules == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported media bucket.");
        }
        if (path.startsWith("local/")) {
            return localUrl(path);
        }
        requireConfigured();
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
        if (!BUCKETS.containsKey(bucket)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported media bucket.");
        }
        if (path.startsWith("local/")) {
            deleteLocal(path);
            return;
        }
        requireConfigured();
        restClient.delete()
                .uri(supabaseUrl + "/storage/v1/object/" + bucket + "/" + path)
                .header("apikey", serviceKey)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                .retrieve()
                .toBodilessEntity();
    }

    public Path localFile(String bucket, UUID userId, String filename) {
        if (!BUCKETS.containsKey(bucket)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported media bucket.");
        }
        Path target = localUploadRoot.resolve(bucket).resolve(userId.toString()).resolve(filename).normalize();
        if (!target.startsWith(localUploadRoot) || !Files.isRegularFile(target)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Media file not found.");
        }
        return target;
    }

    private void requireConfigured() {
        if (supabaseUrl.isBlank() || serviceKey.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Supabase storage is not configured on the Java backend."
                );
        }
    }

    private boolean isSupabaseConfigured() {
        return !supabaseUrl.isBlank() && !serviceKey.isBlank();
    }

    private MediaUploadResponse saveLocal(String bucket, String path, MultipartFile file) {
        Path target = localUploadRoot.resolve(bucket).resolve(path).normalize();
        if (!target.startsWith(localUploadRoot)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid upload path.");
        }
        try {
            Files.createDirectories(target.getParent());
            file.transferTo(target);
            String localPath = "local/" + bucket + "/" + path;
            return new MediaUploadResponse(localPath, localUrl(localPath));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not store the uploaded file.", exception);
        }
    }

    private String localUrl(String localPath) {
        return publicBaseUrl + "/api/media/files/" + localPath.replaceFirst("^local/", "");
    }

    private void deleteLocal(String localPath) {
        Path target = localUploadRoot.resolve(localPath.replaceFirst("^local/", "")).normalize();
        if (!target.startsWith(localUploadRoot)) return;
        try {
            Files.deleteIfExists(target);
        } catch (IOException exception) {
            log.warn("Could not delete local media '{}': {}", localPath, exception.getMessage());
        }
    }

    private void ensureBucket(String bucket) {
        if (!ensuredBuckets.add(bucket)) return;
        BucketRules rules = BUCKETS.get(bucket);
        if (rules == null) return;
        try {
            restClient.get()
                    .uri(supabaseUrl + "/storage/v1/bucket/" + bucket)
                    .header("apikey", serviceKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                    .retrieve()
                    .toBodilessEntity();
            return;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() != 404) {
                log.warn("Could not check Supabase storage bucket '{}': {}", bucket, exception.getMessage());
            }
        }
        try {
            restClient.post()
                    .uri(supabaseUrl + "/storage/v1/bucket")
                    .header("apikey", serviceKey)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "id", bucket,
                            "name", bucket,
                            "public", rules.publicRead()
                    ))
                    .retrieve()
                    .toBodilessEntity();
            log.info("Created Supabase storage bucket '{}'.", bucket);
        } catch (RuntimeException exception) {
            log.warn("Could not create Supabase storage bucket '{}': {}", bucket, exception.getMessage());
        }
    }

    private String normalizeContentType(MultipartFile file) {
        String contentType = file.getContentType() == null
                ? ""
                : file.getContentType().split(";", 2)[0].trim().toLowerCase();
        if (!contentType.isBlank() && !"application/octet-stream".equals(contentType) && !"image/jpg".equals(contentType)) {
            return contentType;
        }
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".heic")) return "image/heic";
        if (name.endsWith(".heif")) return "image/heif";
        if (name.endsWith(".mp4")) return "video/mp4";
        if (name.endsWith(".webm")) return "video/webm";
        if (name.endsWith(".mov")) return "video/quicktime";
        if (name.endsWith(".mp3")) return "audio/mpeg";
        if (name.endsWith(".m4a")) return "audio/mp4";
        if (name.endsWith(".wav")) return "audio/wav";
        if (name.endsWith(".ogg")) return "audio/ogg";
        if (name.endsWith(".pdf")) return "application/pdf";
        if (name.endsWith(".zip")) return "application/zip";
        if (name.endsWith(".doc")) return "application/msword";
        if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (name.endsWith(".xls")) return "application/vnd.ms-excel";
        if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (name.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
        if (name.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        if (name.endsWith(".txt")) return "text/plain";
        if (name.endsWith(".csv")) return "text/csv";
        if (name.endsWith(".md")) return "text/markdown";
        return contentType;
    }

    private record BucketRules(long maxBytes, Set<String> contentTypes, boolean publicRead) {
    }
}
