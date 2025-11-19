# PrintFlow Pro - Web Application

## Overview
PrintFlow Pro is a web application designed to connect users with local print shops. It enables users to upload documents and images, customize print settings, receive instant pricing, and place orders for local pickup. The primary goal is to streamline and enhance the printing experience for both customers and print service providers, offering a modern solution for print services.

## User Preferences
I prefer detailed explanations. I want iterative development. Ask before making major changes.

## Recent Changes
- **UI Redesign: Compact Print Settings with Collapsible Page Selector** (November 18, 2025):
  - **Change**: Replaced dropdown-based print settings with compact button/chip UI for mobile-first experience
  - **Compact 2-Column Grid Layout**:
    - Print settings use 2-column grid for space efficiency
    - Paper Size: Horizontal button chips (A4, Letter, etc.)
    - Color Mode: Two buttons (B&W / Color) with visual indicators (gray dot / rainbow dot)
    - Pages Per Sheet: Vertical buttons with professional icons (📄 FileText / 📚 Layers)
    - Print Type: Vertical buttons with icons (📄 FileText for single / 📖 BookOpen for double)
    - Copies: +/- buttons with auto-select input (click to type directly)
  - **Professional Icons**: Added clear visual indicators to help users understand their choices
  - **Smart Input**: Copies field auto-selects on focus so users can type "20" directly instead of editing "1"
  - **Collapsible Page Selector**: 
    - Added clickable header "Edit and Select Pages to Print >" 
    - Page selector hidden by default to reduce scrolling
    - Expands on click to show full PDFPageSelector component
    - Animated chevron icon rotates to indicate expand/collapse state
  - **Mobile Optimization**: Ultra-compact design with minimal scrolling and faster selections
  - **Result**: Professional, space-efficient UI that's easy to understand and use on mobile
- **CRITICAL FIX: Apply All for background-loaded pages** (November 17, 2025):
  - **Bug**: Progressive background loader (loadNextPage) wasn't checking applyAllSettingsRef
  - Pages loaded by scrolling got Apply All edits, but pages loaded in background didn't
  - **Root Cause**: loadNextPage created pages without checking if Apply All was active
  - **Fix**: Added Apply All settings check in loadNextPage (lines 598-627)
  - Now calls `applyStoredSettingsToPage` for background-loaded pages when Apply All is active
  - Preserves `pristineOriginal` in originalPages for future re-editing
  - **Logging**: Added `[BACKGROUND LOAD]` messages to track when settings are applied
  - **Result**: ALL page loading paths now honor Apply All (scroll, background, batch)

- **CRITICAL FIX: Inconsistent thumbnail generation in Apply All** (November 17, 2025):
  - **Bug**: Thumbnails weren't properly updated in Apply All - only the original page thumbnail got proper updates
  - **Root Cause**: Mixed thumbnail generation approaches across code paths
    - Initial load: Created smaller thumbnails (scaled down by 0.5)
    - Apply All: Created thumbnails from full-size canvas
    - Lazy-loaded Apply All pages: Created thumbnails from full-size canvas
  - **Fix**: Created centralized `generateThumbnail` helper function (src/utils/pdf/rendering.ts)
    - Generates consistent scaled-down thumbnails (scale: 0.5, quality: 0.6)
    - Updated all code paths to use this helper:
      - `renderPage`: Initial page load thumbnails
      - `confirmApplyToAll`: Apply All thumbnails (normal + N-up mode)
      - `applyStoredSettingsToPage`: Lazy-loaded Apply All page thumbnails
      - `updateGridThumbnails`: N-up sheet thumbnails
  - **Result**: ALL thumbnails now generated consistently with same size/quality across all loading paths

