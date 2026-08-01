package com.chatapp.api.controller;

import com.chatapp.api.model.PresenceEvent;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

@Controller
public class PresenceController {
    @MessageMapping("/presence")
    @SendTo("/topic/presence")
    public PresenceEvent presence(@Payload PresenceEvent event) {
        return event.withServerTime();
    }
}
