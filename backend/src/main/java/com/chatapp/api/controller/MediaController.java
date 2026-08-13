package com.chatapp.api.controller;

import com.chatapp.api.model.MediaUploadResponse;
import com.chatapp.api.service.StorageService;
import com.chatapp.api.service.UserContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@RestController
@RequestMapping("/api/media")
public class MediaController {
    private final StorageService storageService;
    private final UserContext userContext;

    public MediaController(StorageService storageService, UserContext userContext) {
        this.storageService = storageService;
        this.userContext = userContext;
    }

    @PostMapping(value = "/{bucket}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public MediaUploadResponse upload(
            @PathVariable("bucket") String bucket,
            @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return storageService.upload(bucket, userContext.requireUserId(jwt), file);
    }

    @GetMapping("/files/{bucket}/{userId}/{filename:.+}")
    public ResponseEntity<Resource> file(
            @PathVariable("bucket") String bucket,
            @PathVariable("userId") UUID userId,
            @PathVariable("filename") String filename
    ) throws IOException {
        Path file = storageService.localFile(bucket, userId, filename);
        String contentType = Files.probeContentType(file);
        MediaType mediaType = contentType == null
                ? MediaType.APPLICATION_OCTET_STREAM
                : MediaType.parseMediaType(contentType);
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400")
                .body(new FileSystemResource(file));
    }
}
