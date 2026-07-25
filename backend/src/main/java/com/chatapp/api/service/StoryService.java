package com.chatapp.api.service;

import com.chatapp.api.model.Story;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class StoryService {
    private final List<Story> stories = new CopyOnWriteArrayList<>();

    public List<Story> listActive() {
        Instant now = Instant.now();
        stories.removeIf(story -> story.expiresAt().isBefore(now));
        return List.copyOf(stories);
    }

    public Story create(Story request, UUID ownerId) {
        Instant now = Instant.now();
        Story story = new Story(
                UUID.randomUUID(),
                ownerId,
                request.mediaPath(),
                request.caption(),
                now.plus(24, ChronoUnit.HOURS),
                now
        );
        stories.add(story);
        return story;
    }
}
