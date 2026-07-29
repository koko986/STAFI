package com.chatapp.api.controller;

import com.chatapp.api.model.Profile;
import com.chatapp.api.service.ProfileService;
import com.chatapp.api.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ProfileController {
    private final UserContext userContext;
    private final ProfileService profileService;

    public ProfileController(UserContext userContext, ProfileService profileService) {
        this.userContext = userContext;
        this.profileService = profileService;
    }

    @GetMapping("/me/profile")
    public Profile get(@AuthenticationPrincipal Jwt jwt) {
        return profileService.getOrCreate(userContext.requireUserId(jwt), jwt);
    }

    @PutMapping("/me/profile")
    public Profile update(@Valid @RequestBody Profile profile, @AuthenticationPrincipal Jwt jwt) {
        return profileService.update(userContext.requireUserId(jwt), profile, jwt);
    }

    @GetMapping("/profiles/search")
    public List<Profile> search(
            @RequestParam(name = "q", defaultValue = "") String q,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return profileService.search(q, userContext.requireUserId(jwt));
    }

    @GetMapping("/profiles/{profileId}")
    public Profile profile(
            @PathVariable("profileId") UUID profileId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        userContext.requireUserId(jwt);
        return profileService.find(profileId)
                .filter(Profile::onboarded)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Profile not found."));
    }
}
