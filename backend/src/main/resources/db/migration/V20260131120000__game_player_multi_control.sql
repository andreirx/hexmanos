-- Squad Movement: Allow players to control multiple characters
-- Migrate from single controlled_character_id column to join table

CREATE TABLE game_player_controlled_characters (
    game_player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
    character_id UUID NOT NULL,
    PRIMARY KEY (game_player_id, character_id)
);

-- Migrate existing data
INSERT INTO game_player_controlled_characters (game_player_id, character_id)
SELECT id, controlled_character_id FROM game_players
WHERE controlled_character_id IS NOT NULL;

-- Drop old column
ALTER TABLE game_players DROP COLUMN controlled_character_id;
