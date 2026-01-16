-- Users table for Cognito user sync
-- Stores user info synced from AWS Cognito on first login

CREATE TABLE users (
    id UUID PRIMARY KEY,
    cognito_sub VARCHAR(255) NOT NULL UNIQUE,
    pool VARCHAR(50) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index on cognito_sub for fast lookup during auth
CREATE INDEX idx_users_cognito_sub ON users(cognito_sub);

-- Index on pool for filtering by user type
CREATE INDEX idx_users_pool ON users(pool);
