-- V1__init_schema.sql
-- We rely on Java to generate the UUIDs. No extensions needed.

CREATE TABLE asset_index (
                             id UUID PRIMARY KEY, -- Removed DEFAULT
                             type VARCHAR(50) NOT NULL,
                             name VARCHAR(255) NOT NULL,
                             author_id VARCHAR(255) NOT NULL,
                             status VARCHAR(50) NOT NULL,
                             s3_key_prefix VARCHAR(500) NOT NULL,
                             created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE active_games (
                              id VARCHAR(50) PRIMARY KEY,
                              map_asset_id UUID NOT NULL REFERENCES asset_index(id),
                              host_id VARCHAR(255) NOT NULL,
                              started_at TIMESTAMP NOT NULL DEFAULT NOW()
);
