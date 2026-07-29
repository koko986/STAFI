package com.chatapp.api.controller;

import com.chatapp.api.model.Story;
import com.chatapp.api.model.StoryReactionRequest;
import com.chatapp.api.model.StoryReplyRequest;
import com.chatapp.api.service.UserContext;
import com.chatapp.api.service.StoryService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
    public List<Story> list(@AuthenticationPrincipal Jwt jwt) {
        return storyService.listActive(userContext.requireUserId(jwt));
    }

    @PostMapping
    public Story create(@Valid @RequestBody Story request, @AuthenticationPrincipal Jwt jwt) {
        return storyService.create(request, userContext.requireUserId(jwt));
    }

    @PostMapping("/{storyId}/views")
    public Story viewed(
            @PathVariable("storyId") java.util.UUID storyId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return storyService.markViewed(storyId, userContext.requireUserId(jwt));
    }

    @PutMapping("/{storyId}/reaction")
    public Story react(
            @PathVariable("storyId") java.util.UUID storyId,
            @Valid @RequestBody StoryReactionRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return storyService.react(storyId, userContext.requireUserId(jwt), request.emoji());
    }

    @DeleteMapping("/{storyId}/reaction")
    public ResponseEntity<Void> removeReaction(
            @PathVariable("storyId") java.util.UUID storyId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        storyService.removeReaction(storyId, userContext.requireUserId(jwt));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{storyId}/replies")
    public Story reply(
            @PathVariable("storyId") java.util.UUID storyId,
            @Valid @RequestBody StoryReplyRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return storyService.reply(storyId, userContext.requireUserId(jwt), request.body());
    }

    @DeleteMapping("/{storyId}")
    public ResponseEntity<Void> delete(
            @PathVariable("storyId") java.util.UUID storyId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        storyService.delete(storyId, userContext.requireUserId(jwt));
        return ResponseEntity.noContent().build();
    }
}
