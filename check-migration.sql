-- ============================================
-- Check if pages_per_sheet column exists
-- ============================================

-- Query to check column existence
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable,
    CASE
        WHEN column_name = 'pages_per_sheet' THEN '✅ N-up column found!'
        ELSE column_name
    END as status
FROM information_schema.columns
WHERE table_name = 'print_jobs'
ORDER BY ordinal_position;

-- ============================================
-- If column doesn't exist, run this migration:
-- ============================================

-- UNCOMMENT AND RUN BELOW IF COLUMN IS MISSING:

-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM information_schema.columns
--     WHERE table_name = 'print_jobs' AND column_name = 'pages_per_sheet'
--   ) THEN
--     ALTER TABLE print_jobs ADD COLUMN pages_per_sheet integer NOT NULL DEFAULT 1 CHECK (pages_per_sheet IN (1, 2));
--     RAISE NOTICE '✅ pages_per_sheet column added successfully!';
--   ELSE
--     RAISE NOTICE '⚠️  pages_per_sheet column already exists.';
--   END IF;
-- END $$;