- **UX Enhancement: Progressive fill animation on Apply to All modal button** (November 17, 2025):
  - **Enhancement**: Added progressive fill animation to "Apply to All" button in confirmation modal
  - Modal now stays open during processing to show real-time progress
  - **Implementation**:
    - Button shows white semi-transparent fill that expands left-to-right based on actual progress
    - Progress stages: 0% (instant) → 5% (started) → 10% (settings stored) → 70% (pages processed) → 100% (complete)
    - 300ms delay at 100% completion before modal auto-closes
    - Button disabled during processing to prevent multiple clicks
    - Cancel button also disabled during processing
  - **Critical fixes for smooth animation**:
    - Added setTimeout(0) + requestAnimationFrame to ensure UI renders BEFORE processing starts
    - **Removed CSS transition from progress bar** - was causing perceived lag/pause as browser tried to animate width changes
    - Progress bar now updates instantly via React state, making animation feel smooth and responsive
  - **Result**: Professional, instant, smooth UX with real-time Apply All progress - no lag or pauses

## System Architecture
PrintFlow Pro utilizes a React 18 frontend with TypeScript (Vite 5), React Router v6 for navigation, and Zustand for state management. Styling is handled with Tailwind CSS, icons from Lucide React, and notifications via React Hot Toast. PDF manipulation relies on PDF-lib and pdfjs-dist. The backend and database are powered by Supabase, leveraging its PostgreSQL, Storage, and Realtime features.

**Key Features and Design Decisions:**
-   **UI/UX:** Modern, mobile-first design with a unified editor/selector interface, animated submission popups, gradient color schemes, and enhanced visual hierarchy. Incorporates instant skeleton grids, professional loading indicators with rotating messages, and smooth page transitions for a seamless user experience.
-   **File Processing:** Supports upload and editing for PDFs and images, including automatic image-to-PDF conversion, instant PDF pre-generation, background processing for large files, and a smart PDF normalization system to convert documents to A4 with intelligent orientation detection (handling rotated pages and non-zero CropBox/MediaBox origins). Content is scaled to 95% of A4. Normalized PDFs use unique timestamped filenames. PDFEditor detects page orientation (landscape vs portrait) and renders canvases accordingly.
-   **Print Customization:** Offers customizable print settings like paper size, color mode, print type (single/double-sided), and N-up printing.
-   **Pricing & Ordering:** Provides real-time pricing based on user selections and real-time order status updates via Supabase subscriptions.
-   **Performance Optimizations:** Features advanced lazy loading for large PDFs, instant startup, smart placeholders, scroll-based loading, efficient thumbnail updates, JPEG compression, and optimized canvas operations. Page preservation is ensured during editing and saving. Implements a queue-based progressive loading system with a 3-tier quality system for thumbnails and LRU cache eviction.
-   **PDF Editor Enhancements:** Includes content-only rotation, vector-preserving crop implementation, and metadata transformations. Geometric transformations use `pdf-lib`'s native methods for vector preservation.
-   **Preview & Editor:** Enhanced preview modal with zoom and touch scrolling, and an edit button for quick page access. A development preview component displays the first 4 pages with zoom controls.
-   **Responsiveness:** "Apply Changes" and "Apply All" buttons respond instantly by deferring heavy processing to the background, featuring real-time progress animations with stages and smooth transitions.
-   **Crop Consistency:** Crop transformations are consistently centered across live preview, saved canvas, and PDF export.
-   **Project Structure:** Code is organized into `components`, `pages`, and `utils` directories, with PDF-related utilities modularized under `src/utils/pdf/`.

## External Dependencies
-   **Supabase**: Backend services, PostgreSQL database, file storage, and real-time subscriptions.
-   **React 18**: Frontend library.
-   **Vite 5**: Frontend build tool.
-   **React Router v6**: Client-side routing.
-   **Zustand**: State management.
-   **Tailwind CSS**: Utility-first CSS framework.
-   **Lucide React**: Icon library.
-   **React Hot Toast**: Notification library.
-   **PDF-lib**: PDF document creation and modification.
-   **pdfjs-dist**: PDF parsing and rendering.