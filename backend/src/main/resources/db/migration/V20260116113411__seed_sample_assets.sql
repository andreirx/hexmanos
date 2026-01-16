-- V20260116113411__seed_sample_assets.sql
-- Seed data for development and testing

-- Sample Character Assets
INSERT INTO asset_index (id, type, name, author_id, status, storage_key_prefix, created_at)
VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'CHARACTER', 'hero-knight', 'dev-user-1', 'APPROVED', 'seed/hero-knight.png', NOW()),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'CHARACTER', 'goblin-warrior', 'dev-user-1', 'APPROVED', 'seed/goblin-warrior.png', NOW()),
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'CHARACTER', 'wizard-blue', 'dev-user-2', 'PENDING', 'seed/wizard-blue.png', NOW());

-- Sample Tile Assets
INSERT INTO asset_index (id, type, name, author_id, status, storage_key_prefix, created_at)
VALUES
    ('d4e5f6a7-b8c9-0123-def0-234567890123', 'TILE', 'grass-plain', 'dev-user-1', 'APPROVED', 'seed/grass-plain.png', NOW()),
    ('e5f6a7b8-c9d0-1234-ef01-345678901234', 'TILE', 'stone-floor', 'dev-user-1', 'APPROVED', 'seed/stone-floor.png', NOW()),
    ('f6a7b8c9-d0e1-2345-f012-456789012345', 'TILE', 'water-shallow', 'dev-user-2', 'APPROVED', 'seed/water-shallow.png', NOW()),
    ('a7b8c9d0-e1f2-3456-0123-567890123456', 'TILE', 'lava-hot', 'dev-user-2', 'PENDING', 'seed/lava-hot.png', NOW());

-- Sample Map Asset
INSERT INTO asset_index (id, type, name, author_id, status, storage_key_prefix, created_at)
VALUES
    ('b8c9d0e1-f2a3-4567-1234-678901234567', 'MAP', 'tutorial-dungeon', 'dev-user-1', 'APPROVED', 'seed/tutorial-dungeon.json', NOW());
