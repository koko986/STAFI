package com.chatapp.api.controller;

import com.chatapp.api.model.Story;
import com.chatapp.api.service.UserContext;
import com.chatapp.api.service.StoryService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/stories")
public class StoryController {
    private final UserContext userContext;
    private final StoryService storyService;

    public StoryController(UserContext userContext, StoryService storyService) {
        this.userContext = userContext;
        this.storyService = storyService;
    }

    @GetMapping
    public List<Story> list() {
        return storyService.listActive();
    }

    @PostMapping
    public Story create(@Valid @RequestBody Story request, @AuthenticationPrincipal Jwt jwt) {
        return storyService.create(request, userContext.requireUserId(jwt));
    }
}
