package com.chatapp.api.controller;

import com.chatapp.api.model.ConnectionRequest;
import com.chatapp.api.model.ConnectionView;
import com.chatapp.api.service.ConnectionService;
import com.chatapp.api.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/api/connections")
public class ConnectionController {
    private final ConnectionService connectionService;
    private final UserContext userContext;

    public ConnectionController(ConnectionService connectionService, UserContext userContext) {
        this.connectionService = connectionService;
        this.userContext = userContext;
    }

    @GetMapping
    public List<ConnectionView> list(@AuthenticationPrincipal Jwt jwt) {
        return connectionService.list(userContext.requireUserId(jwt));
    }

    @PostMapping
    public ConnectionView request(
            @Valid @RequestBody ConnectionRequest request,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return connectionService.request(userContext.requireUserId(jwt), request.profileId());
    }

    @PutMapping("/{connectionId}/accept")
    public ConnectionView accept(
            @PathVariable("connectionId") UUID connectionId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        return connectionService.accept(connectionId, userContext.requireUserId(jwt));
    }

    @DeleteMapping("/{connectionId}")
    public ResponseEntity<Void> remove(
            @PathVariable("connectionId") UUID connectionId,
            @AuthenticationPrincipal Jwt jwt
    ) {
        connectionService.remove(connectionId, userContext.requireUserId(jwt));
        return ResponseEntity.noContent().build();
    }
}
