package com.chatapp.api.controller;

import com.chatapp.api.model.Profile;
import com.chatapp.api.service.UserContext;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/profile")
public class ProfileController {
    private final UserContext userContext;

    public ProfileController(UserContext userContext) {
        this.userContext = userContext;
    }

    @GetMapping
    public Profile get(@AuthenticationPrincipal Jwt jwt) {
        return new Profile(userContext.requireUserId(jwt), "New User", null, "system", "#2563eb");
    }

    @PutMapping
    public Profile update(@RequestBody Profile profile, @AuthenticationPrincipal Jwt jwt) {
        return new Profile(userContext.requireUserId(jwt), profile.displayName(), profile.avatarPath(), profile.themeMode(), profile.accentColor());
    }
}

