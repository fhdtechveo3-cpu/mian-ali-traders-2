-- Migration: Ensure both notes and note columns exist on customer_payments table
ALTER TABLE public.customer_payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.customer_payments ADD COLUMN IF NOT EXISTS note TEXT;
