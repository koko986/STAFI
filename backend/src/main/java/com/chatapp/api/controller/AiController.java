package com.chatapp.api.controller;

import com.chatapp.api.model.AiRequest;
import com.chatapp.api.model.AiResponse;
import com.chatapp.api.service.AiService;
import com.chatapp.api.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    private final AiService aiService;
    private final UserContext userContext;

    public AiController(AiService aiService, UserContext userContext) {
        this.aiService = aiService;
        this.userContext = userContext;
    }

    @PostMapping("/chat")
    public AiResponse chat(@Valid @RequestBody AiRequest request, @AuthenticationPrincipal Jwt jwt) {
        return aiService.respond(request, userContext.requireUserId(jwt));
    }

    @PostMapping("/summarize")
    public AiResponse summarize(@Valid @RequestBody AiRequest request, @AuthenticationPrincipal Jwt jwt) {
        return aiService.respond(
                new AiRequest(request.conversationId(), "summarize", request.prompt()),
                userContext.requireUserId(jwt)
        );
    }

    @PostMapping("/draft-reply")
    public AiResponse draftReply(@Valid @RequestBody AiRequest request, @AuthenticationPrincipal Jwt jwt) {
        return aiService.respond(
                new AiRequest(request.conversationId(), "draft-reply", request.prompt()),
                userContext.requireUserId(jwt)
        );
    }

    @PostMapping("/question")
    public AiResponse question(@Valid @RequestBody AiRequest request, @AuthenticationPrincipal Jwt jwt) {
        return aiService.respond(
                new AiRequest(request.conversationId(), "question", request.prompt()),
                userContext.requireUserId(jwt)
        );
    }
}
