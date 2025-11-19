import React, { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url'
import { 
  PDFDocument,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath
} from 'pdf-lib'
import { X, Save, RotateCw, RotateCcw, Crop, RefreshCw, ZoomIn, ZoomOut, Move, Grid2x2 as Grid, Scissors, Check, CreditCard as Edit3, FileText, Maximize2, ArrowLeftRight, ArrowUpDown, AlertCircle, Square, SquareCheck as CheckSquare, Loader2 } from 'lucide-react'
import { ShimmerLoader } from './ThumbnailLoadingStates'
import LoadingExperience from './LoadingExperience'
import { getPageSize, DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../utils/pageSizes'
import { buildGeometricTransform, calculateScaleToFit } from '../utils/pdf/geometry'
import { renderPage, applyStoredSettingsToPage, generateThumbnail } from '../utils/pdf/rendering'
import { applyColorFilter } from '../utils/pdf/filters'
import { combineConsecutivePagesForGrid } from '../utils/pdf/grid'
import { createPerformanceLogger } from '../utils/pdf/performanceLogger'
import Dropdown from './Dropdown'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// Module-level cache to survive React Strict Mode remounts
// Key: file signature (name_size_lastModified)
// Value: { loading: boolean, controller: AbortController, pdf: PDFDocumentProxy }
const fileLoadCache = new Map()

const PDFEditor = ({ 
  file, 
  initialPageIndex = 0, 
  onSave, 
  onCancel, 
  directPageEdit = false, 
  pageSize = DEFAULT_PAGE_SIZE, 
  onPageSizeChange, 
  colorMode = 'BW', 
  pagesPerSheet = 1,
  selectedPages = [],
  onPageSelect = null
}) => {
  console.log('📄 PDFEditor mounted with pagesPerSheet:', pagesPerSheet, 'Type:', typeof pagesPerSheet)
  
  const [pages, setPages] = useState([])
  const [originalPages, setOriginalPages] = useState([])
  const [allPages, setAllPages] = useState([]) // Track ALL pages (loaded + placeholders)
  const [loading, setLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState(null) // null | 'parsing' | 'loading' | 'ready'
  const [error, setError] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [currentPageSize, setCurrentPageSize] = useState(pageSize)
  const pageRefs = useRef({}) // Store refs for IntersectionObserver
  const perfLogger = useRef(null) // Performance logger

  // Sync with parent page size changes
  useEffect(() => {
    if (pageSize !== currentPageSize) {
      setCurrentPageSize(pageSize)
    }
  }, [pageSize])

  const handlePageSizeChange = (newSize) => {
    setCurrentPageSize(newSize)
    if (onPageSizeChange) {
      onPageSizeChange(newSize)
    }
  }
  
  // Edit popup state
  const [showEditPopup, setShowEditPopup] = useState(false)
  const [editingPageIndex, setEditingPageIndex] = useState(initialPageIndex)
  const [editingPageNumber, setEditingPageNumber] = useState(initialPageIndex + 1) // Track page number separately
  
  // Edit settings for current page - geometric edits only
  const [settings, setSettings] = useState({
    rotation: 0,
    scale: 100,
    offsetX: 0,
    offsetY: 0
  })

  // Store user's intended scale separately (not affected by crop auto-adjustments)
  const [userScale, setUserScale] = useState(100)
  
  // Crop system
  const [cropMode, setCropMode] = useState(false)
  const [cropArea, setCropArea] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragHandle, setDragHandle] = useState(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const rafRef = useRef(null)
  const [imageRect, setImageRect] = useState(null)
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(1)
  
  // UI state
  const [activeTab, setActiveTab] = useState('pagesize')
  const [tempPageSize, setTempPageSize] = useState(pageSize)
  const [showApplyWarning, setShowApplyWarning] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState(0) // Track apply animation state
  const [isApplyingAll, setIsApplyingAll] = useState(false)
  const [applyAllProgress, setApplyAllProgress] = useState(0) // Track apply all animation state
  
  const canvasRef = useRef(null)
  const imageContainerRef = useRef(null)
  const debounceTimeoutRef = useRef(null)
  const loadingRemainingRef = useRef(false)
  const applyAllSettingsRef = useRef(null) // Store "Apply All" settings for lazy-loaded pages
  const loadingPagesRef = useRef(new Set()) // Track pages currently being loaded to prevent duplicates
  
  // Performance optimization refs
  const abortControllerRef = useRef(null) // Cancel PDF loading on unmount
  const pageLoadStatusRef = useRef(new Map()) // Track loading status: idle/loading/loaded
  const renderQueueRef = useRef([]) // Queue for sequential rendering
  const isRenderingRef = useRef(false) // Track if currently rendering
  const progressiveLoadCompleteRef = useRef(false) // Track when initial batch loaded
  const INITIAL_BATCH_SIZE = 2 // Disable IntersectionObserver for first 2 pages - faster initial load
  const currentFileIdRef = useRef(null) // Track current file ID for this component instance

  // Helper to create file identifier
  const getFileId = (file) => {
    if (!file) return null
    return `${file.name}_${file.size}_${file.lastModified}`
  }

  // Helper to get page size with correct orientation based on actual PDF pages
  const getOrientationAwarePageSize = (sizeName) => {
    let targetPageSize = getPageSize(sizeName)
    
    // Detect orientation from first loaded page
    if (originalPages.length > 0) {
      const firstPage = originalPages[0]
      const isLandscape = firstPage.width > firstPage.height
      
      // If PDF is landscape but targetPageSize is portrait, swap dimensions
      if (isLandscape && targetPageSize.width < targetPageSize.height) {
        targetPageSize = {
          ...targetPageSize,
          width: targetPageSize.height,
          height: targetPageSize.width
        }
      }
    }
    
    return targetPageSize
  }

  useEffect(() => {
    if (file && file.type === 'application/pdf') {
      const fileId = getFileId(file)
      
      // Check if this is a NEW file (different from what this component instance is tracking)
      if (currentFileIdRef.current && currentFileIdRef.current !== fileId) {
        perfLogger.current?.log('🔄 New file detected - cleaning up previous file')
        // Clear the old file from module-level cache
        if (currentFileIdRef.current) {
          fileLoadCache.delete(currentFileIdRef.current)
          perfLogger.current?.log(`🗑️ Cleared cache for old file: ${currentFileIdRef.current}`)
        }
        // New file - abort previous load if exists
        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
          abortControllerRef.current = null
        }
        // Clear all tracking
        loadingPagesRef.current.clear()
        pageLoadStatusRef.current.clear()
        renderQueueRef.current = []
        progressiveLoadCompleteRef.current = false
        // Clear pages to force reload
        setPages([])
        setOriginalPages([])
        setAllPages([])
      }
      
      // Check module-level cache
      const cachedLoad = fileLoadCache.get(fileId)
      
      if (cachedLoad && cachedLoad.loading) {
        // Another instance (from Strict Mode) is already loading this file
        perfLogger.current?.log('⏸️ Same file already loading (React Strict Mode) - skipping duplicate')
        // Reuse the controller from the first load
        abortControllerRef.current = cachedLoad.controller
        currentFileIdRef.current = fileId
        return
      }
      
      // Update current file tracker for this component
      currentFileIdRef.current = fileId
      loadPDF()
    }
    
    // Cleanup: DON'T abort here - let file change detection handle it
    // Aborting on unmount causes issues with React Strict Mode double-mounting
    return () => {
      perfLogger.current?.log('🧹 Component unmounting (cleanup)')
      // Don't abort - the file change detection above handles aborting when needed
      // Don't clear tracking - let the new mount reuse it if same file
    }
  }, [file])

  // Regenerate grid thumbnails when N-up or color mode changes
  useEffect(() => {
    console.log('🔄 useEffect triggered:', { pagesPerSheet, colorMode, originalPagesLength: originalPages.length })
    if (originalPages.length > 0) {
      console.log('✅ Calling updateGridThumbnails because originalPages exist')
      updateGridThumbnails()
    } else {
      console.log('⚠️ Skipping updateGridThumbnails - no originalPages yet')
    }
  }, [pagesPerSheet, colorMode])
  
  // In N-up mode, update sheets when new pages are loaded
  useEffect(() => {
    if (pagesPerSheet === 2 && originalPages.length > 0) {
      console.log('🔄 N-up mode: originalPages changed, updating sheets')
      updateGridThumbnails()
    }
  }, [originalPages.length, pagesPerSheet])

  useEffect(() => {
    setEditingPageIndex(initialPageIndex)
    setEditingPageNumber(initialPageIndex + 1)
    // If directPageEdit is true, open edit popup immediately
    if (directPageEdit && pages.length > 0) {
      setShowEditPopup(true)
    }
  }, [initialPageIndex, directPageEdit])
  
  // Recalculate editingPageIndex when pages array changes OR editingPageNumber changes
  useEffect(() => {
    if (pages.length > 0 && editingPageNumber) {
      const correctIndex = pages.findIndex(p => p.pageNumber === editingPageNumber)
      // Only update if the index actually changed
      if (correctIndex !== -1 && correctIndex !== editingPageIndex) {
        console.log(`📍 Recalculating editingPageIndex from ${editingPageIndex} to ${correctIndex}`)
        setEditingPageIndex(correctIndex)
      }
    }
  }, [pages.length, editingPageNumber]) // Trigger on pages.length OR editingPageNumber changes

  useEffect(() => {
    // Open edit popup when pages are loaded and directPageEdit is true
    if (directPageEdit && pages.length > 0 && !showEditPopup) {
      setShowEditPopup(true)
    }
  }, [pages, directPageEdit, showEditPopup])

  useEffect(() => {
    if (pages.length > 0 && showEditPopup) {
      // Clear any pending debounce
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      
      // Debounce edits to prevent lag on slider changes
      debounceTimeoutRef.current = setTimeout(() => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
        }
        rafRef.current = requestAnimationFrame(() => {
          applyEdits()
          rafRef.current = null
        })
      }, 50) // 50ms debounce for responsive slider controls
    }
    
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [settings, editingPageIndex, showEditPopup, currentPageSize, colorMode, pagesPerSheet])

  const loadPDF = async () => {
    // Capture the controller at the start of this load operation
    // This prevents the "controller swap" bug where a new file load creates a new controller
    // and old tasks check the new controller instead of their original one
    let loadController = null
    const fileId = getFileId(file)
    
    try {
      // Initialize performance logger
      if (!perfLogger.current) {
        perfLogger.current = createPerformanceLogger('PDFEditor', true)
      }
      perfLogger.current.start()
      
      // Create new AbortController for this PDF load
      if (abortControllerRef.current) {
        perfLogger.current.log('⚠️ Aborting previous controller before creating new one')
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()
      loadController = abortControllerRef.current // Capture for this load
      const loadSignal = loadController.signal
      perfLogger.current.log(`📌 Created new controller for file: ${fileId}`)
      
      // Register in module-level cache to prevent duplicate loads
      fileLoadCache.set(fileId, {
        loading: true,
        controller: loadController,
        pdf: null
      })
      
      // Reset all tracking
      pageLoadStatusRef.current.clear()
      loadingPagesRef.current.clear()
      progressiveLoadCompleteRef.current = false
      
      setLoading(true)
      setLoadingStage('parsing')
      setError(null)
      loadingRemainingRef.current = false // Reset flag on new PDF load
      
      // INSTANT SKELETON: Create full skeleton grid immediately (before parsing)
      // Use 12 placeholder tiles to avoid layout jump when actual pages load
      const skeletonPlaceholders = Array.from({ length: 12 }, (_, i) => ({
        pageNumber: i + 1,
        isLoaded: false,
        isLoading: true,
        thumbnail: null,
        width: 595,
        height: 842,
        canvas: null,
        originalCanvas: null,
        edited: false
      }))
      setAllPages(skeletonPlaceholders)
      
      // Stage 1: Convert file to ArrayBuffer
      perfLogger.current.mark('File Load Start')
      const arrayBuffer = await file.arrayBuffer()
      perfLogger.current.mark('File Load Complete')
      perfLogger.current.measure('File to ArrayBuffer', 'File Load Start', 'File Load Complete', {
        size: arrayBuffer.byteLength,
        sizeFormatted: `${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`
      })
      
      // Stage 2: Parse PDF document
      perfLogger.current.mark('PDF Parse Start')
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      perfLogger.current.mark('PDF Parse Complete')
      perfLogger.current.measure('PDF Parsing', 'PDF Parse Start', 'PDF Parse Complete', {
        pages: pdfDoc.numPages
      })
      
      setPdf(pdfDoc)
      
      // INSTANT EDITOR: Open UI immediately after PDF parsing
      const totalPages = pdfDoc.numPages
      // Guard against undefined/NaN initialPageIndex
      const safeIndex = Number.isFinite(initialPageIndex) ? initialPageIndex : 0
      const requestedPageNum = Math.min(safeIndex + 1, totalPages) // Convert 0-indexed to 1-indexed
      
      // Stage 3: Create placeholders
      perfLogger.current.mark('Placeholders Start')
      const allPagesPlaceholders = []
      
      // Check if N-up mode is active (pagesPerSheet === 2)
      if (pagesPerSheet === 2) {
        // Create sheet placeholders (2 pages per sheet)
        for (let i = 1; i <= totalPages; i += 2) {
          const page1Num = i
          const page2Num = i + 1
          const sheetPageNumber = page2Num <= totalPages ? `${page1Num}-${page2Num}` : `${page1Num}`
          
          allPagesPlaceholders.push({
            pageNumber: sheetPageNumber,
            isSheet: page2Num <= totalPages,
            containsPages: page2Num <= totalPages ? [page1Num, page2Num] : [page1Num],
            isLoaded: false,
            isLoading: false,
            thumbnail: null,
            width: 595,
            height: 842,
            canvas: null,
            originalCanvas: null,
            edited: false
          })
        }
      } else {
        // Create individual page placeholders
        for (let i = 1; i <= totalPages; i++) {
          allPagesPlaceholders.push({
            pageNumber: i,
            isLoaded: false,
            isLoading: false,
            thumbnail: null,
            width: 595, // A4 default
            height: 842,
            canvas: null,
            originalCanvas: null,
            edited: false
          })
        }
      }
      // Smoothly update placeholders - expand or contract as needed
      // If we have more pages than skeleton, add new ones
      // If we have fewer, remove extras
      // This avoids layout jump by keeping grid structure stable
      setAllPages(allPagesPlaceholders)
      setLoadingStage('loading')
      perfLogger.current.mark('Placeholders Complete')
      perfLogger.current.measure('Create Placeholders', 'Placeholders Start', 'Placeholders Complete', {
        count: totalPages
      })
      
      // Stop loading indicator NOW - editor opens immediately
      setLoading(false)
      perfLogger.current.markEditorReady()
      
      // Stage 4: Load first page
      perfLogger.current.log(`📄 Loading first page (${requestedPageNum})...`)
      
      // Mark as loading (prevent other loaders from loading this page)
      pageLoadStatusRef.current.set(requestedPageNum, 'loading')
      loadingPagesRef.current.add(requestedPageNum)
      
      const pageTimer = perfLogger.current.trackPageLoad(requestedPageNum, 'first')
      const firstPage = await renderPage(pdfDoc, requestedPageNum, pageTimer, { 
        thumbnailScale: 0.5, 
        thumbnailQuality: 0.4 
      })
      pageTimer.complete({ requestedPage: true })
      
      // Check if aborted (only check signal, not controller ref which changes on Strict Mode remount)
      if (loadSignal.aborted) {
        perfLogger.current.log(`🛑 Load aborted after first page render (signal aborted, fileId: ${fileId})`)
        // Clean up status
        pageLoadStatusRef.current.delete(requestedPageNum)
        loadingPagesRef.current.delete(requestedPageNum)
        return
      }
      
      if (firstPage) {
        // Mark as loaded
        pageLoadStatusRef.current.set(requestedPageNum, 'loaded')
        loadingPagesRef.current.delete(requestedPageNum)
        const pageData = {
          ...firstPage,
          canvas: firstPage.originalCanvas,
          thumbnail: firstPage.thumbnail,
          edited: false,
          editHistory: {
            rotation: 0,
            scale: 100,
            offsetX: 0,
            offsetY: 0,
            cropArea: null
          }
        }
        
        // Use functional update to preserve any existing state
        setOriginalPages(prev => {
          const updated = [...prev]
          updated[requestedPageNum - 1] = pageData
          return updated.filter(p => p !== null && p !== undefined)
        })
        setPages(prev => {
          const updated = [...prev]
          updated[requestedPageNum - 1] = pageData
          return updated.filter(p => p !== null && p !== undefined)
        })
        
        setEditingPageIndex(0)
        setEditingPageNumber(firstPage.pageNumber)
        
        // Mark page as loaded in allPages
        setAllPages(prev => prev.map(p => 
          p.pageNumber === firstPage.pageNumber 
            ? { ...firstPage, isLoaded: true, isLoading: false }
            : p
        ))
        
        perfLogger.current.log(`✅ First page loaded - editor ready!`)
        setLoadingStage('ready')
      }
      
      // Stage 5: Progressive loading queue for remaining pages
      perfLogger.current.mark('Progressive Loading Start')
      const pagesToLoad = []
      const start = Math.max(1, requestedPageNum - 1)
      const end = Math.min(totalPages, requestedPageNum + 1)
      
      // Queue nearby pages first (for smooth initial experience)
      for (let pageNum = start; pageNum <= end; pageNum++) {
        if (pageNum !== requestedPageNum) {
          pagesToLoad.push(pageNum)
        }
      }
      
      // Queue remaining pages
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (pageNum < start || pageNum > end) {
          pagesToLoad.push(pageNum)
        }
      }
      
      perfLogger.current.log(`📄 Queued ${pagesToLoad.length} pages for progressive loading`)
      
      let loadedCount = 1 // First page already loaded
      
      // Progressive loading function - one page at a time with functional updates
      const loadNextPage = async () => {
        // Check if aborted
        if (loadSignal.aborted) {
          perfLogger.current.log('🛑 Progressive loading aborted')
          return
        }
        
        if (pagesToLoad.length === 0) {
          perfLogger.current.mark('Progressive Loading Complete')
          perfLogger.current.measure('All Pages Loaded', 'Progressive Loading Start', 'Progressive Loading Complete', {
            totalPages: totalPages,
            loadedCount: loadedCount
          })
          perfLogger.current.log(`✅ All ${loadedCount} pages loaded`)
          perfLogger.current.logSummary()
          // Mark first batch complete to enable IntersectionObserver
          progressiveLoadCompleteRef.current = true
          return
        }
        
        const pageNum = pagesToLoad.shift()
        
        // Skip if already loaded or loading
        const status = pageLoadStatusRef.current.get(pageNum)
        if (status === 'loaded' || status === 'loading') {
          perfLogger.current.log(`⏭️ Page ${pageNum} already ${status}, skipping`)
          // Continue to next page
          if (pagesToLoad.length > 0) {
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(() => loadNextPage(), { timeout: 100 })
            } else {
              setTimeout(() => loadNextPage(), 10)
            }
          }
          return
        }
        
        try {
          // Mark as loading
          pageLoadStatusRef.current.set(pageNum, 'loading')
          loadingPagesRef.current.add(pageNum)
          
          const pageTimer = perfLogger.current.trackPageLoad(pageNum, 'progressive')
          const page = await renderPage(pdfDoc, pageNum, pageTimer, { 
            thumbnailScale: 0.5, 
            thumbnailQuality: 0.4 
          })
          pageTimer.complete()
          
          // Check if aborted after render
          if (loadSignal.aborted) {
            perfLogger.current.log('🛑 Progressive loading aborted after render')
            // Clean up status
            pageLoadStatusRef.current.delete(pageNum)
            loadingPagesRef.current.delete(pageNum)
            setAllPages(prev => prev.map(p => 
              p.pageNumber === pageNum ? { ...p, isLoading: false } : p
            ))
            return
          }
          
          if (page) {
            // Mark as loaded
            pageLoadStatusRef.current.set(pageNum, 'loaded')
            loadingPagesRef.current.delete(pageNum)
            
            // CRITICAL: Check if Apply All settings exist and apply them
            let displayPage = page
            let pageData = {
              ...page,
              canvas: page.originalCanvas,
              thumbnail: page.thumbnail,
              edited: false,
              editHistory: {
                rotation: 0,
                scale: 100,
                offsetX: 0,
                offsetY: 0,
                cropArea: null
              }
            }
            
            // Apply stored "Apply All" settings if they exist
            if (applyAllSettingsRef.current) {
              console.log(`📝 [BACKGROUND LOAD] Applying stored Apply All settings to page ${pageNum}`, applyAllSettingsRef.current.settings)
              displayPage = await applyStoredSettingsToPage(page, applyAllSettingsRef.current, getPageSize)
              console.log(`✅ [BACKGROUND LOAD] Apply All settings applied to page ${pageNum}`)
              
              // Update pageData to include the edits
              pageData = {
                ...displayPage,
                pristineOriginal: page.originalCanvas // Keep pristine for future edits
              }
            }
            
            // Functional update preserves concurrent edits
            // originalPages stores pristine for re-editing, pages/allPages show the display version
            setOriginalPages(prev => {
              // Check if page already exists (might have been loaded via IntersectionObserver)
              const exists = prev.find(p => p.pageNumber === pageNum)
              if (exists) return prev
              // Add new page and sort - use pageData which has pristineOriginal
              return [...prev, pageData].sort((a, b) => a.pageNumber - b.pageNumber)
            })
            
            setPages(prev => {
              // Check if page already exists
              const exists = prev.find(p => p.pageNumber === pageNum)
              if (exists) return prev
              // Add new page and sort - use displayPage which has edits applied
              return [...prev, displayPage].sort((a, b) => a.pageNumber - b.pageNumber)
            })
            
            // Mark as loaded in allPages
            setAllPages(prev => prev.map(p => 
              p.pageNumber === pageNum 
                ? { ...displayPage, isLoaded: true, isLoading: false }
                : p
            ))
            
            loadedCount++
            const progress = Math.round((loadedCount / totalPages) * 100)
            perfLogger.current.log(`✅ Page ${pageNum} loaded (${loadedCount}/${totalPages} - ${progress}%)`)
          }
        } catch (error) {
          perfLogger.current.log(`❌ Error loading page ${pageNum}: ${error.message}`)
          console.error(`❌ Error loading page ${pageNum}:`, error)
          // Mark as failed/idle so it can be retried
          pageLoadStatusRef.current.delete(pageNum)
          loadingPagesRef.current.delete(pageNum)
        }
        
        // Schedule next page load using requestIdleCallback for smooth UI
        if (pagesToLoad.length > 0) {
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => loadNextPage(), { timeout: 100 })
          } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(() => loadNextPage(), 10)
          }
        }
      }
      
      // Start loading queue
      loadNextPage()
      
      perfLogger.current.log(`✅ PDF Editor - Initial page loaded, progressive loading started`)
      perfLogger.current.log(`ℹ️ Remaining ${totalPages - 1} pages loading progressively in background`)
      
      // DO NOT load remaining pages in background - let them load on scroll/demand only
      
    } catch (error) {
      console.error('❌ Error loading PDF:', error)
      perfLogger.current?.log(`❌ Fatal error: ${error.message}`)
      setError('Failed to load PDF: ' + error.message)
      // Clear cache on error
      fileLoadCache.delete(fileId)
    } finally {
      setLoading(false)
      // Mark loading as complete in cache
      const cached = fileLoadCache.get(fileId)
      if (cached) {
        cached.loading = false
      }
    }
  }


  // Load a single page on demand (for scroll-based loading)
  const loadSinglePage = useCallback(async (pageNumber) => {
    if (!pdf) return
    
    // Capture controller at start to prevent swap bug
    const controller = abortControllerRef.current
    const signal = controller?.signal
    
    // PERFORMANCE FIX: Disable IntersectionObserver for first INITIAL_BATCH_SIZE pages
    // Let progressive loader handle them to prevent triple loading collision
    if (pageNumber <= INITIAL_BATCH_SIZE && !progressiveLoadCompleteRef.current) {
      perfLogger.current?.log(`⏸️ Page ${pageNumber} in initial batch, skipping on-demand load`)
      return
    }
    
    // Check loading status using coordination system
    const status = pageLoadStatusRef.current.get(pageNumber)
    if (status === 'loaded' || status === 'loading') {
      perfLogger.current?.log(`⏭️ Page ${pageNumber} already ${status}, skipping on-demand load`)
      return
    }
    
    // Check if aborted
    if (signal?.aborted) {
      perfLogger.current?.log('🛑 On-demand load aborted')
      return
    }
    
    // Mark as loading
    pageLoadStatusRef.current.set(pageNumber, 'loading')
    loadingPagesRef.current.add(pageNumber)
    
    // Mark as loading in state (for UI)
    setAllPages(prev => prev.map(p => 
      p.pageNumber === pageNumber ? { ...p, isLoading: true } : p
    ))
    
    try {
      const pageTimer = perfLogger.current?.trackPageLoad(pageNumber, 'on-demand')
      perfLogger.current?.log(`📥 Loading page ${pageNumber} on demand`)
      const renderedPage = await renderPage(pdf, pageNumber, undefined, { 
        thumbnailScale: 0.5, 
        thumbnailQuality: 0.4 
      })
      pageTimer?.complete()
      
      // Check if aborted after render
      if (signal?.aborted) {
        perfLogger.current?.log('🛑 On-demand load aborted after render')
        // Clean up status
        pageLoadStatusRef.current.delete(pageNumber)
        loadingPagesRef.current.delete(pageNumber)
        setAllPages(prev => prev.map(p => 
          p.pageNumber === pageNumber ? { ...p, isLoading: false } : p
        ))
        return
      }
      
      if (renderedPage) {
        // Mark as loaded
        pageLoadStatusRef.current.set(pageNumber, 'loaded')
        loadingPagesRef.current.delete(pageNumber)
        // Keep pristine original (for future re-editing)
        const pristineOriginal = {
          ...renderedPage,
          canvas: renderedPage.originalCanvas,
          thumbnail: renderedPage.thumbnail,
          edited: false,
          editHistory: {
            rotation: 0,
            scale: 100,
            offsetX: 0,
            offsetY: 0,
            cropArea: null
          }
        }
        
        let displayPage = renderedPage
        let originalPageForSave = pristineOriginal
        
        // Apply stored "Apply All" settings if they exist
        if (applyAllSettingsRef.current) {
          console.log(`📝 [LAZY LOAD] Applying stored settings to page ${pageNumber}`, applyAllSettingsRef.current.settings)
          displayPage = await applyStoredSettingsToPage(renderedPage, applyAllSettingsRef.current, getPageSize)
          console.log(`✅ [LAZY LOAD] Settings applied to page ${pageNumber} successfully`)
          
          // IMPORTANT: Also store the edited version in originalPages so it gets saved with editHistory
          originalPageForSave = {
            ...displayPage,
            pristineOriginal: renderedPage.originalCanvas // Keep pristine for future edits
          }
        }
        
        // Safety check: only add if not already present
        // In N-up mode, skip adding individual pages (updateGridThumbnails will create sheets)
        if (pagesPerSheet !== 2) {
          setPages(prev => {
            if (prev.find(p => p.pageNumber === pageNumber)) {
              console.log(`⚠️ Page ${pageNumber} already in pages array, skipping`)
              return prev
            }
            return [...prev, displayPage].sort((a, b) => a.pageNumber - b.pageNumber)
          })
        } else {
          console.log(`📄 N-up mode: Skipping individual page ${pageNumber} add to pages array`)
        }
        
        setOriginalPages(prev => {
          if (prev.find(p => p.pageNumber === pageNumber)) {
            return prev
          }
          return [...prev, originalPageForSave].sort((a, b) => a.pageNumber - b.pageNumber)
        })
        
        // Update allPages with loaded page
        setAllPages(prev => prev.map(p => 
          p.pageNumber === pageNumber 
            ? { ...displayPage, isLoaded: true, isLoading: false }
            : p
        ))
        
        console.log(`✅ Loaded page ${pageNumber}`)
      }
    } catch (error) {
      console.error(`❌ Error loading page ${pageNumber}:`, error)
      // Mark as not loading on error
      setAllPages(prev => prev.map(p => 
        p.pageNumber === pageNumber ? { ...p, isLoading: false } : p
      ))
      // Remove from loading set and status (error - allow retry)
      loadingPagesRef.current.delete(pageNumber)
      pageLoadStatusRef.current.delete(pageNumber)
    }
  }, [pdf, applyAllSettingsRef, allPages])
  
  // Set up IntersectionObserver for scroll-based lazy loading
  useEffect(() => {
    if (allPages.length === 0 || !loadSinglePage) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pageNumberStr = entry.target.dataset.pageNumber
            
            // Handle N-up sheet page numbers (e.g., "1-2", "3-4")
            if (pageNumberStr.includes('-')) {
              const [page1, page2] = pageNumberStr.split('-').map(n => parseInt(n))
              // Load both pages in the sheet
              console.log(`📄 Sheet ${pageNumberStr} visible - loading pages ${page1} and ${page2}`)
              loadSinglePage(page1)
              if (page2) loadSinglePage(page2)
            } else {
              // Single page number
              const pageNumber = parseInt(pageNumberStr)
              loadSinglePage(pageNumber)
            }
          }
        })
      },
      {
        root: null,
        rootMargin: '600px', // Start loading 600px before page enters viewport for smoother scrolling
        threshold: 0.01
      }
    )
    
    // Observe all page card elements
    Object.values(pageRefs.current).forEach(ref => {
      if (ref) observer.observe(ref)
    })
    
    return () => observer.disconnect()
  }, [allPages.length, pdf, loadSinglePage])

  const loadRemainingPages = async (pdfDoc, totalPages, alreadyLoadedPageNumbers) => {
    try {
      console.log(`🔄 loadRemainingPages: Loading remaining pages (skipping ${alreadyLoadedPageNumbers.size} already loaded)`)
      // Load pages in larger batches for faster completion
      const remainingPages = []
      for (let i = 1; i <= totalPages; i++) {
        // Skip already loaded pages
        if (alreadyLoadedPageNumbers.has(i)) {
          console.log(`⏭️ Skipping page ${i} (already loaded)`)
          continue
        }
        
        let page = await renderPage(pdfDoc, i, undefined, { 
          thumbnailScale: 0.5, 
          thumbnailQuality: 0.4 
        })
        if (page) {
          // Keep pristine original with cloned canvas
          const pristineOriginal = {
            ...page,
            canvas: page.originalCanvas, // Use the originalCanvas from renderPage
            thumbnail: page.thumbnail,
            edited: false,
            editHistory: {
              rotation: 0,
              scale: 100,
              offsetX: 0,
              offsetY: 0,
              cropArea: null
            }
          }
          
          let originalPageForSave = pristineOriginal
          
          // Apply stored "Apply All" settings if they exist
          if (applyAllSettingsRef.current) {
            console.log(`📝 [LAZY LOAD BATCH] Applying stored settings to page ${page.pageNumber}`, applyAllSettingsRef.current.settings)
            page = await applyStoredSettingsToPage(page, applyAllSettingsRef.current, getPageSize)
            console.log(`✅ [LAZY LOAD BATCH] Settings applied to page ${page.pageNumber} successfully`)
            
            // IMPORTANT: Also store the edited version in originalPages so it gets saved with editHistory
            originalPageForSave = {
              ...page,
              pristineOriginal: pristineOriginal.canvas // Keep pristine for future edits
            }
          }
          
          remainingPages.push({ display: page, original: originalPageForSave })
          console.log(`📄 Loaded page ${page.pageNumber} (${i}/${totalPages})`)
          
          // Update state after each batch of 15 pages to reduce re-renders
          if (remainingPages.length % 15 === 0 || i === totalPages) {
            const batch = [...remainingPages]
            remainingPages.length = 0 // Clear array for next batch
            console.log(`📦 Adding batch of ${batch.length} pages to state`)
            // In N-up mode, skip adding individual pages (updateGridThumbnails will create sheets)
            if (pagesPerSheet !== 2) {
              setPages(prevPages => {
                const displayPages = batch.map(b => b.display)
                return [...prevPages, ...displayPages].sort((a, b) => a.pageNumber - b.pageNumber)
              })
            } else {
              console.log(`📄 N-up mode: Skipping batch add to pages array (will create sheets from originalPages)`)
            }
            setOriginalPages(prevPages => {
              const origPages = batch.map(b => b.original)
              return [...prevPages, ...origPages].sort((a, b) => a.pageNumber - b.pageNumber)
            })
            // Longer delay after each batch to let UI breathe
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
        
        // Minimal delay - just yield to UI every 5 pages
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1))
        }
      }
      console.log(`✅ Background loading complete - all ${totalPages} pages loaded`)
      loadingRemainingRef.current = false
    } catch (error) {
      console.error('❌ Error loading remaining pages:', error)
      loadingRemainingRef.current = false
    }
  }


  const updateGridThumbnails = async () => {
    console.log('🔄 updateGridThumbnails called:', { pagesPerSheet, originalPagesCount: originalPages.length, colorMode })
    console.log('🔍 pagesPerSheet value:', pagesPerSheet, 'Type:', typeof pagesPerSheet, 'Equals 2?:', pagesPerSheet === 2, 'Equals "2"?:', pagesPerSheet === '2')
    
    if (pagesPerSheet === 2) {
      console.log('📄 Creating N-up sheets from', originalPages.length, 'pages')
      const sheets = []

      for (let i = 0; i < originalPages.length; i += 2) {
        const page1 = originalPages[i]
        const page2 = originalPages[i + 1]

        if (!page1 || !page1.canvas) {
          console.warn(`⚠️ Page ${i + 1} is missing or has no canvas, skipping sheet creation`)
          continue
        }

        const filtered1 = applyColorFilter(page1.canvas, colorMode)

        if (page2 && page2.canvas) {
          const filtered2 = applyColorFilter(page2.canvas, colorMode)
          const combinedCanvas = combineConsecutivePagesForGrid(filtered1, filtered2, getOrientationAwarePageSize(currentPageSize))

          const sheet = {
            pageNumber: `${page1.pageNumber}-${page2.pageNumber}`,
            canvas: combinedCanvas,
            originalCanvas: combinedCanvas,
            thumbnail: generateThumbnail(combinedCanvas, 0.5, 0.6), // Use helper for consistent thumbnails
            width: combinedCanvas.width,
            height: combinedCanvas.height,
            isSheet: true,
            containsPages: [page1.pageNumber, page2.pageNumber],
            // Sheet is edited if EITHER underlying page is edited
            edited: !!(page1?.edited || page2?.edited)
          }
          sheets.push(sheet)
          console.log(`✅ Created sheet ${page1.pageNumber}-${page2.pageNumber}`)
        } else {
          // Single remaining page - ensure proper dimensions
          const singlePage = {
            ...page1,
            canvas: filtered1,
            width: filtered1.width,
            height: filtered1.height,
            thumbnail: generateThumbnail(filtered1, 0.5, 0.6), // Use helper for consistent thumbnails
            isSheet: false
          }
          sheets.push(singlePage)
          console.log(`✅ Added single page ${page1.pageNumber}`)
        }
      }

      console.log(`✅ Created ${sheets.length} N-up sheets/pages, setting as pages`)
      setPages(sheets)
      
      // Recreate allPages with sheet placeholders
      // CRITICAL: Preserve edited status from previous allPages state
      const totalPages = pdf?.numPages || originalPages.length * 2
      const sheetPlaceholders = []
      
      for (let i = 1; i <= totalPages; i += 2) {
        const page1Num = i
        const page2Num = i + 1
        const sheetPageNumber = page2Num <= totalPages ? `${page1Num}-${page2Num}` : `${page1Num}`
        
        // Check if this sheet is already loaded
        const loadedSheet = sheets.find(s => s.pageNumber === sheetPageNumber)
        const previousSheet = allPages.find(s => s.pageNumber === sheetPageNumber)
        
        if (loadedSheet) {
          // Use the loaded sheet
          sheetPlaceholders.push({
            ...loadedSheet,
            isLoaded: true,
            isLoading: false,
            // Preserve edited status from loaded sheet OR previous state
            edited: !!(loadedSheet?.edited || previousSheet?.edited)
          })
        } else {
          // Create placeholder
          sheetPlaceholders.push({
            pageNumber: sheetPageNumber,
            isSheet: page2Num <= totalPages,
            containsPages: page2Num <= totalPages ? [page1Num, page2Num] : [page1Num],
            isLoaded: false,
            isLoading: false,
            thumbnail: null,
            width: 595,
            height: 842,
            canvas: null,
            originalCanvas: null,
            // Preserve edited status from previous state if it exists
            edited: !!previousSheet?.edited
          })
        }
      }
      
      setAllPages(sheetPlaceholders)
      console.log(`📋 Created ${sheetPlaceholders.length} sheet placeholders in allPages`)
    } else {
      console.log('📄 Updating individual pages with color filter')
      const updatedPages = originalPages.map(page => {
        const filtered = applyColorFilter(page.canvas, colorMode)
        return {
          ...page,
          canvas: filtered,
          // Reuse original thumbnail - color filter only affects canvas display, not stored thumbnail
          thumbnail: page.thumbnail || filtered.toDataURL('image/jpeg', 0.6)
        }
      })
      setPages(updatedPages)
      
      // Also recreate allPages with individual page placeholders (not sheets)
      // CRITICAL: Preserve edited status from previous allPages state
      const totalPages = pdf?.numPages || updatedPages.length
      const individualPlaceholders = []
      
      for (let i = 1; i <= totalPages; i++) {
        const loadedPage = updatedPages.find(p => p.pageNumber === i)
        const previousPage = allPages.find(p => p.pageNumber === i)
        
        if (loadedPage) {
          individualPlaceholders.push({
            ...loadedPage,
            isLoaded: true,
            isLoading: false,
            // Preserve edited status from loaded page OR previous state
            edited: !!(loadedPage?.edited || previousPage?.edited)
          })
        } else {
          individualPlaceholders.push({
            pageNumber: i,
            isLoaded: false,
            isLoading: false,
            thumbnail: null,
            width: 595,
            height: 842,
            canvas: null,
            originalCanvas: null,
            // Preserve edited status from previous state if it exists
            edited: !!previousPage?.edited
          })
        }
      }
      
      setAllPages(individualPlaceholders)
      const editedCount = individualPlaceholders.filter(p => p.edited).length
      console.log(`📋 Created ${individualPlaceholders.length} individual page placeholders in allPages (${editedCount} marked as edited)`)
    }
  }

  const loadPageOnDemand = async (pageNumber) => {
    if (!pdf) return null
    
    const existingPage = pages.find(p => p.pageNumber === pageNumber)
    if (existingPage) return existingPage
    
    console.log(`📄 Loading page ${pageNumber} on-demand...`)
    
    try {
      const renderedPage = await renderPage(pdf, pageNumber, undefined, { 
        thumbnailScale: 0.5, 
        thumbnailQuality: 0.4 
      })
      if (!renderedPage) return null
      
      const originalPage = {
        ...renderedPage,
        canvas: renderedPage.originalCanvas,
        thumbnail: renderedPage.thumbnail,
        edited: false,
        editHistory: {
          rotation: 0,
          scale: 100,
          offsetX: 0,
          offsetY: 0,
          cropArea: null
        }
      }
      
      let displayPage = renderedPage
      if (applyAllSettingsRef.current) {
        console.log(`📝 [ON-DEMAND LOAD] Applying stored settings to page ${pageNumber}`, applyAllSettingsRef.current.settings)
        displayPage = await applyStoredSettingsToPage(renderedPage, applyAllSettingsRef.current, getPageSize)
        console.log(`✅ [ON-DEMAND LOAD] Settings applied to page ${pageNumber} successfully`)
      }
      
      // In N-up mode, DON'T add individual pages to pages array
      // Just add to originalPages and let updateGridThumbnails create sheets
      if (pagesPerSheet !== 2) {
        setPages(prevPages => {
          const exists = prevPages.find(p => p.pageNumber === pageNumber)
          if (exists) return prevPages
          return [...prevPages, displayPage].sort((a, b) => a.pageNumber - b.pageNumber)
        })
      } else {
        console.log(`📄 N-up mode: Skipping individual page add to pages array`)
      }
      
      setOriginalPages(prevPages => {
        const exists = prevPages.find(p => p.pageNumber === pageNumber)
        if (exists) return prevPages
        return [...prevPages, originalPage].sort((a, b) => a.pageNumber - b.pageNumber)
      })
      
      console.log(`✅ Page ${pageNumber} loaded on-demand`)
      return displayPage
    } catch (error) {
      console.error(`❌ Error loading page ${pageNumber} on-demand:`, error)
      return null
    }
  }

  const openEditPopup = (pageIndex) => {
    setEditingPageIndex(pageIndex)
    setEditingPageNumber(pages[pageIndex]?.pageNumber) // Keep page number in sync
    setShowEditPopup(true)
    setActiveTab('pagesize')
    setCropMode(false)
    setCropArea(null)
    setImageRect(null)

    // Load existing settings for this page (geometric only)
    const page = pages[pageIndex]
    
    // CRITICAL FIX: In N-up mode, load editHistory from underlying original page, not the sheet
    let editHistorySource = page
    if (pagesPerSheet === 2 && page?.isSheet) {
      // For sheets, get editHistory from the first underlying page
      let originalPageIndex = pageIndex * 2
      const originalPage = originalPages[originalPageIndex]
      if (originalPage) {
        editHistorySource = originalPage
        console.log(`📄 N-up mode: Loading editHistory from original page ${originalPage.pageNumber}`)
      }
    }
    
    if (editHistorySource && editHistorySource.editHistory) {
      const loadedScale = editHistorySource.editHistory.scale || 100
      setSettings({
        rotation: editHistorySource.editHistory.rotation || 0,
        scale: loadedScale,
        offsetX: editHistorySource.editHistory.offsetX || 0,
        offsetY: editHistorySource.editHistory.offsetY || 0
      })
      setUserScale(loadedScale)
      console.log(`✅ Loaded editHistory:`, editHistorySource.editHistory)
    } else {
      setSettings({
        rotation: 0,
        scale: 100,
        offsetX: 0,
        offsetY: 0
      })
      setUserScale(100)
      console.log(`📄 No editHistory found - using defaults`)
    }

    setZoom(1)
  }

  const closeEditPopup = () => {
    // Clean up all editor state
    setActiveTab('pagesize')
    setCropMode(false)
    setCropArea(null)
    setImageRect(null)
    setZoom(1)

    if (directPageEdit) {
      // If opened directly from preview, close entire editor
      onCancel()
    } else {
      // If opened from PDF grid, go back to grid
      setShowEditPopup(false)
    }
  }

  const applyEdits = () => {
    if (!pages[editingPageIndex] || !canvasRef.current) return

    const pageIndex = editingPageIndex
    const page = pages[pageIndex]

    // When N-up is active, map sheet index to original page index
    let originalPageIndex = pageIndex
    if (pagesPerSheet === 2) {
      if (page.isSheet) {
        // For N-up sheets, Sheet 0 = pages 0,1; Sheet 1 = pages 2,3; etc.
        originalPageIndex = pageIndex * 2
      } else {
        // For single pages in N-up mode, find the correct original page by pageNumber
        originalPageIndex = originalPages.findIndex(p => p.pageNumber === page.pageNumber)
        if (originalPageIndex === -1) {
          console.error('❌ Could not find original page for', page.pageNumber)
          originalPageIndex = pageIndex
        }
      }
    }

    const originalPage = originalPages[originalPageIndex]
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })

    // Enable high-quality rendering
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Get target page size dimensions with correct orientation
    const targetPageSize = getOrientationAwarePageSize(currentPageSize)

    // CHECK N-UP MODE FIRST to prevent flicker
    const isNupMode = pagesPerSheet === 2 && page.isSheet
    
    console.log('📄 Current page in editor:', {
      pageNumber: page.pageNumber,
      isSheet: page.isSheet,
      pagesPerSheet: pagesPerSheet,
      isNupMode: isNupMode,
      originalPageDims: originalPage ? `${originalPage.width}x${originalPage.height}` : 'N/A',
      canvasDims: `${targetPageSize.width}x${targetPageSize.height}`
    })

    // Helper function to render a single page to a canvas
    const renderPageToCanvas = (targetCanvas, sourceOriginalPage, applySettings) => {
      const targetCtx = targetCanvas.getContext('2d', { alpha: false, willReadFrequently: false })
      targetCtx.imageSmoothingEnabled = true
      targetCtx.imageSmoothingQuality = 'high'
      
      // CRITICAL FIX: If cropArea exists and page has been cropped, use the pre-centered canvas DIRECTLY
      // The pre-centered canvas already has the crop centered with proper white space
      if (applySettings.cropArea && sourceOriginalPage.editHistory?.isCropped && sourceOriginalPage.canvas) {
        console.log('✂️ Using pre-centered cropped canvas (already centered, drawing directly)')
        
        // Clear canvas with white background
        targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
        targetCtx.fillStyle = 'white'
        targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height)
        
        // Draw the pre-centered canvas, scaling to fit target if dimensions differ
        const sourceCanvas = sourceOriginalPage.canvas
        
        if (sourceCanvas.width === targetCanvas.width && sourceCanvas.height === targetCanvas.height) {
          // Perfect match - draw directly at 1:1
          targetCtx.drawImage(sourceCanvas, 0, 0)
        } else {
          // Dimensions differ - scale and center to fit (10% margin to prevent overflow)
          const scaleX = targetCanvas.width / sourceCanvas.width
          const scaleY = targetCanvas.height / sourceCanvas.height
          const scale = Math.min(scaleX, scaleY) * 0.90 // Fit within target with 10% margin
          
          const scaledWidth = sourceCanvas.width * scale
          const scaledHeight = sourceCanvas.height * scale
          const x = (targetCanvas.width - scaledWidth) / 2
          const y = (targetCanvas.height - scaledHeight) / 2
          
          targetCtx.drawImage(sourceCanvas, x, y, scaledWidth, scaledHeight)
          console.log(`  📏 Scaled pre-centered canvas from ${sourceCanvas.width}×${sourceCanvas.height} to ${scaledWidth.toFixed(1)}×${scaledHeight.toFixed(1)} at (${x.toFixed(1)}, ${y.toFixed(1)})`)
        }
        
        // Apply color mode filter if needed
        if (colorMode === 'BW') {
          const tempCanvas = document.createElement('canvas')
          tempCanvas.width = targetCanvas.width
          tempCanvas.height = targetCanvas.height
          const tempCtx = tempCanvas.getContext('2d')
          tempCtx.filter = 'grayscale(100%)'
          tempCtx.drawImage(targetCanvas, 0, 0)
          
          targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
          targetCtx.fillStyle = 'white'
          targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height)
          targetCtx.drawImage(tempCanvas, 0, 0)
        }
        
        return // Skip geometric transform pipeline for pre-centered crops
      }
      
      // Get source canvas (pristineOriginal to prevent transformation compounding)
      const sourceCanvas = sourceOriginalPage.pristineOriginal || sourceOriginalPage.originalCanvas || sourceOriginalPage.canvas
      const originalWidth = sourceOriginalPage.width
      const originalHeight = sourceOriginalPage.height
      
      // Build editHistory
      const editHistory = {
        rotation: applySettings.rotation,
        scale: applySettings.scale,
        offsetX: applySettings.offsetX,
        offsetY: applySettings.offsetY,
        cropArea: applySettings.cropArea
      }
      
      // Use unified transformation helper
      const transform = buildGeometricTransform(
        { width: originalWidth, height: originalHeight },
        targetPageSize,
        editHistory
      )
      
      // Clear canvas with white background
      targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
      targetCtx.fillStyle = 'white'
      targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height)
      
      // Apply transformations
      targetCtx.save()
      targetCtx.translate(targetCanvas.width / 2, targetCanvas.height / 2)
      targetCtx.translate(applySettings.offsetX, applySettings.offsetY)

      if (applySettings.rotation !== 0) {
        targetCtx.rotate((applySettings.rotation * Math.PI) / 180)
      }

      // Draw using source rectangle (crop)
      targetCtx.drawImage(
        sourceCanvas,
        transform.sourceRect.x,
        transform.sourceRect.y,
        transform.sourceRect.width,
        transform.sourceRect.height,
        transform.drawX,
        transform.drawY,
        transform.drawWidth,
        transform.drawHeight
      )
      
      targetCtx.restore()

      // Apply color mode filter
      if (colorMode === 'BW') {
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = targetCanvas.width
        tempCanvas.height = targetCanvas.height
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.filter = 'grayscale(100%)'
        tempCtx.drawImage(targetCanvas, 0, 0)
        
        targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
        targetCtx.fillStyle = 'white'
        targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height)
        targetCtx.drawImage(tempCanvas, 0, 0)
      }
    }

    // BRANCH: N-up mode vs single page mode
    if (isNupMode) {
      console.log('🔄 N-up mode: Rendering 2 pages side-by-side')
      
      // Create temp canvases for both pages
      const page1Canvas = document.createElement('canvas')
      page1Canvas.width = targetPageSize.width
      page1Canvas.height = targetPageSize.height
      
      const page2Canvas = document.createElement('canvas')
      page2Canvas.width = targetPageSize.width
      page2Canvas.height = targetPageSize.height
      
      // Render page 1
      const currentSettings = {
        rotation: settings.rotation,
        scale: settings.scale,
        offsetX: settings.offsetX,
        offsetY: settings.offsetY,
        cropArea: cropArea || (page.editHistory?.cropArea)
      }
      renderPageToCanvas(page1Canvas, originalPage, currentSettings)

      // Render page 2 if it exists
      const nextOriginalPageIndex = originalPageIndex + 1
      if (nextOriginalPageIndex < originalPages.length) {
        const nextOriginalPage = originalPages[nextOriginalPageIndex]
        console.log('🔄 Rendering Page 2:', nextOriginalPage.pageNumber)
        renderPageToCanvas(page2Canvas, nextOriginalPage, currentSettings)
      } else {
        // No page 2 available, fill with white
        const page2Ctx = page2Canvas.getContext('2d')
        page2Ctx.fillStyle = 'white'
        page2Ctx.fillRect(0, 0, page2Canvas.width, page2Canvas.height)
      }

      // Create WIDE landscape canvas
      const gap = 12
      canvas.width = page1Canvas.width * 2 + gap
      canvas.height = page1Canvas.height

      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const halfWidth = canvas.width / 2
      const margin = 3

      // Draw thin page boundaries
      ctx.strokeStyle = '#3B82F6'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 6])
      ctx.strokeRect(margin, margin, halfWidth - gap / 2 - margin, canvas.height - margin * 2)
      ctx.strokeRect(halfWidth + gap / 2, margin, halfWidth - gap / 2 - margin, canvas.height - margin * 2)
      ctx.setLineDash([])

      // Pages fill the width - like slides
      const pageWidth = halfWidth - gap / 2 - margin * 3
      const pageHeight = canvas.height - margin * 4

      // Draw first page (left) - FILL width
      ctx.drawImage(page1Canvas, margin * 2, margin * 2, pageWidth, pageHeight)

      // Draw SECOND PAGE (right) - different page!
      ctx.drawImage(page2Canvas, halfWidth + gap / 2 + margin, margin * 2, pageWidth, pageHeight)

      // Add label
      ctx.fillStyle = '#3B82F6'
      ctx.font = 'bold 14px Inter, sans-serif'
      ctx.textAlign = 'center'
      const pageLabel = nextOriginalPageIndex < originalPages.length
        ? `Pages ${originalPageIndex + 1}-${nextOriginalPageIndex + 1} (2 Per Sheet)`
        : `Page ${originalPageIndex + 1} (2 Per Sheet)`
      ctx.fillText(pageLabel, canvas.width / 2, canvas.height - 8)
    } else {
      // SINGLE PAGE MODE - Render directly to main canvas
      console.log('📄 Single page mode: Rendering single page')
      
      // Set canvas to target page size
      canvas.width = targetPageSize.width
      canvas.height = targetPageSize.height
      
      // Render the page
      const currentSettings = {
        rotation: settings.rotation,
        scale: settings.scale,
        offsetX: settings.offsetX,
        offsetY: settings.offsetY,
        cropArea: cropArea || (page.editHistory?.cropArea)
      }
      renderPageToCanvas(canvas, originalPage, currentSettings)
    }

    // Update image rect for crop calculations with slight delay
    setTimeout(updateImageRect, 150)
  }

  const getCanvasTransformedBounds = () => {
    if (!canvasRef.current) return null

    const canvas = canvasRef.current
    const page = pages[editingPageIndex]
    if (!page) return null

    // Get correct original page index for N-up mode
    let originalPageIndex = editingPageIndex
    if (pagesPerSheet === 2) {
      if (page.isSheet) {
        originalPageIndex = editingPageIndex * 2
      } else {
        originalPageIndex = originalPages.findIndex(p => p.pageNumber === page.pageNumber)
        if (originalPageIndex === -1) originalPageIndex = editingPageIndex
      }
    }

    const originalPage = originalPages[originalPageIndex]
    let sourceWidth = originalPage ? originalPage.width : page.width
    let sourceHeight = originalPage ? originalPage.height : page.height

    // If page has been cropped, use the cropped canvas dimensions as source
    if (page.editHistory && page.editHistory.isCropped && page.canvas) {
      sourceWidth = page.canvas.width
      sourceHeight = page.canvas.height
    }

    // ROTATION SCALING LOGIC - Same as main page
    // Normalize rotation to 0-359 range (handles negative angles correctly)
    const normalizedRotation = ((settings.rotation % 360) + 360) % 360
    const isRotated90or270 = normalizedRotation === 90 || normalizedRotation === 270
    
    let scaleToFit
    if (isRotated90or270) {
      // Use Math.min to scale as large as possible while staying within bounds
      const scaleX = canvas.width / sourceHeight
      const scaleY = canvas.height / sourceWidth
      scaleToFit = Math.min(scaleX, scaleY)
    } else {
      // For 0°/180°: normal scaling
      const scaleX = canvas.width / sourceWidth
      const scaleY = canvas.height / sourceHeight
      scaleToFit = Math.min(scaleX, scaleY)
    }

    const contentScale = settings.scale / 100
    const finalScale = scaleToFit * contentScale

    // Calculate actual rendered content size on canvas
    const renderedWidth = sourceWidth * finalScale
    const renderedHeight = sourceHeight * finalScale

    return {
      sourceWidth,
      sourceHeight,
      finalScale,
      scaleToFit,
      contentScale,
      renderedWidth,
      renderedHeight,
      rotation,
      offsetX: settings.offsetX,
      offsetY: settings.offsetY
    }
  }

  const updateImageRect = () => {
    if (!canvasRef.current) {
      console.log('❌ Canvas not found for updateImageRect')
      return
    }

    const canvas = canvasRef.current
    const canvasRect = canvas.getBoundingClientRect()
    const container = canvas.closest('.image-container')
    const containerRect = container ? container.getBoundingClientRect() : { left: 0, top: 0 }

    const imageRect = {
      left: canvasRect.left - containerRect.left,
      top: canvasRect.top - containerRect.top,
      width: canvasRect.width,
      height: canvasRect.height
    }

    console.log('📐 Image rect calculated:', {
      canvasRect,
      containerRect,
      imageRect
    })

    setImageRect(imageRect)
  }

  const getTransformedCoordinates = (screenX, screenY) => {
    if (!canvasRef.current) return { x: 0, y: 0 }

    const canvas = canvasRef.current
    const container = canvas.closest('.image-container')
    const containerRect = container.getBoundingClientRect()

    const relativeX = (screenX - containerRect.left) / zoom
    const relativeY = (screenY - containerRect.top) / zoom

    const canvasRect = canvas.getBoundingClientRect()
    const canvasCenterX = (canvasRect.left - containerRect.left + canvasRect.width / 2) / zoom
    const canvasCenterY = (canvasRect.top - containerRect.top + canvasRect.height / 2) / zoom

    let localX = relativeX - canvasCenterX
    let localY = relativeY - canvasCenterY

    localX -= settings.offsetX
    localY -= settings.offsetY

    const rotationRad = -(settings.rotation * Math.PI) / 180
    const cos = Math.cos(rotationRad)
    const sin = Math.sin(rotationRad)

    const rotatedX = localX * cos - localY * sin
    const rotatedY = localX * sin + localY * cos

    const bounds = getCanvasTransformedBounds()
    if (!bounds) return { x: 0, y: 0 }

    const contentScale = bounds.finalScale
    const sourceX = rotatedX / contentScale + bounds.sourceWidth / 2
    const sourceY = rotatedY / contentScale + bounds.sourceHeight / 2

    return {
      x: Math.max(0, Math.min(sourceX, bounds.sourceWidth)),
      y: Math.max(0, Math.min(sourceY, bounds.sourceHeight))
    }
  }

  /**
   * Computes centered crop draw parameters for consistent centering across preview, canvas, and PDF export
   * @param {number} pageWidth - Target page/canvas width
   * @param {number} pageHeight - Target page/canvas height
   * @param {number} cropWidth - Actual crop width
   * @param {number} cropHeight - Actual crop height
   * @param {boolean} fitCropToPage - If true, scale crop to fill page; if false, center at actual size
   * @returns {{ drawX: number, drawY: number, drawWidth: number, drawHeight: number }}
   */
  const computeCenteredCropDrawParams = (pageWidth, pageHeight, cropWidth, cropHeight, fitCropToPage = false) => {
    if (fitCropToPage) {
      // Scale crop to FIT the page (maintaining aspect ratio, no overflow)
      const scaleX = pageWidth / cropWidth
      const scaleY = pageHeight / cropHeight
      const scale = Math.min(scaleX, scaleY)  // Use min to fit entirely, max would overflow
      
      const drawWidth = cropWidth * scale
      const drawHeight = cropHeight * scale
      const drawX = (pageWidth - drawWidth) / 2
      const drawY = (pageHeight - drawHeight) / 2
      
      console.log(`✂️ CROP CENTERING: page=${pageWidth}×${pageHeight}, crop=${cropWidth}×${cropHeight}, scale=${scale.toFixed(3)}, draw at (${drawX.toFixed(1)}, ${drawY.toFixed(1)}) size ${drawWidth.toFixed(1)}×${drawHeight.toFixed(1)}`)
      
      return { drawX, drawY, drawWidth, drawHeight }
    } else {
      // Center crop at actual size (no scaling)
      const drawX = (pageWidth - cropWidth) / 2
      const drawY = (pageHeight - cropHeight) / 2
      
      console.log(`✂️ CROP CENTERING: page=${pageWidth}×${pageHeight}, crop=${cropWidth}×${cropHeight}, NO SCALE, draw at (${drawX.toFixed(1)}, ${drawY.toFixed(1)})`)
      
      return { drawX, drawY, drawWidth: cropWidth, drawHeight: cropHeight }
    }
  }

  const startCrop = () => {
    console.log('🎯 Starting crop mode')
    setCropMode(true)

    setTimeout(() => {
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const container = canvas.closest('.image-container')
        const containerRect = container.getBoundingClientRect()

        const imageRect = {
          left: rect.left - containerRect.left,
          top: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height
        }

        setImageRect(imageRect)

        // CRITICAL: Initialize crop in CANVAS PIXEL SPACE (page boundaries)
        // This keeps crop fixed to page edges regardless of content scale/rotation
        const margin = 20
        const canvasPixelWidth = canvas.width
        const canvasPixelHeight = canvas.height

        const cropWidth = canvasPixelWidth * 0.8
        const cropHeight = canvasPixelHeight * 0.8

        const cropX = (canvasPixelWidth - cropWidth) / 2
        const cropY = (canvasPixelHeight - cropHeight) / 2

        console.log('🎯 Initializing crop in CANVAS PIXEL SPACE (page boundaries):', {
          canvasSize: `${canvasPixelWidth}×${canvasPixelHeight}`,
          cropArea: `${cropX.toFixed(1)}, ${cropY.toFixed(1)}, ${cropWidth.toFixed(1)}×${cropHeight.toFixed(1)}`
        })

        setCropArea({
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight
        })

        console.log('🎯 Canvas boundaries set:', imageRect)
      }
    }, 200)
  }

  const handleMouseDown = (e, handle) => {
    if (!cropMode || !cropArea) return

    e.preventDefault()
    e.stopPropagation()

    console.log('🖱️ Mouse down on handle:', handle, 'Current zoom:', zoom)

    setIsDragging(true)
    setDragHandle(handle)

    // Get DOM position accounting for zoom
    const canvas = canvasRef.current
    const container = canvas.closest('.image-container')
    const containerRect = container.getBoundingClientRect()

    // Apply zoom division to get zoom-independent coordinates
    const domX = (e.clientX - containerRect.left) / zoom
    const domY = (e.clientY - containerRect.top) / zoom

    setDragStart({
      domX,
      domY,
      cropX: cropArea.x,
      cropY: cropArea.y,
      cropWidth: cropArea.width,
      cropHeight: cropArea.height
    })
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !cropArea) return

    e.preventDefault()

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }

    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const container = canvas.closest('.image-container')
      const containerRect = container.getBoundingClientRect()
      const rect = canvas.getBoundingClientRect()

      // Get current position in zoom-independent DOM coordinates
      const currentDomX = (e.clientX - containerRect.left) / zoom
      const currentDomY = (e.clientY - containerRect.top) / zoom

      // Calculate delta in DOM pixels (zoom-independent)
      const domDeltaX = currentDomX - dragStart.domX
      const domDeltaY = currentDomY - dragStart.domY

      // Get canvas DOM dimensions WITHOUT zoom scaling
      // rect.width already includes zoom, so we divide to get base size
      const canvasDOMWidth = rect.width / zoom
      const canvasDOMHeight = rect.height / zoom

      // Convert DOM delta to canvas pixel delta
      // We're already in zoom-independent space, so just convert DOM to canvas pixels
      const pixelToDOMRatioX = canvasDOMWidth / canvas.width
      const pixelToDOMRatioY = canvasDOMHeight / canvas.height

      const deltaX = domDeltaX / pixelToDOMRatioX
      const deltaY = domDeltaY / pixelToDOMRatioY

      console.log('🎯 Crop drag at zoom ' + (zoom * 100).toFixed(0) + '%:', {
        domDelta: `(${domDeltaX.toFixed(1)}, ${domDeltaY.toFixed(1)})`,
        canvasDOMSize: `${canvasDOMWidth.toFixed(1)}×${canvasDOMHeight.toFixed(1)}`,
        canvasPixelSize: `${canvas.width}×${canvas.height}`,
        ratio: `${pixelToDOMRatioX.toFixed(3)}`,
        pixelDelta: `(${deltaX.toFixed(1)}, ${deltaY.toFixed(1)})`
      })

      let newCropArea = { ...cropArea }
      const minSize = 50
      const margin = 10
      const maxWidth = canvas.width - margin * 2
      const maxHeight = canvas.height - margin * 2

      switch (dragHandle) {
        case 'nw':
          const newX = Math.max(margin, Math.min(dragStart.cropX + deltaX, dragStart.cropX + dragStart.cropWidth - minSize))
          const newY = Math.max(margin, Math.min(dragStart.cropY + deltaY, dragStart.cropY + dragStart.cropHeight - minSize))
          newCropArea.x = newX
          newCropArea.y = newY
          newCropArea.width = dragStart.cropWidth - (newX - dragStart.cropX)
          newCropArea.height = dragStart.cropHeight - (newY - dragStart.cropY)
          break
        case 'ne':
          const newYNE = Math.max(margin, Math.min(dragStart.cropY + deltaY, dragStart.cropY + dragStart.cropHeight - minSize))
          newCropArea.y = newYNE
          newCropArea.width = Math.max(minSize, Math.min(dragStart.cropWidth + deltaX, canvas.width - dragStart.cropX - margin))
          newCropArea.height = dragStart.cropHeight - (newYNE - dragStart.cropY)
          break
        case 'sw':
          const newXSW = Math.max(margin, Math.min(dragStart.cropX + deltaX, dragStart.cropX + dragStart.cropWidth - minSize))
          newCropArea.x = newXSW
          newCropArea.width = dragStart.cropWidth - (newXSW - dragStart.cropX)
          newCropArea.height = Math.max(minSize, Math.min(dragStart.cropHeight + deltaY, canvas.height - dragStart.cropY - margin))
          break
        case 'se':
          newCropArea.width = Math.max(minSize, Math.min(dragStart.cropWidth + deltaX, canvas.width - dragStart.cropX - margin))
          newCropArea.height = Math.max(minSize, Math.min(dragStart.cropHeight + deltaY, canvas.height - dragStart.cropY - margin))
          break
        case 'center':
          newCropArea.x = Math.max(margin, Math.min(dragStart.cropX + deltaX, canvas.width - dragStart.cropWidth - margin))
          newCropArea.y = Math.max(margin, Math.min(dragStart.cropY + deltaY, canvas.height - dragStart.cropHeight - margin))
          break
      }

      // Enforce canvas pixel boundaries
      newCropArea.x = Math.max(margin, Math.min(newCropArea.x, canvas.width - minSize - margin))
      newCropArea.y = Math.max(margin, Math.min(newCropArea.y, canvas.height - minSize - margin))
      newCropArea.width = Math.max(minSize, Math.min(newCropArea.width, canvas.width - newCropArea.x - margin))
      newCropArea.height = Math.max(minSize, Math.min(newCropArea.height, canvas.height - newCropArea.y - margin))

      if (newCropArea.x + newCropArea.width > canvas.width - margin) {
        newCropArea.width = canvas.width - newCropArea.x - margin
      }
      if (newCropArea.y + newCropArea.height > canvas.height - margin) {
        newCropArea.height = canvas.height - newCropArea.y - margin
      }

      setCropArea(newCropArea)
    })
  }

  const handleMouseUp = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIsDragging(false)
    setDragHandle(null)
  }

  const applyCrop = async () => {
    if (!cropArea || !pages[editingPageIndex]) return

    try {
      console.log('✂️ Applying crop:', cropArea)
      const pageIndex = editingPageIndex
      const page = pages[pageIndex]
      const originalPage = originalPages[pageIndex]

      // Get the current rendered canvas
      const displayCanvas = canvasRef.current
      if (!displayCanvas) {
        console.error('❌ Display canvas not available')
        return
      }

      if (cropArea.width < 10 || cropArea.height < 10) {
        console.warn('Crop area too small')
        return
      }

      // Step 1: Extract the cropped region from the display canvas
      // CRITICAL FIX: Normalize bounds when crop extends beyond canvas edges
      // When cropY < 0, we must reduce cropHeight by the overshoot amount
      let cropX = Math.round(cropArea.x)
      let cropY = Math.round(cropArea.y)
      let cropWidth = Math.round(cropArea.width)
      let cropHeight = Math.round(cropArea.height)
      
      // Adjust for top overshoot
      if (cropY < 0) {
        cropHeight += cropY  // Reduce height by overshoot (cropY is negative)
        cropY = 0
      }
      
      // Adjust for left overshoot
      if (cropX < 0) {
        cropWidth += cropX  // Reduce width by overshoot (cropX is negative)
        cropX = 0
      }
      
      // Clamp to canvas boundaries
      cropWidth = Math.min(cropWidth, displayCanvas.width - cropX)
      cropHeight = Math.min(cropHeight, displayCanvas.height - cropY)
      
      // Guard against extreme overshoot producing invalid dimensions
      cropWidth = Math.max(1, cropWidth)
      cropHeight = Math.max(1, cropHeight)
      
      console.log(`✂️ Normalized crop bounds: (${cropX}, ${cropY}) ${cropWidth}×${cropHeight} on canvas ${displayCanvas.width}×${displayCanvas.height}`)
      
      if (cropWidth < 10 || cropHeight < 10) {
        console.warn('⚠️ Normalized crop area too small after boundary adjustment')
        return
      }

      const croppedCanvas = document.createElement('canvas')
      croppedCanvas.width = cropWidth
      croppedCanvas.height = cropHeight
      const croppedCtx = croppedCanvas.getContext('2d')
      
      croppedCtx.drawImage(
        displayCanvas,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      )

      // Step 2: Create final canvas at DISPLAY CANVAS dimensions (not page.width/height)
      // CRITICAL FIX: Use displayCanvas dimensions to handle scanned PDFs with non-standard metadata
      // Some PDFs have page.width/height that don't match the actual rendered canvas size
      const finalCanvas = document.createElement('canvas')
      finalCanvas.width = displayCanvas.width  // Use display canvas width (fixes scanned PDFs)
      finalCanvas.height = displayCanvas.height  // Use display canvas height
      const finalCtx = finalCanvas.getContext('2d')

      // Fill with white background
      finalCtx.fillStyle = 'white'
      finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)

      // CENTER the cropped content on the page using shared helper
      const fitToPage = settings.fitCropToPage || false
      const drawParams = computeCenteredCropDrawParams(finalCanvas.width, finalCanvas.height, cropWidth, cropHeight, fitToPage)
      finalCtx.drawImage(croppedCanvas, drawParams.drawX, drawParams.drawY, drawParams.drawWidth, drawParams.drawHeight)
      
      console.log(`📐 Crop preview: cropped region (${cropWidth}×${cropHeight}) centered at (${drawParams.drawX.toFixed(1)}, ${drawParams.drawY.toFixed(1)})${fitToPage ? ' [FIT TO PAGE]' : ''}`)
      console.log(`🔍 DIAGNOSTIC - Final canvas dimensions: ${finalCanvas.width}×${finalCanvas.height}, Aspect: ${(finalCanvas.width/finalCanvas.height).toFixed(3)}`)
      console.log(`🔍 DIAGNOSTIC - Original page dimensions: ${page.width}×${page.height}, Display canvas was: ${displayCanvas.width}×${displayCanvas.height}`)

      // Step 3: Store crop information for export (normalized 0-1 coordinates)
      const normalizedCropArea = {
        x: cropX / displayCanvas.width,
        y: cropY / displayCanvas.height,
        width: cropWidth / displayCanvas.width,
        height: cropHeight / displayCanvas.height
      }

      // Update pages
      const updatedPages = [...pages]
      updatedPages[pageIndex] = {
        ...page,
        canvas: finalCanvas,
        width: displayCanvas.width,  // Use display canvas width (fixes scanned PDFs)
        height: displayCanvas.height,  // Use display canvas height
        thumbnail: finalCanvas.toDataURL('image/jpeg', 0.6),
        edited: true,
        cropInfo: normalizedCropArea,  // Keep for backward compat
        editHistory: {
          ...page.editHistory,
          cropArea: normalizedCropArea,  // ✅ Use cropArea for pdf-lib export
          isCropped: true,  // ✅ CRITICAL: Flag for proper scaling in preview
          fitCropToPage: settings.fitCropToPage || false  // ✅ Store fit-to-page preference
        }
      }

      setPages(updatedPages)
      
      // Also update originalPages to persist the crop (only for single pages, not sheets)
      if (pagesPerSheet === 2 && page.isSheet) {
        // Skip updating originalPages for N-up sheets to avoid corruption
        // Sheets are regenerated from originalPages, so we can't store sheet crops there
        console.log('⚠️ Cropping N-up sheets does not persist to originalPages')
      } else {
        // Update originalPages for single pages
        const updatedOriginalPages = [...originalPages]
        const origIndex = pagesPerSheet === 2 
          ? originalPages.findIndex(p => p.pageNumber === page.pageNumber)
          : pageIndex
        
        if (origIndex >= 0 && origIndex < updatedOriginalPages.length) {
          const origPage = updatedOriginalPages[origIndex]
          updatedOriginalPages[origIndex] = {
            ...origPage,
            canvas: finalCanvas,
            width: displayCanvas.width,  // Use display canvas width (fixes scanned PDFs)
            height: displayCanvas.height,  // Use display canvas height
            thumbnail: finalCanvas.toDataURL('image/jpeg', 0.6),
            edited: true,
            cropInfo: normalizedCropArea,  // Keep for backward compat
            editHistory: {
              ...origPage.editHistory,
              cropArea: normalizedCropArea,  // ✅ Use cropArea for pdf-lib export
              isCropped: true,  // ✅ CRITICAL: Flag for proper scaling in preview
              fitCropToPage: settings.fitCropToPage || false  // ✅ Store fit-to-page preference
            }
          }
          setOriginalPages(updatedOriginalPages)
          console.log('✅ Crop persisted to originalPages for page', page.pageNumber)
        }
      }
      setCropMode(false)
      setCropArea(null)

      // Update the canvas immediately
      requestAnimationFrame(() => {
        if (canvasRef.current) {
          const canvas = canvasRef.current
          const ctx = canvas.getContext('2d')
          canvas.width = finalCanvas.width
          canvas.height = finalCanvas.height
          ctx.drawImage(finalCanvas, 0, 0)
          
          // CRITICAL: Recalculate imageRect after crop to fix scanned PDF preview width
          // Without this, imageRect is stale from before crop, causing narrow preview
          setTimeout(() => {
            updateImageRect()
            console.log('✅ ImageRect recalculated after crop - preview should show correct width')
          }, 50) // Small delay to let canvas render
        }
      })

      // Dispatch update event
      const editedPagesMap = {}
      updatedPages.forEach(p => {
        if (p.edited) {
          editedPagesMap[p.pageNumber] = {
            thumbnail: p.thumbnail,
            edited: true,
            canvas: p.canvas,
            cropInfo: p.cropInfo  // Keep for backward compat
          }
        }
      })

      const updateEvent = new CustomEvent('pdfEditorUpdate', {
        detail: {
          editedPages: editedPagesMap,
          updatedPages: updatedPages
        }
      })
      window.dispatchEvent(updateEvent)

      console.log('✅ Crop applied successfully - content scaled to fill page')

    } catch (error) {
      console.error('❌ Error applying crop:', error)
    }
  }


  const resetSettings = () => {
    setSettings({
      rotation: 0,
      scale: 100,
      offsetX: 0,
      offsetY: 0
    })
    setUserScale(100)
  }

  const applyToAllPages = () => {
    console.info('[ApplyAll] 🚨 applyToAllPages clicked - showing modal 🚨')
    setShowApplyWarning(true)
  }

  const confirmApplyToAll = async () => {
    console.info('[ApplyAll] ⭐⭐⭐ confirmApplyToAll START ⭐⭐⭐', Date.now())
    
    // Start animation at 0% immediately for instant response
    setIsApplyingAll(true)
    setApplyAllProgress(0)
    
    // CRITICAL: Let React render the UI update BEFORE doing any processing
    // This ensures the user sees the animation start immediately
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => requestAnimationFrame(resolve))

    try {
      console.log('🔄 Apply All: Applying to loaded pages')
      
      // Get current page's crop info to apply universally
      const currentPageCropInfo = pages[editingPageIndex]?.cropInfo
      
      // Store settings for lazy-loaded pages (for pages that will load later)
      applyAllSettingsRef.current = {
        settings: { ...settings },
        userScale,
        currentPageSize,
        cropInfo: currentPageCropInfo
      }
      console.log('💾 Stored Apply All settings for future-loaded pages')
      
      // Helper to update progress
      const updateProgress = (progress) => {
        setApplyAllProgress(progress)
      }
      
      // Show initial progress
      updateProgress(0.05) // 5% - started
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      updateProgress(0.1) // 10% - gathered state

      // Get target page size dimensions with correct orientation
      const targetPageSize = getOrientationAwarePageSize(currentPageSize)
      
      // Process currently loaded pages
      const totalPagesCount = pdf?.numPages || allPages.length
      console.log(`📄 Processing ${originalPages.length} loaded pages (out of ${totalPagesCount} total)`)
      console.log(`⚡ Unloaded pages will get settings when they're viewed`)
      console.log(`📋 Loaded page numbers:`, originalPages.map(p => p.pageNumber).join(', '))
      
      // For loaded pages: apply settings immediately
      const processedPages = []
      const totalPages = originalPages.length
      
      for (let index = 0; index < originalPages.length; index++) {
      const originalPage = originalPages[index]
      console.log(`📄 Applying settings to loaded page ${originalPage.pageNumber}`)
      
      // Update progress (10% to 70% range based on page processing)
      const pageProgress = 0.1 + (index / totalPages) * 0.6
      updateProgress(pageProgress)
      if (index % 5 === 0) { // Update UI every 5 pages for performance
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
      
      // Create fresh canvas for this page
      const pageCanvas = document.createElement('canvas')
      const pageCtx = pageCanvas.getContext('2d', { alpha: false, willReadFrequently: false })
      pageCtx.imageSmoothingEnabled = true
      pageCtx.imageSmoothingQuality = 'medium'
      
      // Use target page size dimensions
      pageCanvas.width = targetPageSize.width
      pageCanvas.height = targetPageSize.height
      
      // White background
      pageCtx.fillStyle = 'white'
      pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      
      // Apply transformations
      pageCtx.save()
      pageCtx.translate(pageCanvas.width / 2, pageCanvas.height / 2)
      pageCtx.translate(settings.offsetX, settings.offsetY)

      // Apply rotation
      if (settings.rotation !== 0) {
        pageCtx.rotate((settings.rotation * Math.PI) / 180)
      }

      // Calculate scaling
      const normalizedRotation = ((settings.rotation % 360) + 360) % 360
      const isRotated90or270 = normalizedRotation === 90 || normalizedRotation === 270
      
      let scaleToFit
      if (isRotated90or270) {
        const scaleX = pageCanvas.width / originalPage.height
        const scaleY = pageCanvas.height / originalPage.width
        scaleToFit = Math.min(scaleX, scaleY)
      } else {
        const scaleX = pageCanvas.width / originalPage.width
        const scaleY = pageCanvas.height / originalPage.height
        scaleToFit = Math.min(scaleX, scaleY)
      }

      const contentScale = settings.scale / 100
      const finalScale = scaleToFit * contentScale
      
      // ALWAYS use pristine original - completely overwrites any previous edits
      const sourceCanvas = originalPage.pristineOriginal || originalPage.originalCanvas || originalPage.canvas
      const drawWidth = originalPage.width * finalScale
      const drawHeight = originalPage.height * finalScale
      
      pageCtx.drawImage(sourceCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
      pageCtx.restore()

      // Apply crop if exists (universal - same crop to all pages)
      let finalCanvas = pageCanvas
      if (currentPageCropInfo) {
        console.log(`✂️ Applying universal crop to page ${index + 1}`)
        
        const cropX = Math.round(currentPageCropInfo.x * pageCanvas.width)
        const cropY = Math.round(currentPageCropInfo.y * pageCanvas.height)
        const cropWidth = Math.round(currentPageCropInfo.width * pageCanvas.width)
        const cropHeight = Math.round(currentPageCropInfo.height * pageCanvas.height)
        
        // Extract cropped region
        const croppedCanvas = document.createElement('canvas')
        croppedCanvas.width = cropWidth
        croppedCanvas.height = cropHeight
        const croppedCtx = croppedCanvas.getContext('2d')
        croppedCtx.drawImage(pageCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
        
        // Create final canvas at ORIGINAL page dimensions (keep page size unchanged)
        finalCanvas = document.createElement('canvas')
        finalCanvas.width = targetPageSize.width  // Keep original page width
        finalCanvas.height = targetPageSize.height  // Keep original page height
        const finalCtx = finalCanvas.getContext('2d')
        
        // Fill with white background
        finalCtx.fillStyle = 'white'
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
        
        // CENTER the cropped content on the page using shared helper
        const fitToPage = settings.fitCropToPage || false
        const drawParams = computeCenteredCropDrawParams(finalCanvas.width, finalCanvas.height, cropWidth, cropHeight, fitToPage)
        finalCtx.drawImage(croppedCanvas, drawParams.drawX, drawParams.drawY, drawParams.drawWidth, drawParams.drawHeight)
        
        console.log(`  📐 Canvas save crop: centered at (${drawParams.drawX.toFixed(1)}, ${drawParams.drawY.toFixed(1)}) with size ${drawParams.drawWidth.toFixed(1)}×${drawParams.drawHeight.toFixed(1)}${fitToPage ? ' [FIT TO PAGE]' : ''}`)
      }

      // Apply color mode filter
      if (colorMode === 'BW') {
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = finalCanvas.width
        tempCanvas.height = finalCanvas.height
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.filter = 'grayscale(100%)'
        tempCtx.drawImage(finalCanvas, 0, 0)
        finalCanvas = document.createElement('canvas')
        finalCanvas.width = tempCanvas.width
        finalCanvas.height = tempCanvas.height
        const finalCtx = finalCanvas.getContext('2d')
        finalCtx.fillStyle = 'white'
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
        finalCtx.drawImage(tempCanvas, 0, 0)
      }
      
      // Add completely fresh page - all previous edits overwritten
      // CRITICAL: Preserve pristineOriginal for subsequent Apply All operations
      processedPages.push({
        ...originalPage,
        canvas: finalCanvas,
        thumbnail: generateThumbnail(finalCanvas, 0.5, 0.6), // Use helper for consistent thumbnails
        edited: true,
        cropInfo: currentPageCropInfo, // Same crop for all (or undefined if no crop)
        pristineOriginal: originalPage.pristineOriginal || originalPage.originalCanvas || originalPage.canvas, // ⭐ PRESERVE for next Apply All
        editHistory: {
          rotation: settings.rotation,    // KEEP for pdf-lib export
          scale: settings.scale,          // KEEP for pdf-lib export
          offsetX: settings.offsetX,      // KEEP for pdf-lib export
          offsetY: settings.offsetY,      // KEEP for pdf-lib export
          cropArea: currentPageCropInfo,  // Use the actual crop info (normalized coordinates)
          fitCropToPage: settings.fitCropToPage || false  // ✅ Store fit-to-page preference
        }
      })
    }
    
    // Processing complete (70% progress)
    updateProgress(0.7)
    await new Promise(resolve => requestAnimationFrame(resolve))
    
    // N-up sheet regeneration progress (70% to 90%)
    updateProgress(0.9)
    await new Promise(resolve => requestAnimationFrame(resolve))
    
    // Handle N-up mode: regenerate sheets from processed pages
    if (pagesPerSheet === 2) {
      console.log('📄 Regenerating N-up sheets from processed pages')
      const processedSheets = []
      for (let i = 0; i < processedPages.length; i += 2) {
        const page1 = processedPages[i]
        const page2 = processedPages[i + 1]

        const filtered1 = applyColorFilter(page1.canvas, colorMode)

        if (page2) {
          const filtered2 = applyColorFilter(page2.canvas, colorMode)
          const combinedCanvas = combineConsecutivePagesForGrid(filtered1, filtered2, getOrientationAwarePageSize(currentPageSize))

          processedSheets.push({
            pageNumber: `${page1.pageNumber}-${page2.pageNumber}`,
            canvas: combinedCanvas,
            originalCanvas: combinedCanvas,
            thumbnail: generateThumbnail(combinedCanvas, 0.5, 0.6), // Use helper for consistent thumbnails
            width: combinedCanvas.width,
            height: combinedCanvas.height,
            isSheet: true,
            containsPages: [page1.pageNumber, page2.pageNumber],
            edited: true
          })
        } else {
          processedSheets.push({
            ...page1,
            canvas: filtered1,
            width: filtered1.width,
            height: filtered1.height,
            thumbnail: generateThumbnail(filtered1, 0.5, 0.6), // Use helper for consistent thumbnails
            edited: true,
            isSheet: false
          })
        }
      }
      setPages(processedSheets)
      setOriginalPages(processedPages)
      
      // Sync to allPages
      setAllPages(prev => prev.map(placeholder => {
        const updatedSheet = processedSheets.find(s => {
          if (s.isSheet && s.containsPages) {
            return s.containsPages.includes(placeholder.pageNumber)
          }
          return s.pageNumber === placeholder.pageNumber
        })
        if (updatedSheet && updatedSheet.thumbnail) {
          return {
            ...placeholder,
            thumbnail: updatedSheet.thumbnail,
            isLoaded: true,
            edited: true
          }
        }
        return placeholder
      }))
    } else {
      // Normal mode: just update pages
      setOriginalPages(processedPages)
      setPages(processedPages)
      
      // Sync to allPages
      setAllPages(prev => prev.map(placeholder => {
        const updatedPage = processedPages.find(p => p.pageNumber === placeholder.pageNumber)
        if (updatedPage && updatedPage.thumbnail) {
          return {
            ...placeholder,
            thumbnail: updatedPage.thumbnail,
            isLoaded: true,
            edited: true
          }
        }
        return placeholder
      }))
    }
    
    // Create notification for all pages
    const editedPagesMap = {}
    processedPages.forEach(page => {
      editedPagesMap[page.pageNumber] = {
        thumbnail: page.thumbnail,
        edited: true,
        canvas: page.canvas
      }
    })
    
    // Notify components about updates
    const updateEvent = new CustomEvent('pdfEditorUpdate', {
      detail: { editedPages: editedPagesMap }
    })
    window.dispatchEvent(updateEvent)
    
    const genericUpdateEvent = new Event('fileUpdated')
    window.dispatchEvent(genericUpdateEvent)
    
      const unloadedPageCount = totalPagesCount - processedPages.length
      console.log('✅ Apply All Complete Summary:')
      console.log(`   📊 Total pages in PDF: ${totalPagesCount}`)
      console.log(`   ✅ Pages processed immediately: ${processedPages.length}`)
      console.log(`   ⏳ Pages will be processed when loaded: ${unloadedPageCount}`)
      console.log(`   📋 Processed page numbers:`, processedPages.map(p => p.pageNumber).join(', '))
      console.log(`   ⚙️  Settings applied:`, settings)
      
      // Complete animation (100%)
      updateProgress(1.0)
      await new Promise(resolve => requestAnimationFrame(resolve))
      
    } catch (error) {
      console.error('❌ Error in Apply All:', error)
    } finally {
      // Brief delay to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Close modal and reset animation state
      setShowApplyWarning(false)
      setIsApplyingAll(false)
      setApplyAllProgress(0)
    }
  }
  
  const applyAllChanges = async () => {
    // Start animation at 0% immediately
    setIsApplying(true)
    setApplyProgress(0)
    
    try {
      // Auto-apply any pending crop before saving
      if (cropMode && cropArea && !isDragging) {
        applyCrop()
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      // Process with progress tracking
      await finalizeSave()
      
    } catch (error) {
      console.error('❌ Error applying changes:', error)
      setIsApplying(false)
      setApplyProgress(0)
    }
  }

  const finalizeSave = async () => {
    // Capture state needed for processing
    const capturedState = {
      pageIndex: editingPageIndex,
      currentCanvas: canvasRef.current,
      pages: [...pages],
      originalPages: [...originalPages],
      settings: { ...settings },
      colorMode,
      pagesPerSheet,
      directPageEdit
    }
    
    console.log('⚡ Processing edits with progress tracking...')
    
    // Progress callback
    const updateProgress = (progress) => {
      setApplyProgress(progress)
    }
    
    try {
      // Process with progress updates - NO minimum duration
      await performFinalizeSave(capturedState, updateProgress)
      
      // Close editor immediately when done
      setShowEditPopup(false)
      setIsApplying(false)
      setApplyProgress(0)
      
      // For directPageEdit mode, call onCancel after processing completes
      if (capturedState.directPageEdit) {
        onCancel()
      }
    } catch (error) {
      console.error('❌ Error in save:', error)
      setShowEditPopup(false)
      setIsApplying(false)
      setApplyProgress(0)
      if (capturedState.directPageEdit) {
        onCancel()
      }
    }
  }

  const performFinalizeSave = async (capturedState, updateProgress) => {
    // Destructure captured state
    const { pageIndex, currentCanvas, pages, originalPages, settings, colorMode, pagesPerSheet, directPageEdit } = capturedState
    
    // Stage 1: Gather state (10% progress)
    updateProgress(0.1)
    await new Promise(resolve => requestAnimationFrame(resolve))
    
    if (currentCanvas && pages[pageIndex]) {
      // Create a new canvas to store the final edited state
      const finalCanvas = document.createElement('canvas')
      const finalCtx = finalCanvas.getContext('2d')
      finalCanvas.width = currentCanvas.width
      finalCanvas.height = currentCanvas.height
      finalCtx.drawImage(currentCanvas, 0, 0)

      // Determine which original pages are being edited
      let originalPageIndices = [pageIndex]
      const isSheet = pagesPerSheet === 2 && pages[pageIndex]?.isSheet

      if (isSheet) {
        // In 2-up mode, we're editing a sheet that contains 2 pages
        originalPageIndices = [
          pageIndex * 2,
          pageIndex * 2 + 1
        ].filter(idx => idx < originalPages.length)
      }

      // Update the originalPages array with edits
      // CRITICAL: Create a clean copy without carrying over old edited flags
      const updatedOriginalPages = originalPages.map(page => ({ ...page }))

      // Stage 2: Apply edits to pages (10% to 70% progress)
      const totalPages = originalPageIndices.length
      let processedPages = 0
      
      // Apply edits to ONLY the pages in the current view
      originalPageIndices.forEach((origIdx) => {
        // For each page, create its own canvas with edits applied
        const pageCanvas = document.createElement('canvas')
        const pageCtx = pageCanvas.getContext('2d')

        // Keep original page dimensions (don't swap!)
        const originalPage = originalPages[origIdx]
        pageCanvas.width = originalPage.width
        pageCanvas.height = originalPage.height

        // Fill with white background
        pageCtx.fillStyle = 'white'
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)

        // Apply transformations to this specific page
        pageCtx.save()
        pageCtx.translate(pageCanvas.width / 2, pageCanvas.height / 2)
        pageCtx.translate(settings.offsetX, settings.offsetY)

        if (settings.rotation !== 0) {
          pageCtx.rotate((settings.rotation * Math.PI) / 180)
        }

        // ROTATION SCALING LOGIC - Same as main page
        const rotation = settings.rotation % 360
        const isRotated90or270 = rotation === 90 || rotation === 270
        
        let scaleToFit
        if (isRotated90or270) {
          // ALWAYS use Math.min to keep content within page boundaries
          const scaleX = pageCanvas.width / originalPage.height
          const scaleY = pageCanvas.height / originalPage.width
          scaleToFit = Math.min(scaleX, scaleY)
        } else {
          // Normal fit for non-rotated content
          const scaleX = pageCanvas.width / originalPage.width
          const scaleY = pageCanvas.height / originalPage.height
          scaleToFit = Math.min(scaleX, scaleY)
        }

        const contentScale = settings.scale / 100
        const finalScale = scaleToFit * contentScale
        
        // Choose source canvas based on CURRENT page's crop (not old cropInfo from Apply All)
        let sourceCanvas, sourceWidth, sourceHeight
        const currentPageCropInfo = pages[editingPageIndex]?.cropInfo
        if (currentPageCropInfo && originalPage.pageNumber === pages[editingPageIndex].pageNumber) {
          // Use cropped canvas ONLY if currently editing this page with active crop
          sourceCanvas = originalPage.canvas
          sourceWidth = originalPage.canvas.width
          sourceHeight = originalPage.canvas.height
          console.log('✂️ Using cropped canvas for save - crop is permanent')
        } else {
          // Use pristine original (prevents rotation/filter compounding, ignores old crops)
          sourceCanvas = originalPage.pristineOriginal || originalPage.originalCanvas || originalPage.canvas
          sourceWidth = originalPage.width
          sourceHeight = originalPage.height
        }
        
        const drawWidth = sourceWidth * finalScale
        const drawHeight = sourceHeight * finalScale
        pageCtx.drawImage(sourceCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
        pageCtx.restore()

        // Apply color mode filter - optimized using canvas filter
        if (colorMode === 'BW') {
          const tempCanvas = document.createElement('canvas')
          tempCanvas.width = pageCanvas.width
          tempCanvas.height = pageCanvas.height
          const tempCtx = tempCanvas.getContext('2d')
          tempCtx.filter = 'grayscale(100%)'
          tempCtx.drawImage(pageCanvas, 0, 0)
          pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height)
          pageCtx.fillStyle = 'white'
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
          pageCtx.drawImage(tempCanvas, 0, 0)
        }

        // Update canvas but PRESERVE pristineOriginal (NEVER modify it)
        // Use lower quality (0.4) for faster thumbnail generation
        updatedOriginalPages[origIdx] = {
          ...updatedOriginalPages[origIdx],
          canvas: pageCanvas,
          pristineOriginal: originalPage.pristineOriginal || originalPage.originalCanvas,  // KEEP pristine
          originalCanvas: originalPage.pristineOriginal || originalPage.originalCanvas,    // KEEP pristine
          width: originalPage.width,
          height: originalPage.height,
          thumbnail: pageCanvas.toDataURL('image/jpeg', 0.4), // Lower quality for faster generation
          edited: true,
          editHistory: {
            ...updatedOriginalPages[origIdx].editHistory,
            rotation: settings.rotation,    // KEEP for pdf-lib export
            scale: settings.scale,          // KEEP for pdf-lib export
            offsetX: settings.offsetX,      // KEEP for pdf-lib export
            offsetY: settings.offsetY,      // KEEP for pdf-lib export
            cropArea: updatedOriginalPages[origIdx].editHistory?.cropArea || null  // Preserve existing crop
          }
        }
        
        // Update progress per page
        processedPages++
        const pageProgress = 0.1 + (0.6 * processedPages / totalPages)
        updateProgress(pageProgress)
      })

      // Stage 3: Update state (70% progress)
      updateProgress(0.7)
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      setOriginalPages(updatedOriginalPages)

      // CRITICAL: Build map of ONLY the pages edited in THIS session
      // Only include pages from originalPageIndices (the ones we just edited)
      const updatedPagesMap = new Map()
      originalPageIndices.forEach(origIdx => {
        const page = updatedOriginalPages[origIdx]
        if (page) {
          updatedPagesMap.set(page.pageNumber, page)
        }
      })

      // Stage 4: Regenerate sheets/pages (70% to 90% progress)
      updateProgress(0.75)
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      // If in N-up mode, only update sheets that contain edited pages
      if (pagesPerSheet === 2) {
        // Keep existing pages array and only update the specific sheets that were edited
        setPages(prevPages => {
          return prevPages.map((sheet, sheetIndex) => {
            if (!sheet.isSheet) {
              // Single page sheet - check if it was updated
              const updatedPage = updatedPagesMap.get(sheet.pageNumber)
              if (updatedPage) {
                const filtered = applyColorFilter(updatedPage.canvas, colorMode)
                return {
                  ...updatedPage,
                  canvas: filtered,
                  thumbnail: filtered.toDataURL('image/jpeg', 0.4) // Lower quality for faster generation
                }
              }
              return sheet
            }

            // For 2-page sheets, check if either page was updated
            const page1Num = sheet.containsPages[0]
            const page2Num = sheet.containsPages[1]
            const page1 = updatedPagesMap.get(page1Num)
            const page2 = page2Num ? updatedPagesMap.get(page2Num) : null

            // If neither page was updated, keep the sheet as-is
            if (!page1 && !page2) {
              return sheet
            }

            // At least one page was updated - but we need BOTH pages to regenerate the sheet
            // Try to get both pages from updatedOriginalPages (the newly updated pages with edits)
            const actualPage1 = page1 || updatedOriginalPages.find(p => p.pageNumber === page1Num)
            const actualPage2 = page2 || (page2Num ? updatedOriginalPages.find(p => p.pageNumber === page2Num) : null)

            // If we don't have both pages loaded, keep the existing sheet unchanged
            // This prevents collapsing sheets when only one page is loaded
            if (!actualPage1 || (page2Num && !actualPage2)) {
              console.log(`⚠️ Cannot regenerate sheet ${page1Num}-${page2Num}: missing page data, keeping existing sheet`)
              return sheet
            }

            // We have complete data - regenerate this sheet
            const filtered1 = applyColorFilter(actualPage1.canvas, colorMode)

            if (actualPage2) {
              const filtered2 = applyColorFilter(actualPage2.canvas, colorMode)
              const combinedCanvas = combineConsecutivePagesForGrid(filtered1, filtered2, getOrientationAwarePageSize(currentPageSize))

              return {
                pageNumber: `${actualPage1.pageNumber}-${actualPage2.pageNumber}`,
                canvas: combinedCanvas,
                originalCanvas: combinedCanvas,
                thumbnail: combinedCanvas.toDataURL('image/jpeg', 0.4), // Lower quality for faster generation
                width: combinedCanvas.width,
                height: combinedCanvas.height,
                isSheet: true,
                containsPages: [actualPage1.pageNumber, actualPage2.pageNumber],
                edited: actualPage1.edited || actualPage2.edited
              }
            } else {
              return {
                ...actualPage1,
                canvas: filtered1,
                thumbnail: filtered1.toDataURL('image/jpeg', 0.6)
              }
            }
          })
        })
        
        // Sync only the updated page thumbnails to allPages
        // CRITICAL: Only mark as edited if in updatedPagesMap (edited THIS session)
        setAllPages(prev => prev.map(placeholder => {
          const updatedPage = updatedPagesMap.get(placeholder.pageNumber)
          if (updatedPage) {
            return {
              ...placeholder,
              thumbnail: updatedPage.thumbnail || placeholder.thumbnail,
              isLoaded: true,
              edited: true  // Only these pages edited in THIS session
            }
          }
          return placeholder  // Other pages keep their current state
        }))
      } else {
        // In normal mode, only update the specific pages that were edited
        setPages(prevPages => {
          return prevPages.map(page => {
            const updatedPage = updatedPagesMap.get(page.pageNumber)
            if (updatedPage) {
              const filtered = applyColorFilter(updatedPage.canvas, colorMode)
              return {
                ...updatedPage,
                canvas: filtered,
                thumbnail: filtered.toDataURL('image/jpeg', 0.6)
              }
            }
            return page
          })
        })
        
        // Sync only the updated page thumbnails to allPages
        // CRITICAL: Only mark as edited if in updatedPagesMap (edited THIS session)
        setAllPages(prev => prev.map(placeholder => {
          const updatedPage = updatedPagesMap.get(placeholder.pageNumber)
          if (updatedPage) {
            return {
              ...placeholder,
              thumbnail: updatedPage.thumbnail || placeholder.thumbnail,
              isLoaded: true,
              edited: true  // Only these pages edited in THIS session
            }
          }
          return placeholder  // Other pages keep their current state
        }))
      }
      
      // Stage 5: Complete (100% progress)
      updateProgress(1.0)
      await new Promise(resolve => requestAnimationFrame(resolve))
      
      // Handle direct page edit mode
      if (directPageEdit && onSave) {
        const createUpdatedPDF = async () => {
          try {
            console.log(`📄 Creating updated PDF for direct page edit mode with ${allPages.length} total pages...`)
            
            // Create a map of edited pages by page number for quick lookup
            const editedPagesMap = new Map()
            updatedOriginalPages.forEach(page => {
              if (page.edited) {
                editedPagesMap.set(page.pageNumber, page)
              }
            })
            
            console.log(`📝 Found ${editedPagesMap.size} edited pages in loaded pages`)
            
            // CRITICAL: Check if "Apply All" was used
            // If so, we need to apply settings to ALL pages, not just loaded ones
            const hasApplyAllSettings = applyAllSettingsRef.current !== null
            if (hasApplyAllSettings) {
              console.log(`⚡ "Apply All" was used - will apply settings to ALL ${allPages.length} pages`)
            }
            
            // If NO pages were edited AND no "Apply All" settings, just return the original file
            if (editedPagesMap.size === 0 && !hasApplyAllSettings) {
              console.log('✅ No edits detected, returning original PDF')
              onSave(file)
              return
            }
            
            // Load the original PDF and modify it in-place
            const arrayBuffer = await file.arrayBuffer()
            const pdfDoc = await PDFDocument.load(arrayBuffer)
            
            console.log(`🔧 Applying transformations (canvas for crop, metadata for others)`)
            
            // Separate pages that need canvas recomposition vs metadata-only
            // Canvas recomposition needed for: crop, rotation, scale, or offset
            const recomposedPages = new Map()  // Pages needing form XObject redraw
            const metadataOnlyPages = new Map()  // Truly untouched pages
            
            // Add already-loaded edited pages
            for (const [pageNum, editedPage] of editedPagesMap.entries()) {
              const history = editedPage.editHistory
              // Check if page needs canvas recomposition (ONLY crop - rotation and scale use metadata)
              const needsRecomposition = history?.cropArea
              
              console.log(`🔍 Page ${pageNum} categorization:`, {
                hasCrop: !!history?.cropArea,
                hasRotation: !!history?.rotation,
                hasScale: !!history?.scale,
                needsRecomposition,
                willUse: needsRecomposition ? 'CANVAS (image)' : 'METADATA (vector)'
              })
              
              if (needsRecomposition) {
                recomposedPages.set(pageNum, editedPage)
              } else {
                metadataOnlyPages.set(pageNum, editedPage)
              }
            }
            
            // CRITICAL: If "Apply All" was used, apply settings to ALL remaining pages
            if (hasApplyAllSettings) {
              const totalPages = pdfDoc.getPageCount()
              const storedSettings = applyAllSettingsRef.current
              const { cropInfo } = storedSettings
              
              console.log(`⚡ Applying "Apply All" settings to ${totalPages - editedPagesMap.size} unloaded pages...`)
              
              for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                // Skip pages that are already in editedPagesMap (already processed)
                if (editedPagesMap.has(pageNum)) {
                  continue
                }
                
                // Create a virtual page with the stored editHistory
                const virtualPage = {
                  pageNumber: pageNum,
                  editHistory: {
                    ...storedSettings.settings,
                    cropArea: cropInfo || null
                  }
                }
                
                // Check if page needs canvas recomposition (ONLY crop - rotation and scale use metadata)
                const needsRecomposition = cropInfo
                
                if (needsRecomposition) {
                  recomposedPages.set(pageNum, virtualPage)
                } else {
                  metadataOnlyPages.set(pageNum, virtualPage)
                }
              }
              
              console.log(`✅ Added ${totalPages - editedPagesMap.size} pages from "Apply All" settings`)
            }
            
            console.log(`📊 Recomposed pages (canvas): ${recomposedPages.size}, Metadata-only pages: ${metadataOnlyPages.size}`)
            
            // For recomposed pages: Only crop (uses canvas to preserve quality)
            for (const [pageNum, editedPage] of recomposedPages.entries()) {
              const editHistory = editedPage.editHistory
              console.log(`📝 Cropping page ${pageNum}`)
              
              const pageIndex = pageNum - 1
              const srcPage = pdfDoc.getPage(pageIndex)
              const { width, height } = srcPage.getSize()
              
              // Use the canvas if available (for loaded pages)
              const pageCanvas = editedPage.canvas
              
              if (pageCanvas && editHistory.cropArea) {
                // Crop coordinates relative to canvas dimensions
                const cropX = editHistory.cropArea.x * pageCanvas.width
                const cropY = editHistory.cropArea.y * pageCanvas.height
                const cropWidth = editHistory.cropArea.width * pageCanvas.width
                const cropHeight = editHistory.cropArea.height * pageCanvas.height
                
                console.log(`  ✂️ Crop area on canvas: [${cropX.toFixed(1)}, ${cropY.toFixed(1)}, ${cropWidth.toFixed(1)}×${cropHeight.toFixed(1)}]`)
                
                // Create cropped canvas
                const exportCanvas = document.createElement('canvas')
                const exportCtx = exportCanvas.getContext('2d')
                exportCanvas.width = cropWidth
                exportCanvas.height = cropHeight
                
                // Draw the cropped portion
                exportCtx.drawImage(
                  pageCanvas,
                  cropX, cropY, cropWidth, cropHeight,
                  0, 0, cropWidth, cropHeight
                )
                
                // Embed canvas as PNG image
                const imageDataUrl = exportCanvas.toDataURL('image/png')
                const imageBytes = Uint8Array.from(atob(imageDataUrl.split(',')[1]), c => c.charCodeAt(0))
                const pngImage = await pdfDoc.embedPng(imageBytes)
                
                // Replace page and draw image CENTERED using shared helper
                pdfDoc.removePage(pageIndex)
                const newPage = pdfDoc.insertPage(pageIndex, [width, height])
                
                // Use shared helper for consistent centering
                const fitToPage = editHistory.fitCropToPage || false
                const drawParams = computeCenteredCropDrawParams(width, height, cropWidth, cropHeight, fitToPage)
                
                // Note: PDF coordinate system has origin at bottom-left, so invert Y
                newPage.drawImage(pngImage, {
                  x: drawParams.drawX,
                  y: height - drawParams.drawY - drawParams.drawHeight,
                  width: drawParams.drawWidth,
                  height: drawParams.drawHeight
                })
                
                console.log(`  ✅ Page cropped and embedded centered at (${drawParams.drawX.toFixed(1)}, ${drawParams.drawY.toFixed(1)}) with size ${drawParams.drawWidth.toFixed(1)}×${drawParams.drawHeight.toFixed(1)}${fitToPage ? ' [FIT TO PAGE]' : ''}`)
              }
            }
            
            // For metadata-only pages (no geometric transforms)
            for (const [pageNum, editedPage] of metadataOnlyPages.entries()) {
              const pageIndex = pageNum - 1
              let page = pdfDoc.getPage(pageIndex)
              const history = editedPage.editHistory
              
              if (!history) continue
              
              const { width, height } = page.getSize()
              
              console.log(`📝 Applying metadata transformations to page ${pageNum}:`, {
                rotation: history.rotation,
                scale: history.scale,
                offset: [history.offsetX, history.offsetY]
              })
              
              const rotation = history.rotation || 0
              const scaleFactor = (history.scale || 100) / 100
              const offsetX = history.offsetX || 0
              const offsetY = history.offsetY || 0
              
              // For rotation: embed pristine page and redraw with rotation (prevents compounding)
              if (rotation !== 0) {
                console.log(`  ↻ Applying ${rotation}° rotation by redrawing page`)
                
                // Embed the current page state as Form XObject
                const [embeddedPage] = await pdfDoc.embedPages([page])
                
                // Calculate dimensions after rotation
                let pageWidth = width
                let pageHeight = height
                
                // For 90/270 rotations, dimensions stay the same (content rotates inside)
                // The page orientation doesn't change
                
                // Clear the page by removing and reinserting
                const currentPageIndex = pdfDoc.getPages().indexOf(page)
                pdfDoc.removePage(currentPageIndex)
                const newPage = pdfDoc.insertPage(currentPageIndex, [pageWidth, pageHeight])
                
                // Calculate rotation parameters
                // pdf-lib uses degrees, and rotation is around bottom-left origin
                const centerX = pageWidth / 2
                const centerY = pageHeight / 2
                
                // For 90/270, scale content to fit
                let drawScale = 1
                if (rotation === 90 || rotation === 270 || rotation === -90 || rotation === -270) {
                  drawScale = Math.min(pageWidth / pageHeight, pageHeight / pageWidth)
                }
                
                // Draw the embedded page with rotation
                // Translate to center, rotate, translate back
                let x = centerX
                let y = centerY
                
                if (rotation === 90) {
                  x = centerX - (pageHeight * drawScale) / 2
                  y = centerY - (pageWidth * drawScale) / 2
                } else if (rotation === 270 || rotation === -90) {
                  x = centerX - (pageHeight * drawScale) / 2
                  y = centerY - (pageWidth * drawScale) / 2
                }
                
                newPage.drawPage(embeddedPage, {
                  x: x,
                  y: y,
                  width: pageWidth * drawScale,
                  height: pageHeight * drawScale,
                  rotate: { type: 'degrees', angle: rotation }
                })
                
                console.log(`  ✅ Page redrawn with ${rotation}° rotation (scale: ${drawScale.toFixed(3)}x)`)
                
                // Update page reference
                page = newPage
              }
              
              // Apply scale from center
              if (scaleFactor !== 1) {
                const centerX = width / 2
                const centerY = height / 2
                page.translateContent(-centerX, -centerY)
                page.scaleContent(scaleFactor, scaleFactor)
                page.translateContent(centerX, centerY)
                console.log(`  🔍 Scaled content to ${scaleFactor}x`)
              }
              
              // Apply offset
              if (offsetX !== 0 || offsetY !== 0) {
                page.translateContent(offsetX, -offsetY)
                console.log(`  ↔️ Offset by [${offsetX}, ${-offsetY}]`)
              }
            }
            
            console.log(`✅ Export complete: ${recomposedPages.size} recomposed (canvas), ${metadataOnlyPages.size} metadata-only`)

            const pdfBytes = await pdfDoc.save()
            const editedFile = new File([pdfBytes], file.name, { type: 'application/pdf' })

            console.log('✅ PDF created successfully, saving...')
            onSave(editedFile)

          } catch (error) {
            console.error('❌ Error creating updated PDF:', error)
            onCancel()
          }
        }
        
        createUpdatedPDF()
        return
      }

      // For regular mode, notify PDFPageSelector about the updates
      // CRITICAL: Only include pages that were ACTUALLY edited in this session
      const editedPagesMap = {}
      originalPageIndices.forEach(origIdx => {
        const page = updatedOriginalPages[origIdx]
        if (page && page.edited) {
          editedPagesMap[page.pageNumber] = {
            thumbnail: page.thumbnail,
            edited: true,
            canvas: page.canvas
          }
        }
      })

      console.log(`📢 Dispatching update for ${Object.keys(editedPagesMap).length} edited pages:`, Object.keys(editedPagesMap))

      const updateEvent = new CustomEvent('pdfEditorUpdate', {
        detail: { editedPages: editedPagesMap }
      })
      window.dispatchEvent(updateEvent)
    }
    
    // Return successfully (onCancel will be called in finalizeSave's then block for directPageEdit)
  }

  const exportPDF = async () => {
    try {
      setLoading(true)
      
      console.log(`📄 Exporting PDF with ${allPages.length} total pages, ${originalPages.length} loaded`)
      
      // Create a map of edited pages by page number for quick lookup
      const editedPagesMap = new Map()
      originalPages.forEach(page => {
        if (page.edited && page.editHistory) {
          editedPagesMap.set(page.pageNumber, page)
        }
      })
      
      console.log(`📝 Found ${editedPagesMap.size} edited pages in loaded pages`)
      
      // CRITICAL: Check if "Apply All" was used
      const hasApplyAllSettings = applyAllSettingsRef.current !== null
      if (hasApplyAllSettings) {
        console.log(`⚡ "Apply All" was used - will apply settings to ALL ${allPages.length} pages`)
      }
      
      // If NO pages were edited AND no "Apply All" settings, just return the original file
      if (editedPagesMap.size === 0 && !hasApplyAllSettings) {
        console.log('✅ No edits detected, returning original PDF')
        
        // Notify PDFPageSelector (no edits)
        const updateEvent = new CustomEvent('pdfEditorUpdate', {
          detail: { 
            editedPages: {},
            finalPDF: file
          }
        })
        window.dispatchEvent(updateEvent)
        
        onSave(file)
        return
      }
      
      // Load the original PDF
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)
      
      console.log(`🔧 Applying transformations (canvas for crop, metadata for others)`)
      
      // All pages use vector-preserving methods - no canvas rasterization
      const transformedPages = new Map()
      
      // Add already-loaded edited pages
      for (const [pageNum, editedPage] of editedPagesMap.entries()) {
        const history = editedPage.editHistory
        
        const hasCrop = !!history?.cropArea
        const hasRotation = !!history?.rotation
        const hasScale = history?.scale && history?.scale !== 100
        
        console.log(`🔍 Page ${pageNum}:`, {
          hasCrop,
          hasRotation,
          hasScale,
          method: 'VECTOR (transformation matrix + clipping)'
        })
        
        transformedPages.set(pageNum, editedPage)
      }
      
      // CRITICAL: If "Apply All" was used, apply settings to ALL remaining pages
      if (hasApplyAllSettings) {
        const totalPages = pdfDoc.getPageCount()
        const storedSettings = applyAllSettingsRef.current
        const { cropInfo } = storedSettings
        
        console.log(`⚡ Applying "Apply All" settings to ${totalPages - editedPagesMap.size} unloaded pages...`)
        
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          // Skip pages that are already in editedPagesMap (already processed)
          if (editedPagesMap.has(pageNum)) {
            continue
          }
          
          // Create a virtual page with the stored editHistory
          const virtualPage = {
            pageNumber: pageNum,
            editHistory: {
              ...storedSettings.settings,
              cropArea: cropInfo || null
            }
          }
          
          transformedPages.set(pageNum, virtualPage)
        }
        
        console.log(`✅ Added ${totalPages - editedPagesMap.size} pages from "Apply All" settings`)
      }
      
      console.log(`📊 Total transformed pages: ${transformedPages.size} (all using vector methods)`)
      
      // Apply all transformations using vector-preserving methods
      for (const [pageNum, editedPage] of transformedPages.entries()) {
        const pageIndex = pageNum - 1
        const srcPage = pdfDoc.getPage(pageIndex)
        const { width, height} = srcPage.getSize()
        const history = editedPage.editHistory
        
        if (!history) continue
        
        const hasCrop = !!history.cropArea
        const hasRotation = !!history.rotation
        const hasScale = history.scale && history.scale !== 100
        
        console.log(`📝 Processing page ${pageNum}:`, {
          hasCrop,
          hasRotation,
          hasScale,
          method: 'Vector-preserving (transformation matrix + clipping)'
        })
        
        // Use transformation helper to get proper parameters
        const transform = buildGeometricTransform(
          { width, height },
          { width, height },
          history
        )
        
        // Embed source page as Form XObject
        const [embeddedPage] = await pdfDoc.embedPages([srcPage])
        
        // Replace page
        pdfDoc.removePage(pageIndex)
        const newPage = pdfDoc.insertPage(pageIndex, [width, height])
        
        // White background
        newPage.drawRectangle({
          x: 0,
          y: 0,
          width: width,
          height: height,
          color: { type: 'RGB', red: 1, green: 1, blue: 1 }
        })
        
        // Apply transformations using graphics state and operators
        newPage.pushOperators(pushGraphicsState())
        
        // CRITICAL ORDER: Center crop → Rotate/Scale → Clip → Draw
        // This centers the cropped content on the page while preserving vectors
        
        // Get crop coordinates in PDF space (bottom-left origin)
        const cropX = transform.sourceRect.x
        const pdfCropY = height - transform.sourceRect.y - transform.sourceRect.height
        const cropWidth = transform.sourceRect.width
        const cropHeight = transform.sourceRect.height
        
        // Step 1: Translate to CENTER the crop on the page
        // This positions (0,0) in user space at the location where the crop should start
        const centerOffsetX = (width - cropWidth) / 2
        const centerOffsetY = (height - cropHeight) / 2
        newPage.pushOperators(
          concatTransformationMatrix(1, 0, 0, 1, centerOffsetX, centerOffsetY)
        )
        console.log(`  📐 Centering crop: offset by [${centerOffsetX.toFixed(1)}, ${centerOffsetY.toFixed(1)}]`)
        
        // Step 2: Apply rotation and scale (around crop region center)
        if (hasRotation || hasScale) {
          const rotation = history.rotation || 0
          const radians = (-rotation * Math.PI) / 180  // Negate for CCW
          const cos = Math.cos(radians)
          const sin = Math.sin(radians)
          const scale = transform.finalScale
          
          // Center of rotation is crop center (in current coordinates)
          const centerX = cropWidth / 2
          const centerY = cropHeight / 2
          
          // Translate to center
          newPage.pushOperators(
            concatTransformationMatrix(1, 0, 0, 1, centerX, centerY)
          )
          
          // Rotate and scale
          newPage.pushOperators(
            concatTransformationMatrix(
              scale * cos,  // a
              scale * sin,  // b
              -scale * sin, // c
              scale * cos,  // d
              0,            // e
              0             // f
            )
          )
          
          // Translate back from center
          newPage.pushOperators(
            concatTransformationMatrix(1, 0, 0, 1, -centerX, -centerY)
          )
          
          console.log(`  ↻ Applied rotation ${rotation}° and scale ${scale.toFixed(3)}x around crop center`)
        }
        
        // Step 3: Apply clipping (at origin with crop dimensions)
        if (hasCrop) {
          // Clip rectangle at (0,0) with crop dimensions
          newPage.pushOperators(
            moveTo(0, 0),
            lineTo(cropWidth, 0),
            lineTo(cropWidth, cropHeight),
            lineTo(0, cropHeight),
            closePath(),
            clip(),
            endPath()
          )
          console.log(`  ✂️ Crop clip: [0, 0, ${cropWidth.toFixed(1)}×${cropHeight.toFixed(1)}]`)
        }
        
        // Step 4: Draw the embedded page
        // Position it so the crop region appears at (0,0) in current space
        const drawX = -cropX
        const drawY = -pdfCropY
        
        newPage.drawPage(embeddedPage, {
          x: drawX,
          y: drawY,
          width: width,
          height: height
        })
        
        newPage.pushOperators(popGraphicsState())
        
        console.log(`  ✅ Page transformed (vectors preserved)`)
      }
      
      console.log(`✅ Export complete: ${transformedPages.size} pages with vector-preserving transforms`)
      
      const pdfBytes = await pdfDoc.save()
      const editedFile = new File([pdfBytes], file.name, { type: 'application/pdf' })
      
      // Notify PDFPageSelector about the final export
      const editedPagesNotification = {}
      originalPages.forEach(page => {
        if (page.edited) {
          editedPagesNotification[page.pageNumber] = {
            thumbnail: page.thumbnail,
            edited: true,
            canvas: page.canvas
          }
        }
      })
      
      const updateEvent = new CustomEvent('pdfEditorUpdate', {
        detail: { 
          editedPages: editedPagesNotification,
          finalPDF: editedFile
        }
      })
      window.dispatchEvent(updateEvent)
      
      onSave(editedFile)
      
    } catch (error) {
      console.error('❌ Error exporting PDF:', error)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
      console.error('Error name:', error.name)
      alert(`Error exporting PDF: ${error.message || error}`)
    } finally {
      setLoading(false)
    }
  }


  if (error) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 bg-red-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
          <X className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Error Loading PDF</h3>
        <p className="text-gray-600 mb-6">{error}</p>
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-all duration-200"
        >
          Close Editor
        </button>
      </div>
    )
  }

  // Document Viewer (Main View) - Only show if not directPageEdit and not showEditPopup
  if (!showEditPopup && !directPageEdit) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-3 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900">PDF Editor</h2>
              <p className="text-xs sm:text-sm text-gray-600">
                {pages.length > 0 ? `${pdf?.numPages || allPages.length} pages` : 'Loading...'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={exportPDF}
              disabled={loading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 sm:gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 text-xs sm:text-sm"
            >
              {loading ? (
                <>
                  <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3 h-3 sm:w-4 sm:h-4" />
                  Save
                </>
              )}
            </button>
            <button
              onClick={onCancel}
              className="flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs sm:text-sm"
            >
              <X className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          </div>
        </div>

        {/* Loading Banner - Single top-level progress indicator */}
        <LoadingExperience 
          loadingStage={loadingStage}
          loadedCount={allPages.filter(p => p.isLoaded).length}
          totalPages={allPages.length}
        />

        {/* Pages Grid - Always render from allPages for scroll detection */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {allPages.map((page, index) => {
            const isSelected = onPageSelect && selectedPages.includes(page.pageNumber)
            
            return (
            <div
              key={page.pageNumber}
              ref={el => pageRefs.current[page.pageNumber] = el}
              data-page-number={page.pageNumber}
              className={`relative bg-white border-2 rounded-lg p-2 hover:shadow-lg transition-all overflow-hidden ${
                isSelected 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-blue-400'
              }`}
            >
              {/* Selection Checkbox - Only show if onPageSelect is provided */}
              {onPageSelect && !page.isSheet && (
                <div className="absolute top-1 left-1 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onPageSelect(page.pageNumber)
                    }}
                    className="bg-white rounded shadow-sm p-1 hover:bg-gray-50"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              )}
              
              {/* Page Preview */}
              <div 
                className="relative mb-1.5 cursor-pointer"
                onClick={() => {
                  if (onPageSelect && !page.isSheet) {
                    onPageSelect(page.pageNumber)
                  }
                }}
              >
                <div className="aspect-[3/4] bg-gray-50 rounded overflow-hidden border border-gray-200">
                  {(page.isLoaded || page.thumbnail) && page.thumbnail ? (
                    <img
                      src={page.thumbnail}
                      alt={`Page ${page.pageNumber}`}
                      className="w-full h-full object-contain p-1 animate-fade-in"
                    />
                  ) : (
                    <ShimmerLoader width="100%" height="100%" />
                  )}
                </div>

                {/* Edit Status Badge */}
                {page.edited && (
                  <div className="absolute top-1 right-1 bg-green-500 text-white px-2 py-0.5 rounded text-[10px] font-semibold">
                    Edited
                  </div>
                )}
              </div>

              {/* Page Info */}
              <div className="text-center mb-1.5">
                <h3 className="font-semibold text-gray-800 text-xs">{page.isSheet ? `Pages ${page.pageNumber}` : `Page ${page.pageNumber}`}</h3>
              </div>

              {/* Edit Button */}
              <button
                onClick={() => {
                  // Load page if not loaded before editing
                  if (!page.isLoaded && !page.isSheet) {
                    loadSinglePage(page.pageNumber).then(() => {
                      // Find the index in the pages array after loading
                      const pageIndex = pages.findIndex(p => p.pageNumber === page.pageNumber)
                      if (pageIndex !== -1) {
                        openEditPopup(pageIndex)
                      }
                    })
                  } else {
                    const pageIndex = pages.findIndex(p => p.pageNumber === page.pageNumber)
                    if (pageIndex !== -1) {
                      openEditPopup(pageIndex)
                    }
                  }
                }}
                disabled={page.isLoading}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Edit3 className="w-3 h-3" />
                {page.isLoading ? 'Loading...' : 'Edit'}
              </button>
            </div>
            );
          })}
        </div>
      </div>
    )
  }

  // Edit Popup (Full Screen) - Show when showEditPopup is true OR directPageEdit is true
  const currentPage = pages[editingPageIndex]

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-2 py-2 sm:px-4 sm:py-3 flex items-center justify-between flex-shrink-0 shadow-md">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Edit3 className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold truncate">Page {currentPage?.pageNumber}</h2>
              <div className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                colorMode === 'Color'
                  ? 'bg-pink-500 text-white'
                  : 'bg-white/25 text-white'
              }`}>
                {colorMode === 'Color' ? '🎨' : '⚫'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-1 bg-white/15 rounded-md px-2 py-1">
              <button
                onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-xs font-bold px-1">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
            
            <button
              onClick={closeEditPopup}
              className="p-1.5 bg-white/15 hover:bg-white/25 rounded transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Display Area - Maximum Space */}
        <div className="flex-1 bg-gray-100 flex items-center justify-center relative overflow-auto">
          <div
            ref={imageContainerRef}
            className="image-container relative w-full h-full flex items-center justify-center"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchMove={(e) => {
              if (isDragging) {
                e.preventDefault()
                const touch = e.touches[0]
                handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} })
              }
            }}
            onTouchEnd={handleMouseUp}
          >
            {currentPage && (
              <>
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-full object-contain"
                />
                
                {/* Grid Overlay */}
                {showGrid && (
                  <div 
                    className="absolute inset-0 pointer-events-none opacity-30"
                    style={{
                      backgroundImage: `
                        linear-gradient(rgba(59, 130, 246, 0.3) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(59, 130, 246, 0.3) 1px, transparent 1px)
                      `,
                      backgroundSize: '20px 20px'
                    }}
                  />
                )}
                
                {cropMode && cropArea && canvasRef.current && (() => {
                  const canvas = canvasRef.current

                  // Get the canvas element's actual rendered position in the DOM
                  const canvasRect = canvas.getBoundingClientRect()
                  const container = canvas.closest('.image-container')
                  const containerRect = container.getBoundingClientRect()

                  // The canvas CSS size in the DOM - MUST divide by zoom!
                  // canvasRect.width is already zoomed, we need the base unzoomed size
                  const canvasDOMWidth = canvasRect.width / zoom
                  const canvasDOMHeight = canvasRect.height / zoom

                  // The canvas internal size (in canvas pixels)
                  const canvasPixelWidth = canvas.width
                  const canvasPixelHeight = canvas.height

                  // Ratio to convert canvas pixels to DOM pixels (zoom-independent)
                  const pixelToDOMRatioX = canvasDOMWidth / canvasPixelWidth
                  const pixelToDOMRatioY = canvasDOMHeight / canvasPixelHeight

                  // Convert crop area (in canvas pixels) to DOM pixels
                  const domX = cropArea.x * pixelToDOMRatioX
                  const domY = cropArea.y * pixelToDOMRatioY
                  const domWidth = cropArea.width * pixelToDOMRatioX
                  const domHeight = cropArea.height * pixelToDOMRatioY

                  // Calculate canvas position relative to container (accounting for centering)
                  const canvasLeft = (containerRect.width / zoom - canvasDOMWidth) / 2
                  const canvasTop = (containerRect.height / zoom - canvasDOMHeight) / 2

                  console.log('🎨 Crop overlay (CANVAS PIXEL SPACE):', {
                    canvasPixels: `(${cropArea.x.toFixed(1)}, ${cropArea.y.toFixed(1)})`,
                    canvasSize: `${cropArea.width.toFixed(1)}×${cropArea.height.toFixed(1)}`,
                    domPos: `(${domX.toFixed(1)}, ${domY.toFixed(1)})`,
                    domSize: `${domWidth.toFixed(1)}×${domHeight.toFixed(1)}`,
                    canvasPosition: `(${canvasLeft.toFixed(1)}, ${canvasTop.toFixed(1)})`
                  })

                  return (
                    <div className="absolute inset-0 pointer-events-none">
                      <div
                        className="absolute border-2 border-blue-500 bg-blue-500/10 backdrop-blur-sm pointer-events-auto"
                        style={{
                          left: canvasLeft + domX,
                          top: canvasTop + domY,
                          width: domWidth,
                          height: domHeight,
                          transition: 'none'
                        }}
                      >
                        <div className="absolute inset-0 border-2 border-dashed border-white/80 rounded-sm" />

                        <div className="absolute inset-0 opacity-40">
                          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white" />
                          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white" />
                          <div className="absolute top-1/3 left-0 right-0 h-px bg-white" />
                          <div className="absolute top-2/3 left-0 right-0 h-px bg-white" />
                        </div>

                        {[
                          { handle: 'nw', position: { left: -10, top: -10 }, cursor: 'nw-resize' },
                          { handle: 'ne', position: { right: -10, top: -10 }, cursor: 'ne-resize' },
                          { handle: 'sw', position: { left: -10, bottom: -10 }, cursor: 'sw-resize' },
                          { handle: 'se', position: { right: -10, bottom: -10 }, cursor: 'se-resize' }
                        ].map(({ handle, position, cursor }) => (
                          <div
                            key={handle}
                            className={`absolute w-8 h-8 sm:w-7 sm:h-7 bg-gradient-to-br from-blue-400 to-blue-600 border-3 border-white rounded-full shadow-lg cursor-${cursor} hover:scale-110 active:scale-125 transition-all duration-150 hover:shadow-xl z-10 pointer-events-auto touch-none`}
                            style={position}
                            onMouseDown={(e) => handleMouseDown(e, handle)}
                            onTouchStart={(e) => {
                              e.preventDefault()
                              const touch = e.touches[0]
                              handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} }, handle)
                            }}
                          />
                        ))}

                        <div
                          className="absolute w-10 h-10 sm:w-9 sm:h-9 bg-gradient-to-br from-blue-500 to-purple-600 border-3 border-white rounded-full shadow-lg cursor-move hover:scale-110 active:scale-125 transition-all duration-150 hover:shadow-xl flex items-center justify-center z-10 pointer-events-auto touch-none"
                          style={{
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                          }}
                          onMouseDown={(e) => handleMouseDown(e, 'center')}
                          onTouchStart={(e) => {
                            e.preventDefault()
                            const touch = e.touches[0]
                            handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} }, 'center')
                          }}
                        >
                          <Move className="w-4 h-4 text-white" />
                        </div>

                        <div className="absolute -top-8 left-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-2 py-1 rounded text-xs font-medium shadow-lg pointer-events-none">
                          📐 {Math.round(cropArea.width)} × {Math.round(cropArea.height)}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        </div>

        {/* Compact Bottom Controls */}
        <div className="bg-gray-50 border-t border-gray-200 p-2 flex-shrink-0">
          {/* Tab Navigation */}
          <div className="flex gap-1 mb-2">
            {[
              { id: 'pagesize', label: 'Size', icon: Maximize2 },
              { id: 'crop', label: 'Crop', icon: Crop },
              { id: 'transform', label: 'Transform', icon: RotateCw }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg font-semibold transition-colors text-xs flex-1 ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Compact Controls in One Horizontal Line */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Page Size Controls */}
            {activeTab === 'pagesize' && (
              <>
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2 shadow-sm flex-wrap">
                  <div className="flex items-center gap-2">
                    <Maximize2 className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-medium whitespace-nowrap">Page Size:</span>
                  </div>
                  <Dropdown
                    value={tempPageSize}
                    onChange={setTempPageSize}
                    options={Object.entries(PAGE_SIZES).map(([key, size]) => ({
                      value: key,
                      label: size.displayName
                    }))}
                    fullWidth={false}
                    className="min-w-[180px]"
                  />
                </div>
                <button
                  onClick={() => {
                    setCurrentPageSize(tempPageSize)
                    if (onPageSizeChange) {
                      onPageSizeChange(tempPageSize)
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-xs font-semibold"
                >
                  <Check className="w-3.5 h-3.5" />
                  Apply
                </button>
              </>
            )}

            {/* Crop Controls */}
            {activeTab === 'crop' && (
              <>
                {/* Warning for N-up sheets - crop disabled */}
                {pagesPerSheet === 2 && pages[editingPageIndex]?.isSheet ? (
                  <div className="w-full bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-yellow-800">
                        <p className="font-semibold mb-1">⚠️ Crop Cannot Be Applied to N-up Sheets</p>
                        <p className="mt-1 font-medium">Recommended: Switch to individual pages (remove N-up), apply crop to each page separately, then re-enable N-up mode.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {!cropMode ? (
                      <button
                        onClick={startCrop}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-xs font-semibold"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        Start
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={applyCrop}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-xs font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Apply
                        </button>
                        <button
                          onClick={() => {
                            setCropMode(false)
                            setCropArea(null)
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-xs font-semibold"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => setShowGrid(!showGrid)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold ${
                        showGrid 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-white text-gray-700 border border-gray-300'
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" />
                      Grid
                    </button>
                    
                    {/* Fit to Page checkbox */}
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={settings.fitCropToPage || false}
                        onChange={(e) => setSettings(prev => ({ ...prev, fitCropToPage: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-xs font-semibold text-gray-700">Fit to Page</span>
                    </label>
                  </>
                )}
              </>
            )}

            {/* Transform Controls */}
            {activeTab === 'transform' && (
              <div className="flex flex-col gap-2.5 w-full">
                {/* Rotation */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, rotation: (prev.rotation - 90 + 360) % 360 }))}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Rotate Left"
                  >
                    <RotateCcw className="w-4 h-4 text-gray-700" />
                  </button>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }))}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Rotate Right"
                  >
                    <RotateCw className="w-4 h-4 text-gray-700" />
                  </button>
                  <div className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">
                    {settings.rotation}°
                  </div>
                  <div className="w-px h-6 bg-gray-300 mx-1"></div>
                  <button
                    onClick={resetSettings}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-xs font-medium"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset
                  </button>
                  <button
                    onClick={applyToAllPages}
                    disabled={isApplyingAll}
                    className={`relative flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium ml-auto overflow-hidden ${
                      isApplyingAll 
                        ? 'bg-violet-600 cursor-wait' 
                        : 'bg-violet-600 hover:bg-violet-700 transition-colors'
                    }`}
                  >
                    {/* Progress-based animation */}
                    {isApplyingAll && (
                      <div className="absolute inset-0 overflow-hidden">
                        <div 
                          className="absolute top-0 left-0 bottom-0 bg-white/40 transition-all duration-75 ease-linear"
                          style={{ width: `${applyAllProgress * 100}%` }}
                        />
                      </div>
                    )}
                    
                    <div className="relative flex items-center gap-1.5 z-10">
                      <FileText className="w-3.5 h-3.5" />
                      {isApplyingAll ? 'Applying...' : 'Apply to All'}
                    </div>
                  </button>
                </div>

                {/* Scale */}
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <span className="text-xs text-gray-600 font-medium min-w-[36px]">Scale</span>
                  <input
                    type="range"
                    min="10"
                    max="700"
                    step="5"
                    value={userScale}
                    onChange={(e) => {
                      const newScale = parseInt(e.target.value)
                      setUserScale(newScale)
                      setSettings(prev => ({ ...prev, scale: newScale }))
                    }}
                    className="flex-1 h-1.5"
                  />
                  <span className="text-xs text-gray-700 font-medium min-w-[42px] text-right">{userScale}%</span>
                </div>

                {/* Horizontal Position */}
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <span className="text-xs text-gray-600 font-medium min-w-[36px]">Horiz</span>
                  <input
                    type="range"
                    min="-300"
                    max="300"
                    value={settings.offsetX}
                    onChange={(e) => setSettings(prev => ({ ...prev, offsetX: parseInt(e.target.value) }))}
                    className="flex-1 h-1.5"
                  />
                  <span className="text-xs text-gray-700 font-medium min-w-[42px] text-right">{settings.offsetX}px</span>
                </div>

                {/* Vertical Position */}
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <span className="text-xs text-gray-600 font-medium min-w-[36px]">Vert</span>
                  <input
                    type="range"
                    min="-300"
                    max="300"
                    value={settings.offsetY}
                    onChange={(e) => setSettings(prev => ({ ...prev, offsetY: parseInt(e.target.value) }))}
                    className="flex-1 h-1.5"
                  />
                  <span className="text-xs text-gray-700 font-medium min-w-[42px] text-right">{settings.offsetY}px</span>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, offsetX: 0, offsetY: 0 }))}
                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-xs font-medium"
                    title="Center content"
                  >
                    Center
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={applyAllChanges}
              disabled={isApplying}
              className={`relative w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all text-xs font-medium overflow-hidden ${
                isApplying 
                  ? 'bg-violet-600 cursor-wait' 
                  : 'bg-violet-600 hover:bg-violet-700 hover:shadow-lg'
              } text-white`}
            >
              {/* Progress-based animation */}
              {isApplying && (
                <div className="absolute inset-0 overflow-hidden">
                  <div 
                    className="absolute top-0 left-0 bottom-0 bg-white/40 transition-all duration-75 ease-linear"
                    style={{ width: `${applyProgress * 100}%` }}
                  />
                </div>
              )}
              
              <div className="relative flex items-center gap-2 z-10">
                {isApplying ? (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Applying Changes...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {directPageEdit ? 'Save & Close' : 'Apply Changes'}
                  </>
                )}
              </div>
            </button>
          </div>
        </div>

      {/* Apply All Confirmation Dialog */}
      {showApplyWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Apply to All Pages</h3>
                  <p className="text-blue-100 text-sm">Confirm your action</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-gray-700 text-sm leading-relaxed mb-1">
                Apply current <span className="font-semibold text-gray-900">
                  {activeTab === 'color' ? 'color adjustments' : activeTab === 'transform' ? 'transform settings' : 'settings'}
                </span> to all pages in the document?
              </p>
              <p className="text-gray-500 text-xs mt-2">
                ⚡ <strong>Instant operation</strong> - applies to loaded pages immediately. Unloaded pages will get these settings when viewed.
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setShowApplyWarning(false)}
                disabled={isApplyingAll}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmApplyToAll}
                disabled={isApplyingAll}
                className={`relative px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 shadow-md overflow-hidden ${
                  isApplyingAll 
                    ? 'bg-blue-600 cursor-wait' 
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 hover:shadow-lg'
                }`}
              >
                {/* Progressive fill animation */}
                {isApplyingAll && (
                  <div className="absolute inset-0 overflow-hidden">
                    <div 
                      className="absolute top-0 left-0 bottom-0 bg-white/30"
                      style={{ width: `${applyAllProgress * 100}%` }}
                    />
                  </div>
                )}
                
                <span className="relative z-10">
                  {isApplyingAll ? 'Applying to All...' : 'Apply to All'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PDFEditor
