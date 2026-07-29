package com.chatapp.api.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;
import java.util.Arrays;

@Configuration
public class SecurityConfig {
    @Value("${app.security.enabled:false}")
    private boolean securityEnabled;

    @Value("${app.supabase-jwt-issuer:}")
    private String jwtIssuer;

    @Value("${app.supabase-jwks-url:}")
    private String jwtJwksUrl;

    @Value("${app.cors-allowed-origin-patterns}")
    private String corsAllowedOriginPatterns;

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(Customizer.withDefaults());

        if (securityEnabled) {
            if (jwtIssuer.isBlank() && jwtJwksUrl.isBlank()) {
                throw new IllegalStateException(
                        "SUPABASE_JWT_ISSUER or SUPABASE_JWKS_URL is required when APP_SECURITY_ENABLED=true"
                );
            }
            http.authorizeHttpRequests(auth -> auth
                            .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                            .requestMatchers("/ws/**", "/actuator/health").permitAll()
                            .anyRequest().authenticated())
                    .oauth2ResourceServer(oauth -> oauth.jwt(
                            jwt -> jwt.decoder(jwtJwksUrl.isBlank()
                                    ? JwtDecoders.fromIssuerLocation(jwtIssuer)
                                    : NimbusJwtDecoder.withJwkSetUri(jwtJwksUrl)
                                            .jwsAlgorithm(SignatureAlgorithm.ES256)
                                            .build())
                    ));
        } else {
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        }

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(Arrays.stream(corsAllowedOriginPatterns.split(","))
                .map(String::trim)
                .filter(pattern -> !pattern.isBlank())
                .toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
