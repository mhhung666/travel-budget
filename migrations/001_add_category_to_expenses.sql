-- Migration: Add category column to expenses table
-- Run this SQL in Supabase SQL Editor

-- Add category column with default value 'other'
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other';

-- Update existing records to have 'other' category if null
UPDATE expenses SET category = 'other' WHERE category IS NULL;

-- Add constraint to ensure valid category values
-- Valid values: accommodation, transportation, food, shopping, entertainment, tickets, other
ALTER TABLE expenses
ADD CONSTRAINT valid_category
CHECK (category IN ('accommodation', 'transportation', 'food', 'shopping', 'entertainment', 'tickets', 'other'));
