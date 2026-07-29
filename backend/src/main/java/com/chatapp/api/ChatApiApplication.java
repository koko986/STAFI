package com.chatapp.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.Locale;

@SpringBootApplication
public class ChatApiApplication {
    public static void main(String[] args) {
        useWindowsCertificateStore();
        SpringApplication.run(ChatApiApplication.class, args);
    }

    private static void useWindowsCertificateStore() {
        boolean windows = System.getProperty("os.name", "")
                .toLowerCase(Locale.ROOT)
                .contains("win");
        if (windows
                && System.getProperty("javax.net.ssl.trustStore") == null
                && System.getProperty("javax.net.ssl.trustStoreType") == null) {
            System.setProperty("javax.net.ssl.trustStoreType", "Windows-ROOT");
        }
    }
}
