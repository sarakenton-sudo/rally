-- Add 'unclassified' to email_classification enum for emails that fail AI classification
ALTER TYPE email_classification ADD VALUE IF NOT EXISTS 'unclassified';
