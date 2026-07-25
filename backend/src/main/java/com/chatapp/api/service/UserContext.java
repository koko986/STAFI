package com.chatapp.api.service;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class UserContext {
    private static final UUID DEMO_USER_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    public UUID requireUserId(Jwt jwt) {
        if (jwt == null) {
            return DEMO_USER_ID;
        }
        return UUID.fromString(jwt.getSubject());
    }
}
