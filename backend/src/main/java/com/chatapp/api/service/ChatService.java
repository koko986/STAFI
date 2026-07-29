package com.chatapp.api.service;

import com.chatapp.api.model.Conversation;
import com.chatapp.api.model.Message;
import com.chatapp.api.model.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class ChatService {
    private static final UUID DEMO_USER_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private final Map<UUID, Conversation> conversations = new ConcurrentHashMap<>();
    private final Map<UUID, Set<UUID>> membersByConversation = new ConcurrentHashMap<>();
    private final Map<UUID, List<Message>> messagesByConversation = new ConcurrentHashMap<>();
    private final ProfileService profileService;

    public ChatService(ProfileService profileService) {
        this.profileService = profileService;
        seedConversation("11111111-1111-1111-1111-111111111111", "direct", null,
                Set.of(DEMO_USER_ID, UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")),
                "Welcome to Java Chat. Send a message or record a voice note.");
        seedConversation("22222222-2222-2222-2222-222222222222", "group", "Project Team",
                Set.of(
                        DEMO_USER_ID,
                        UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                        UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc")
                ),
                "The project room is ready.");
    }

    public List<Conversation> listConversations(UUID userId) {
        ensureAiConversation(userId);
        return conversations.values().stream()
                .filter(conversation -> isMember(conversation.id(), userId))
                .sorted(Comparator.comparing(Conversation::createdAt).reversed())
                .map(conversation -> viewFor(conversation, userId))
                .toList();
    }

    public Conversation createConversation(Conversation request, UUID userId) {
        Conversation conversation = create(
                request.type(),
                request.title(),
                userId,
                Set.of(userId)
        );
        return viewFor(conversation, userId);
    }

    public Conversation startDirectConversation(UUID userId, UUID profileId) {
        if (userId.equals(profileId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot start a chat with yourself.");
        }
        profileService.find(profileId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found."));

        Conversation existing = conversations.values().stream()
                .filter(conversation -> conversation.type().equals("direct"))
                .filter(conversation -> {
                    Set<UUID> members = membersByConversation.getOrDefault(conversation.id(), Set.of());
                    return members.size() == 2 && members.contains(userId) && members.contains(profileId);
                })
                .findFirst()
                .orElse(null);
        if (existing != null) return viewFor(existing, userId);

        Conversation conversation = create("direct", null, userId, Set.of(userId, profileId));
        messagesByConversation.get(conversation.id()).add(systemMessage(
                conversation.id(),
                "You are connected. Say hello!"
        ));
        return viewFor(conversation, userId);
    }

    public Conversation createGroup(UUID userId, String title, List<UUID> memberIds) {
        Set<UUID> members = new LinkedHashSet<>(memberIds);
        members.add(userId);
        if (members.size() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select at least one group member.");
        }
        members.forEach(memberId -> profileService.find(memberId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "A selected profile was not found."
                )));

        Conversation conversation = create("group", title.trim(), userId, members);
        messagesByConversation.get(conversation.id()).add(systemMessage(
                conversation.id(),
                userDisplayName(userId) + " created the group."
        ));
        return viewFor(conversation, userId);
    }

    public List<Message> listMessages(UUID conversationId, UUID userId) {
        requireMembership(conversationId, userId);
        return List.copyOf(messagesByConversation.getOrDefault(conversationId, List.of()));
    }

    public Message addMessage(Message request, UUID userId) {
        requireMembership(request.conversationId(), userId);
        Message message = request.withServerFields(userId);
        messagesByConversation
                .computeIfAbsent(message.conversationId(), ignored -> new CopyOnWriteArrayList<>())
                .add(message);
        return message;
    }

    private Conversation create(String type, String title, UUID createdBy, Set<UUID> members) {
        Conversation conversation = new Conversation(
                UUID.randomUUID(),
                type,
                title,
                createdBy,
                Instant.now()
        );
        conversations.put(conversation.id(), conversation);
        membersByConversation.put(conversation.id(), ConcurrentHashMap.newKeySet());
        membersByConversation.get(conversation.id()).addAll(members);
        messagesByConversation.put(conversation.id(), new CopyOnWriteArrayList<>());
        return conversation;
    }

    private void ensureAiConversation(UUID userId) {
        boolean exists = conversations.values().stream()
                .anyMatch(conversation -> conversation.type().equals("ai_private")
                        && isMember(conversation.id(), userId));
        if (exists) return;
        Conversation conversation = create("ai_private", "AI Assistant", userId, Set.of(userId));
        messagesByConversation.get(conversation.id()).add(systemMessage(
                conversation.id(),
                "Ask me to summarize a conversation or draft a reply."
        ));
    }

    private Conversation viewFor(Conversation conversation, UUID userId) {
        if (!conversation.type().equals("direct")) return conversation;
        UUID otherUserId = membersByConversation.getOrDefault(conversation.id(), Set.of()).stream()
                .filter(memberId -> !memberId.equals(userId))
                .findFirst()
                .orElse(userId);
        return new Conversation(
                conversation.id(),
                conversation.type(),
                userDisplayName(otherUserId),
                conversation.createdBy(),
                conversation.createdAt()
        );
    }

    private String userDisplayName(UUID userId) {
        return profileService.find(userId).map(Profile::displayName).orElse("Java Chat user");
    }

    private boolean isMember(UUID conversationId, UUID userId) {
        return membersByConversation.getOrDefault(conversationId, Set.of()).contains(userId);
    }

    private void requireMembership(UUID conversationId, UUID userId) {
        if (!conversations.containsKey(conversationId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found.");
        }
        if (!isMember(conversationId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a member of this conversation.");
        }
    }

    private Message systemMessage(UUID conversationId, String body) {
        return new Message(
                UUID.randomUUID(),
                conversationId,
                null,
                "text",
                body,
                null,
                Instant.now()
        );
    }

    private void seedConversation(
            String id,
            String type,
            String title,
            Set<UUID> members,
            String welcome
    ) {
        UUID conversationId = UUID.fromString(id);
        Instant createdAt = Instant.now();
        Conversation conversation = new Conversation(conversationId, type, title, DEMO_USER_ID, createdAt);
        conversations.put(conversationId, conversation);
        membersByConversation.put(conversationId, ConcurrentHashMap.newKeySet());
        membersByConversation.get(conversationId).addAll(members);
        messagesByConversation.put(conversationId, new CopyOnWriteArrayList<>(List.of(
                new Message(UUID.randomUUID(), conversationId, null, "text", welcome, null, createdAt)
        )));
    }
}
