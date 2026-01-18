-- Add moderation_notes column for tracking admin review comments
ALTER TABLE asset_index ADD COLUMN moderation_notes TEXT;
