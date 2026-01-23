package com.hexmanos.engine.core.game;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class GamePlayer {
    public enum PlayerRole { HOST, PLAYER, OBSERVER }

    private UUID id;
    private UUID gameId;
    private UUID playerId;
    private PlayerRole role;
    private UUID controlledCharacterId;
    private int colorIndex;  // 0-7 for 8 different player colors
    private Instant joinedAt;
    private Instant lastSeenAt;

    /**
     * Check if this player is controlling a character.
     */
    public boolean isControllingCharacter() {
        return controlledCharacterId != null;
    }

    /**
     * Update the last seen timestamp.
     */
    public void touch() {
        this.lastSeenAt = Instant.now();
    }

    /**
     * Take control of a character.
     */
    public void takeControl(UUID characterId) {
        this.controlledCharacterId = characterId;
        touch();
    }

    /**
     * Release control of the character.
     */
    public void relinquishControl() {
        this.controlledCharacterId = null;
        touch();
    }
}
