-- Game tables for the game engine
-- Games store game sessions, game_players tracks player participation

CREATE TABLE games (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    host_player_id UUID NOT NULL,
    map_asset_id UUID NOT NULL REFERENCES assets(id),
    status VARCHAR(50) NOT NULL DEFAULT 'WAITING',
    join_code VARCHAR(10) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    snapshot_storage_key VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_games_host ON games(host_player_id);
CREATE INDEX idx_games_join_code ON games(join_code);
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_last_activity ON games(last_activity_at);

CREATE TABLE game_players (
    id UUID PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'PLAYER',
    controlled_character_id UUID,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, player_id)
);

CREATE INDEX idx_game_players_game ON game_players(game_id);
CREATE INDEX idx_game_players_player ON game_players(player_id);
