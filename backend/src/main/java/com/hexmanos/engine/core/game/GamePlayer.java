package com.hexmanos.engine.core.game;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
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
    private Set<UUID> controlledCharacterIds = new HashSet<>();
    private int colorIndex;  // 0-7 for 8 different player colors
    private Instant joinedAt;
    private Instant lastSeenAt;

    /**
     * Check if this player is controlling any character.
     */
    public boolean isControllingCharacter() {
        return controlledCharacterIds != null && !controlledCharacterIds.isEmpty();
    }

    /**
     * Backward compat: get first controlled character (for single-char endpoints).
     */
    public UUID getControlledCharacterId() {
        if (controlledCharacterIds == null || controlledCharacterIds.isEmpty()) {
            return null;
        }
        return controlledCharacterIds.iterator().next();
    }

    /**
     * Backward compat setter: sets a single controlled character (clears others).
     */
    public void setControlledCharacterId(UUID characterId) {
        if (controlledCharacterIds == null) {
            controlledCharacterIds = new HashSet<>();
        }
        controlledCharacterIds.clear();
        if (characterId != null) {
            controlledCharacterIds.add(characterId);
        }
    }

    /**
     * Update the last seen timestamp.
     */
    public void touch() {
        this.lastSeenAt = Instant.now();
    }

    /**
     * Take control of a character (adds to set, does not replace).
     */
    public void takeControl(UUID characterId) {
        if (controlledCharacterIds == null) {
            controlledCharacterIds = new HashSet<>();
        }
        controlledCharacterIds.add(characterId);
        touch();
    }

    /**
     * Release control of a specific character.
     */
    public void relinquishControl(UUID characterId) {
        if (controlledCharacterIds != null) {
            controlledCharacterIds.remove(characterId);
        }
        touch();
    }

    /**
     * Release control of all characters.
     */
    public void relinquishAllControl() {
        if (controlledCharacterIds != null) {
            controlledCharacterIds.clear();
        }
        touch();
    }
}
