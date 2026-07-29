package com.chatapp.api.config;

import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Configuration;

@Configuration
public class WebServerConfig implements WebServerFactoryCustomizer<TomcatServletWebServerFactory> {
    @Override
    public void customize(TomcatServletWebServerFactory factory) {
        // NIO2 avoids Windows selector loopback failures while retaining async I/O and WebSocket support.
        factory.setProtocol("org.apache.coyote.http11.Http11Nio2Protocol");
    }
}
