package com.chatapp.api.controller;

import com.chatapp.api.model.MediaUploadResponse;
import com.chatapp.api.service.StorageService;
import com.chatapp.api.service.UserContext;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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
}
