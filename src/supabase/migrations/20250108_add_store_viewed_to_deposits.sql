-- Add store viewed tracking columns to deposits table
ALTER TABLE deposits 
ADD COLUMN IF NOT EXISTS viewed_by_store BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_deposits_viewed_by_store 
ON deposits(user_id, viewed_by_store) 
WHERE viewed_by_store = FALSE;

-- Add comment
COMMENT ON COLUMN deposits.viewed_by_store IS '가맹점이 입금 내역을 확인했는지 여부';
COMMENT ON COLUMN deposits.viewed_at IS '가맹점이 입금 내역을 확인한 시간';
