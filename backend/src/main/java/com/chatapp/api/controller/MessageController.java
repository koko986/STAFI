package com.chatapp.api.controller;

import com.chatapp.api.model.Message;
import com.chatapp.api.service.ChatService;
import com.chatapp.api.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class MessageController {
    private final ChatService chatService;
    private final UserContext userContext;
    private final SimpMessagingTemplate messagingTemplate;

    public MessageController(ChatService chatService, UserContext userContext, SimpMessagingTemplate messagingTemplate) {
        this.chatService = chatService;
        this.userContext = userContext;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/conversations/{conversationId}/messages")
    public List<Message> list(
            @PathVariable("conversationId") UUID conversationId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return chatService.listMessages(conversationId, userContext.requireUserId(jwt));
    }

    @PostMapping("/messages")
    public Message send(@Valid @RequestBody Message request, @AuthenticationPrincipal Jwt jwt) {
        Message message = chatService.addMessage(request, userContext.requireUserId(jwt));
        messagingTemplate.convertAndSend("/topic/conversations/" + message.conversationId(), message);
        return message;
    }
}
