-- Migration: Add status column to payments table
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- 
-- Payment statuses:
--   'pending_confirmation' — client uploaded receipt, waiting for dispatcher to confirm
--   'paid' — dispatcher confirmed payment (default for existing records)

ALTER TABLE payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'paid';

-- Update existing payments to have 'paid' status
UPDATE payments SET status = 'paid' WHERE status IS NULL;
