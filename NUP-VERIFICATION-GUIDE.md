# N-up Feature Verification Guide

## ✅ Database Connection Established

**New Database URL:** `https://nnqqdlrarfdjmyjsxxrw.supabase.co`

The `.env` file has been updated with your new Supabase credentials.

---

## 📊 Verification Steps

### Step 1: Test Database Connection

Open the test page in your browser:

```
file:///tmp/cc-agent/58106459/project/test-db-connection.html
```

Or if running the dev server:
```
http://localhost:5173/test-db-connection.html
```

This page will verify:
1. ✅ Database connection is working
2. ✅ `pages_per_sheet` column exists in `print_jobs` table
3. ✅ Test data can be inserted with N-up values
4. ✅ Recent print jobs show `pages_per_sheet` data

---

## 🔍 What's Being Sent to Database

When a user submits a print job, the following data is sent to Supabase:

```javascript
{
  shop_id: "...",
  filename: "document.pdf",
  file_url: "https://...",
  copies: 1,
  paper_size: "A4",
  color_mode: "BW",
  print_type: "Single",
  pages_per_sheet: 2,  // ← N-up value (1 or 2)
  customer_name: "John Doe",
  customer_email: "john@example.com",
  customer_phone: "1234567890",
  total_cost: 10.00
}
```

**Location in code:** `/src/pages/OrderPage.jsx` (lines 360-373)

---

## 🗄️ Database Schema

The `print_jobs` table has the following structure for N-up:

```sql
-- Column Definition
pages_per_sheet integer NOT NULL DEFAULT 1 CHECK (pages_per_sheet IN (1, 2))
```

**Features:**
- Default value: `1` (one page per sheet)
- Allowed values: `1` or `2`
- Database constraint prevents invalid values

---

## 🧪 Manual Testing Steps

### 1. Apply Migration (if needed)

If the `pages_per_sheet` column doesn't exist, run this SQL in your Supabase SQL Editor:

```sql
-- Add pages_per_sheet column to print_jobs table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'print_jobs' AND column_name = 'pages_per_sheet'
  ) THEN
    ALTER TABLE print_jobs ADD COLUMN pages_per_sheet integer NOT NULL DEFAULT 1 CHECK (pages_per_sheet IN (1, 2));
  END IF;
END $$;
```

### 2. Test in Application

1. Start the dev server: `npm run dev`
2. Navigate to a shop's order page
3. Upload a PDF document
4. Change "Pages Per Sheet" dropdown to "2 Pages Per Sheet"
5. Fill in customer details
6. Submit the order
7. Check the database to verify `pages_per_sheet = 2` was saved

### 3. Verify in Database

Run this query in Supabase SQL Editor:

```sql
SELECT
  id,
  filename,
  pages_per_sheet,
  customer_name,
  created_at
FROM print_jobs
ORDER BY created_at DESC
LIMIT 10;
```

You should see the `pages_per_sheet` column with values `1` or `2`.

---

## 🎯 UI Features

### User Interface Elements

1. **Dropdown Selector** (OrderPage.jsx lines 813-824)
   - Options: "1 Page Per Sheet" or "2 Pages Per Sheet (Side by Side)"
   - Located in the print options section

2. **Visual Preview Indicators** (OrderPage.jsx lines 764-772)
   - Shows "2 Pages Per Sheet (Landscape)" badge when N-up = 2
   - Displays actual sheet count calculation
   - Example: "2 Sheets to Print" for 4 pages with N-up = 2

3. **Live Preview**
   - PDF previews automatically show pages combined side-by-side
   - Images previews show 2 images per sheet layout
   - Preview updates when N-up setting changes

---

## 🐛 Troubleshooting

### Preview Not Loading?

**Fixed!** The preview loading issue has been resolved. The components now properly update when N-up settings change.

**What was fixed:**
- `PDFPageSelector.jsx` - Lines 436 and 464
- `ImagePageSelector.jsx` - Line 417

### Column Not Found Error?

Run the migration SQL (see section 1 above) in your Supabase SQL Editor.

### Data Not Saving?

Check that:
1. Database connection is established (use test page)
2. The `pages_per_sheet` column exists
3. No console errors in browser developer tools
4. The value is either 1 or 2 (database constraint)

---

## 📝 Code Locations

| Feature | File | Lines |
|---------|------|-------|
| N-up State | `OrderPage.jsx` | 67 |
| N-up Dropdown UI | `OrderPage.jsx` | 813-824 |
| Database Insert | `OrderPage.jsx` | 360-373 |
| PDF Preview | `PDFPageSelector.jsx` | 352-401 |
| Image Preview | `ImagePageSelector.jsx` | 333-382 |
| Migration SQL | `supabase/migrations/20251003000000_add_pages_per_sheet.sql` | All |

---

## ✅ Verification Checklist

- [x] Database connection established
- [x] `.env` file updated with new credentials
- [x] Migration file created
- [x] Frontend sends `pages_per_sheet` to database
- [x] Preview components fixed to show N-up layout
- [x] UI dropdown for selecting 1 or 2 pages per sheet
- [x] Visual indicators show when N-up is active
- [x] Test page created for verification
- [x] Project builds successfully

---

## 🎉 Summary

The N-up printing feature is **fully implemented and ready to test**:

1. **Frontend**: Users can select 1 or 2 pages per sheet
2. **Preview**: Shows accurate representation of final print layout
3. **Database**: Saves `pages_per_sheet` value (1 or 2) with each order
4. **Validation**: Database constraint ensures only valid values (1, 2)

**Next Step:** Open `test-db-connection.html` in your browser to verify everything is working!
