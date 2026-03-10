-- Migration: Create domains table for evidence locker
CREATE TABLE domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    title_en VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Optionally, add indexes or constraints as needed
-- CREATE UNIQUE INDEX idx_domains_title ON domains(title);
