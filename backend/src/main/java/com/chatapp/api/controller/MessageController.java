package com.chatapp.api.controller;

import com.chatapp.api.model.ForwardMessageRequest;
import com.chatapp.api.model.Message;
import com.chatapp.api.model.MessageReactionRequest;
import com.chatapp.api.model.ReadReceipt;
import com.chatapp.api.service.ChatService;
import com.chatapp.api.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
        UUID userId = userContext.requireUserId(jwt);
        List<Message> messages = chatService.listMessages(conversationId, userId);
        if (!messages.isEmpty()) {
            messagingTemplate.convertAndSend(
                    "/topic/conversations/" + conversationId + "/receipts",
                    new ReadReceipt(conversationId, userId, messages.get(messages.size() - 1).id())
            );
        }
        return messages;
    }

    @PostMapping("/messages")
    public Message send(@Valid @RequestBody Message request, @AuthenticationPrincipal Jwt jwt) {
        Message message = chatService.addMessage(request, userContext.requireUserId(jwt));
        messagingTemplate.convertAndSend("/topic/conversations/" + message.conversationId(), message.forBroadcast());
        return message;
    }

    @DeleteMapping("/messages/{messageId}")
    public Message delete(@PathVariable("messageId") UUID messageId, @AuthenticationPrincipal Jwt jwt) {
        Message message = chatService.deleteMessage(messageId, userContext.requireUserId(jwt));
        messagingTemplate.convertAndSend("/topic/conversations/" + message.conversationId(), message.forBroadcast());
        return message;
    }

    @PostMapping("/messages/{messageId}/forward")
    public Message forward(
            @PathVariable("messageId") UUID messageId,
            @Valid @RequestBody ForwardMessageRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Message message = chatService.forwardMessage(
                messageId,
                request.conversationId(),
                userContext.requireUserId(jwt)
        );
        messagingTemplate.convertAndSend("/topic/conversations/" + message.conversationId(), message.forBroadcast());
        return message;
    }

    @PutMapping("/messages/{messageId}/reaction")
    public Message react(
            @PathVariable("messageId") UUID messageId,
            @Valid @RequestBody MessageReactionRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        Message message = chatService.reactToMessage(messageId, userContext.requireUserId(jwt), request.emoji());
        messagingTemplate.convertAndSend("/topic/conversations/" + message.conversationId(), message.forBroadcast());
        return message;
    }

    @DeleteMapping("/messages/{messageId}/reaction")
    public Message removeReaction(@PathVariable("messageId") UUID messageId, @AuthenticationPrincipal Jwt jwt) {
        Message message = chatService.removeMessageReaction(messageId, userContext.requireUserId(jwt));
        messagingTemplate.convertAndSend("/topic/conversations/" + message.conversationId(), message.forBroadcast());
        return message;
    }
}
