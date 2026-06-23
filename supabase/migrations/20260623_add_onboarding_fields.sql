-- Add onboarding preference columns to user_profiles

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS role TEXT,
ADD COLUMN IF NOT EXISTS goals JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS persona TEXT,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
