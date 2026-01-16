package com.hexmanos.engine.app.dtos;

import com.hexmanos.engine.core.user.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDTO {
    private UUID id;
    private String cognitoSub;
    private String pool;
    private String displayName;
    private String email;
    private LocalDateTime createdAt;
    private LocalDateTime lastLoginAt;

    /**
     * Request DTO for syncing a user from Cognito.
     * Called after frontend authenticates with Cognito.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SyncRequest {
        /**
         * Cognito "sub" claim (from JWT)
         */
        private String cognitoSub;

        /**
         * Which pool: "PLAYER" or "ADMIN"
         */
        private String pool;

        /**
         * Username or preferred_username from Cognito
         */
        private String displayName;

        /**
         * Email from Cognito
         */
        private String email;
    }

    public static class DTOMapper {
        public static UserDTO toDTO(User user) {
            if (user == null) return null;
            return UserDTO.builder()
                    .id(user.getId())
                    .cognitoSub(user.getCognitoSub())
                    .pool(user.getPool() != null ? user.getPool().name() : null)
                    .displayName(user.getDisplayName())
                    .email(user.getEmail())
                    .createdAt(user.getCreatedAt())
                    .lastLoginAt(user.getLastLoginAt())
                    .build();
        }
    }
}
