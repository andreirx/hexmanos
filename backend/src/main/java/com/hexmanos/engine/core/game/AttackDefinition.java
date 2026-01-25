package com.hexmanos.engine.core.game;

import java.util.UUID;

/**
 * Defines an attack that a character can perform.
 * Loaded from the character's definition.json.
 */
public record AttackDefinition(
        String id,
        String name,
        AttackType type,
        int range,              // Range in tiles
        int damage,
        long cooldownMs,
        UUID projectileAssetId, // Null for melee attacks
        int projectileSpeed     // Tiles per second, 0 for melee
) {
    public enum AttackType {
        MELEE,
        RANGED
    }

    public boolean isRanged() {
        return type == AttackType.RANGED;
    }

    public boolean isMelee() {
        return type == AttackType.MELEE;
    }

    /**
     * Calculate the animation duration for this attack.
     * Attack animations typically have 4 frames at 10 FPS = 400ms.
     */
    public long getAnimationDurationMs() {
        return 400; // 4 frames at 10 FPS
    }
}
