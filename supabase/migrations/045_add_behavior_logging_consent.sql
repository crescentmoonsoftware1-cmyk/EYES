-- Migration: Add behavior_logging_consent to user_profiles
-- Supports Work Item #7: GDPR Consent Toggles for Behavioral Query Logging

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS behavior_logging_consent BOOLEAN DEFAULT TRUE;
