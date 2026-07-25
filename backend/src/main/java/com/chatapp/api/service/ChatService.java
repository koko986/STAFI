package com.chatapp.api.service;

import com.chatapp.api.model.Conversation;
import com.chatapp.api.model.Message;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class ChatService {
    private static final UUID DEMO_USER_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private final Map<UUID, Conversation> conversations = new ConcurrentHashMap<>();
    private final Map<UUID, List<Message>> messagesByConversation = new ConcurrentHashMap<>();

    public ChatService() {
        seedConversation("11111111-1111-1111-1111-111111111111", "direct", "Mingalar",
                "Welcome to Java Chat. Send a message or record a voice note.");
        seedConversation("22222222-2222-2222-2222-222222222222", "group", "Project Team",
                "The project room is ready.");
        seedConversation("33333333-3333-3333-3333-333333333333", "ai_private", "AI Assistant",
                "Ask me to summarize a conversation or draft a reply.");
    }

    public List<Conversation> listConversations(UUID userId) {
        return conversations.values().stream().toList();
    }

    public Conversation createConversation(Conversation request, UUID userId) {
        Conversation conversation = new Conversation(
                UUID.randomUUID(),
                request.type(),
                request.title(),
                userId,
                Instant.now()
        );
        conversations.put(conversation.id(), conversation);
        messagesByConversation.put(conversation.id(), new CopyOnWriteArrayList<>());
        return conversation;
    }

    public List<Message> listMessages(UUID conversationId, UUID userId) {
        return messagesByConversation.getOrDefault(conversationId, List.of());
    }

    public Message addMessage(Message request, UUID userId) {
        Message message = request.withServerFields(userId);
        messagesByConversation.computeIfAbsent(message.conversationId(), ignored -> new CopyOnWriteArrayList<>()).add(message);
        return message;
    }

    private void seedConversation(String id, String type, String title, String welcome) {
        UUID conversationId = UUID.fromString(id);
        Instant createdAt = Instant.now();
        conversations.put(conversationId, new Conversation(conversationId, type, title, DEMO_USER_ID, createdAt));
        messagesByConversation.put(conversationId, new CopyOnWriteArrayList<>(List.of(
                new Message(UUID.randomUUID(), conversationId, UUID.randomUUID(), "text", welcome, null, createdAt)
        )));
    }
}
