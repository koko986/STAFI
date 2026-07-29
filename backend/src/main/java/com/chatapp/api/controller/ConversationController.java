package com.chatapp.api.controller;

import com.chatapp.api.model.Conversation;
import com.chatapp.api.model.DirectConversationRequest;
import com.chatapp.api.model.GroupConversationRequest;
import com.chatapp.api.service.ChatService;
import com.chatapp.api.service.UserContext;
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
@RequestMapping("/api/conversations")
public class ConversationController {
    private final ChatService chatService;
    private final UserContext userContext;

    public ConversationController(ChatService chatService, UserContext userContext) {
        this.chatService = chatService;
        this.userContext = userContext;
    }

    @GetMapping
    public List<Conversation> list(@AuthenticationPrincipal Jwt jwt) {
        return chatService.listConversations(userContext.requireUserId(jwt));
    }

    @PostMapping
    public Conversation create(@Valid @RequestBody Conversation request, @AuthenticationPrincipal Jwt jwt) {
        return chatService.createConversation(request, userContext.requireUserId(jwt));
    }

    @PostMapping("/direct")
    public Conversation direct(
            @Valid @RequestBody DirectConversationRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return chatService.startDirectConversation(
                userContext.requireUserId(jwt),
                request.profileId()
        );
    }

    @PostMapping("/groups")
    public Conversation group(
            @Valid @RequestBody GroupConversationRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return chatService.createGroup(
                userContext.requireUserId(jwt),
                request.title(),
                request.memberIds()
        );
    }
}
