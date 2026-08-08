package com.chatapp.api.config;

import java.util.concurrent.TimeUnit;

import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.impl.DefaultHttpRequestRetryStrategy;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.core5.util.TimeValue;
import org.apache.hc.core5.util.Timeout;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;

@Configuration
public class RestClientConfig {

    @Bean
    ClientHttpRequestFactory pooledRequestFactory() {
        PoolingHttpClientConnectionManager connectionManager = new PoolingHttpClientConnectionManager();
        connectionManager.setMaxTotal(200);
        connectionManager.setDefaultMaxPerRoute(50);
        connectionManager.setDefaultConnectionConfig(ConnectionConfig.custom()
                .setConnectTimeout(Timeout.ofSeconds(5))
                .setSocketTimeout(Timeout.ofSeconds(60))
                .setValidateAfterInactivity(TimeValue.ofSeconds(2))
                .setTimeToLive(TimeValue.ofMinutes(10))
                .build());

        CloseableHttpClient httpClient = HttpClients.custom()
                .setConnectionManager(connectionManager)
                .setKeepAliveStrategy((response, context) -> TimeValue.ofSeconds(30))
                .setRetryStrategy(new DefaultHttpRequestRetryStrategy(3, TimeValue.ofMilliseconds(500)))
                .evictExpiredConnections()
                .evictIdleConnections(TimeValue.ofSeconds(20))
                .build();

        return new HttpComponentsClientHttpRequestFactory(httpClient);
    }

    @Bean
    RestClientCustomizer pooledRestClientCustomizer(ClientHttpRequestFactory pooledRequestFactory) {
        return builder -> builder.requestFactory(pooledRequestFactory);
    }
}
