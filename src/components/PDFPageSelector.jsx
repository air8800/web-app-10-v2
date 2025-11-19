import React, { useState, useEffect, lazy, Suspense } from 'react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url'
import { PDFDocument } from 'pdf-lib'
import { SquareCheck as CheckSquare, Square, Eye, FileText, Loader, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Maximize2, Minimize2, CreditCard as Edit, Scissors, RotateCw } from 'lucide-react'
import { getPageSize, DEFAULT_PAGE_SIZE } from '../utils/pageSizes'

const PDFEditor = lazy(() => import('./PDFEditor'))

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const PAGES_PER_BATCH = 2 // Load 2 pages at a time for faster first paint

const QUALITY_TIERS = {
  ULTRA_LOW: 'ULTRA_LOW',
  APPROPRIATE: 'APPROPRIATE',
  BEST: 'BEST'
}

const QUALITY_CONFIG = {
  [QUALITY_TIERS.ULTRA_LOW]: {
    scale: 0.2,
    jpegQuality: 0.4
  },
  [QUALITY_TIERS.APPROPRIATE]: {
    scale: 0.65,
    jpegQuality: 0.6
  },
  [QUALITY_TIERS.BEST]: {
    scale: 2.0,
    jpegQuality: 0.85
  }
}

const CACHE_LIMITS = {
  [QUALITY_TIERS.ULTRA_LOW]: 120,
  [QUALITY_TIERS.APPROPRIATE]: 80,
  [QUALITY_TIERS.BEST]: 12
}

const PDFPageSelector = ({ file, selectedPages, onPagesSelected, pageSize = DEFAULT_PAGE_SIZE, colorMode = 'BW', pagesPerSheet = 1, onEditPage, viewMode = 'grid' }) => {
  const [pages, setPages] = useState([])
  const [originalPages, setOriginalPages] = useState([]) // Store original un-combined pages
  const [totalPages, setTotalPages] = useState(0)
  const [loadedPages, setLoadedPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [initialBatchLoaded, setInitialBatchLoaded] = useState(false) // Track first batch completion
  const [previewPage, setPreviewPage] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAllSelected, setShowAllSelected] = useState(false)
  const [pdf, setPdf] = useState(null)
  const [fitToPageEnabled, setFitToPageEnabled] = useState(true)
  const [currentPageSize, setCurrentPageSize] = useState(pageSize)
  const [currentColorMode, setCurrentColorMode] = useState(colorMode)
  const [currentPagesPerSheet, setCurrentPagesPerSheet] = useState(pagesPerSheet)
  const [qualityCache, setQualityCache] = useState(new Map()) // Cache for different quality renders
  const [upgradingPages, setUpgradingPages] = useState(new Set()) // Track pages being upgraded
  const [previewScale, setPreviewScale] = useState(1) // Content scale for preview zoom
  const [reloadVersion, setReloadVersion] = useState(0) // Counter to force rebuild after edit
  const [currentPageIndex, setCurrentPageIndex] = useState(0) // For single-page view navigation
  const [cropActive, setCropActive] = useState(false) // Crop mode toggle for single view
  const [singlePageEditorOpen, setSinglePageEditorOpen] = useState(false) // Control PDFEditor popup
  const [singlePageEditorIndex, setSinglePageEditorIndex] = useState(0) // Which page to edit
  const [gridExpanded, setGridExpanded] = useState(false) // Toggle between compact and full grid view
  const observerRef = React.useRef(null)
  const scrollObserverRef = React.useRef(null)
  const loadMoreTriggerRef = React.useRef(null)
  const nupCacheRef = React.useRef(new Map())
  const abortControllerRef = React.useRef(null) // Abort ongoing loads when file changes
  
  // Refs to track current state for cleanup (prevent memory leaks)
  const originalPagesRef = React.useRef(originalPages)
  const pagesRef = React.useRef(pages)
  const qualityCacheRef = React.useRef(qualityCache)
  
  // Update refs when state changes
  useEffect(() => {
    originalPagesRef.current = originalPages
  }, [originalPages])
  
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])
  
  useEffect(() => {
    qualityCacheRef.current = qualityCache
  }, [qualityCache])

  // Cleanup on unmount - revoke all blob URLs
  useEffect(() => {
    return () => {
      const revokedURLs = new Set() // Deduplicate to avoid revoking same URL twice
      
      originalPagesRef.current.forEach(page => {
        if (page._blobURL && !revokedURLs.has(page._blobURL)) {
          URL.revokeObjectURL(page._blobURL)
          revokedURLs.add(page._blobURL)
        }
      })
      
      pagesRef.current.forEach(page => {
        if (page._blobURL && !revokedURLs.has(page._blobURL)) {
          URL.revokeObjectURL(page._blobURL)
          revokedURLs.add(page._blobURL)
        }
      })
      
      qualityCacheRef.current.forEach(entry => {
        if (entry.page._blobURL && !revokedURLs.has(entry.page._blobURL)) {
          URL.revokeObjectURL(entry.page._blobURL)
          revokedURLs.add(entry.page._blobURL)
        }
      })
      
      nupCacheRef.current.forEach(sheet => {
        if (sheet._blobURL && !revokedURLs.has(sheet._blobURL)) {
          URL.revokeObjectURL(sheet._blobURL)
          revokedURLs.add(sheet._blobURL)
        }
      })
      
      nupCacheRef.current.clear()
      console.log(`🧹 Cleanup: Revoked ${revokedURLs.size} blob URLs on unmount`)
    }
  }, [])

  useEffect(() => {
    // Abort any ongoing loads when file changes
    if (abortControllerRef.current) {
      console.log('🛑 Aborting previous PDF load')
      abortControllerRef.current.abort()
    }
    
    if (file && file.type === 'application/pdf') {
      // Check if this is a new file or just an edited version
      const isNewFile = totalPages === 0 || !pdf
      
      if (isNewFile) {
        // New file - load from scratch
        loadInitialPDFPages()
      } else {
        // Edited file - reload the loaded pages without resetting placeholders
        console.log('📝 File updated (edited), reloading existing pages without reset')
        reloadExistingPages()
      }
    }
  }, [file])

  useEffect(() => {
    if (pageSize !== currentPageSize && pdf) {
      console.log('📐 Page size changed:', currentPageSize, '->', pageSize)
      setCurrentPageSize(pageSize)
      reloadPagesWithNewSize()
    }
  }, [pageSize])

  useEffect(() => {
    const settingsChanged = colorMode !== currentColorMode || pagesPerSheet !== currentPagesPerSheet
    if (settingsChanged) {
      console.log('🎨 Print settings changed - Color:', colorMode, 'Pages per sheet:', pagesPerSheet)
      setCurrentColorMode(colorMode)
      setCurrentPagesPerSheet(pagesPerSheet)
    }
  }, [colorMode, pagesPerSheet])

  useEffect(() => {
    // Apply settings whenever totalPages is set (even if no pages loaded yet)
    // reloadVersion ensures rebuild after edits even when other deps unchanged
    if (totalPages > 0) {
      console.log('📚 Applying settings to pages...', currentPagesPerSheet)
      applyPrintSettingsToPages()
    }
  }, [currentColorMode, currentPagesPerSheet, totalPages, reloadVersion])

  // Reset currentPageIndex when entering single-page mode
  useEffect(() => {
    if (viewMode === 'single') {
      // Focus on first selected page if selections exist, otherwise reset to 0
      if (selectedPages && selectedPages.length > 0 && pages.length > 0) {
        // Compute filtered pages based on searchTerm
        const filtered = pages.filter(page => {
          if (!searchTerm) return true
          return page.pageNumber.toString().includes(searchTerm)
        })
        
        if (filtered.length > 0) {
          // Find the index of the first selected page in filtered pages
          const firstSelectedPage = Math.min(...selectedPages)
          const indexInFiltered = filtered.findIndex(page => page.pageNumber === firstSelectedPage)
          setCurrentPageIndex(indexInFiltered >= 0 ? indexInFiltered : 0)
        } else {
          setCurrentPageIndex(0)
        }
      } else {
        setCurrentPageIndex(0)
      }
    }
  }, [viewMode, pages, searchTerm, selectedPages])

  // Clamp currentPageIndex when pages/search changes (for single-page view mode)
  useEffect(() => {
    if (viewMode === 'single' && pages.length > 0) {
      // Compute filtered pages based on searchTerm
      const filtered = pages.filter(page => {
        if (!searchTerm) return true
        return page.pageNumber.toString().includes(searchTerm)
      })
      
      if (filtered.length === 0) {
        // Reset to 0 when no results
        setCurrentPageIndex(0)
      } else if (currentPageIndex >= filtered.length) {
        // Clamp to last available page if current index is out of bounds
        setCurrentPageIndex(filtered.length - 1)
      }
    }
  }, [pages.length, searchTerm, viewMode, currentPageIndex])

  const reloadExistingPages = async () => {
    try {
      setLoading(true)
      console.log('🔄 Reloading existing pages after edit...')
      
      const arrayBuffer = await file.arrayBuffer()
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const newTotalPages = pdfDoc.numPages
      
      console.log(`📊 Page count: old=${totalPages}, new=${newTotalPages}`)
      
      setPdf(pdfDoc)
      setTotalPages(newTotalPages)
      
      // Get the page numbers that were previously loaded, but only keep valid ones
      const loadedPageNumbers = originalPages
        .map(p => p.pageNumber)
        .filter(pageNum => pageNum <= newTotalPages)
      
      console.log(`🔄 Reloading ${loadedPageNumbers.length} previously loaded pages (valid in new PDF):`, loadedPageNumbers)
      
      // Re-render only the pages that were already loaded AND still exist
      const pagePromises = loadedPageNumbers.map(pageNum => 
        renderPageThumbnail(pdfDoc, pageNum, fitToPageEnabled)
      )
      
      const renderedPages = await Promise.all(pagePromises)
      const validPages = renderedPages.filter(p => p !== null)
      
      // Replace the originalPages with the newly rendered versions
      const sortedPages = validPages.sort((a, b) => a.pageNumber - b.pageNumber)
      setOriginalPages(sortedPages)
      setPages(sortedPages) // CRITICAL: Also update pages for UI
      
      // Update loadedPages to reflect the highest loaded page
      const maxLoadedPage = validPages.length > 0 
        ? Math.max(...validPages.map(p => p.pageNumber))
        : 0
      setLoadedPages(maxLoadedPage)
      
      // Update selected pages - remove any that are beyond the new page count
      const validSelectedPages = selectedPages.filter(pageNum => pageNum <= newTotalPages)
      if (validSelectedPages.length !== selectedPages.length) {
        console.log(`🔧 Adjusted selection: ${selectedPages.length} → ${validSelectedPages.length} pages`)
        onPagesSelected(validSelectedPages)
      }
      
      console.log(`✅ Reloaded ${validPages.length} pages after edit (new total: ${newTotalPages})`)
      
      // Increment reload version to trigger useEffect rebuild
      // This ensures UI reflects edits even when other dependencies unchanged
      setReloadVersion(prev => prev + 1)
      console.log('🔄 Triggered page rebuild via reloadVersion increment')
      
    } catch (error) {
      console.error('❌ Error reloading pages:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadInitialPDFPages = async () => {
    try {
      // Create new abort controller for this load
      abortControllerRef.current = new AbortController()
      
      setLoading(true)
      setError(null)
      setInitialBatchLoaded(false) // Reset flag for new file
      
      const uploadStartTime = performance.now()
      console.log('⏱️ [UPLOAD START] PDF upload started')
      
      console.log('📄 Starting fast PDF loading...')
      
      // Convert to array buffer
      console.log('📄 Loading file:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB', 'Type:', file.type)
      const arrayBuffer = await file.arrayBuffer()
      console.log('📄 File converted to array buffer, size:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB')
      
      // Load PDF document
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const total = pdfDoc.numPages
      
      console.log(`📄 PDF ready: ${total} pages detected`)
      
      // Verify first page dimensions to confirm normalization
      const firstPage = await pdfDoc.getPage(1)
      const firstPageViewport = firstPage.getViewport({ scale: 1.0 })
      console.log(`📏 First page dimensions: ${firstPageViewport.width.toFixed(1)} x ${firstPageViewport.height.toFixed(1)} (rotation: ${firstPageViewport.rotation}°)`)
      console.log(`📄 Expected A4: 595.3 x 841.9 (portrait) or 841.9 x 595.3 (landscape)`)
      
      // Check if normalization worked
      const isA4Portrait = Math.abs(firstPageViewport.width - 595.3) < 5 && Math.abs(firstPageViewport.height - 841.9) < 5
      const isA4Landscape = Math.abs(firstPageViewport.width - 841.9) < 5 && Math.abs(firstPageViewport.height - 595.3) < 5
      if (isA4Portrait || isA4Landscape) {
        console.log('✅ PDF is A4 size - normalization successful!')
      } else {
        console.warn('⚠️ PDF is NOT A4 size - normalization may have failed!')
        console.warn(`   Current: ${firstPageViewport.width.toFixed(1)} x ${firstPageViewport.height.toFixed(1)}`)
        console.warn(`   Expected: 595.3 x 841.9 (portrait) OR 841.9 x 595.3 (landscape)`)
      }
      
      // Set PDF info immediately to show UI faster
      setPdf(pdfDoc)
      setTotalPages(total)
      
      // Select all pages by default (even if not loaded yet)
      const allPageNumbers = Array.from({ length: total }, (_, i) => i + 1)
      onPagesSelected(allPageNumbers)
      
      // Show grid immediately - fast!
      setLoading(false)
      setInitialBatchLoaded(true)
      
      // Load first batch of pages in background
      console.log(`📄 Loading first ${PAGES_PER_BATCH} pages in background...`)
      loadPageBatch(pdfDoc, 1, Math.min(PAGES_PER_BATCH, total))
        .then(() => {
          const firstPageTime = performance.now()
          const firstPageDelay = ((firstPageTime - uploadStartTime) / 1000).toFixed(2)
          console.log(`⏱️ [FIRST PAGE] First pages loaded at ${firstPageDelay}s after upload`)
        })
        .catch(err => {
          console.error('❌ Error loading initial pages:', err)
        })
      
    } catch (error) {
      console.error('❌ Error loading PDF:', error)
      setError('Failed to load PDF: ' + error.message)
      setLoading(false)
    }
  }

  const loadPageBatch = async (pdfDoc, startPage, endPage) => {
    try {
      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        console.log('🛑 Load aborted, skipping batch')
        return
      }
      
      console.log(`📄 Loading pages ${startPage} to ${endPage}`)
      
      const pagePromises = []
      for (let i = startPage; i <= endPage; i++) {
        pagePromises.push(renderPageThumbnail(pdfDoc, i, fitToPageEnabled))
      }
      
      const renderedPages = await Promise.all(pagePromises)
      
      // Check again after async operation
      if (abortControllerRef.current?.signal.aborted) {
        console.log('🛑 Load aborted after render, discarding pages')
        return
      }
      
      let validPages = renderedPages.filter(p => p !== null)

      setOriginalPages(prev => {
        const existingPageNumbers = new Set(prev.map(p => p.pageNumber))
        const newPages = validPages.filter(p => !existingPageNumbers.has(p.pageNumber))
        return [...prev, ...newPages]
      })
      
      // CRITICAL: Also update pages state so UI shows the loaded thumbnails
      setPages(prev => {
        const existingPageNumbers = new Set(prev.map(p => p.pageNumber))
        const newPages = validPages.filter(p => !existingPageNumbers.has(p.pageNumber))
        return [...prev, ...newPages]
      })

      setLoadedPages(endPage)
      
      console.log(`📄 Loaded ${validPages.length} pages successfully`)
      
    } catch (error) {
      console.error('❌ Error loading page batch:', error)
      throw error
    }
  }

  const loadMorePages = async () => {
    if (!pdf || loadedPages >= totalPages || loadingMore) return
    
    try {
      setLoadingMore(true)
      
      const nextStart = loadedPages + 1
      const nextEnd = Math.min(loadedPages + PAGES_PER_BATCH, totalPages)
      
      await loadPageBatch(pdf, nextStart, nextEnd)
      
    } catch (error) {
      console.error('❌ Error loading more pages:', error)
    } finally {
      setLoadingMore(false)
    }
  }

  const jumpToPage = async (pageNumber) => {
    if (!pdf || pageNumber < 1 || pageNumber > totalPages) return
    
    // Check if page is already loaded
    const pageExists = pages.find(p => p.pageNumber === pageNumber)
    if (pageExists) {
      // Scroll to page
      const pageElement = document.getElementById(`page-${pageNumber}`)
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }
    
    // Load pages up to the requested page
    try {
      setLoadingMore(true)
      
      const batchStart = Math.max(1, pageNumber - 5) // Load a few pages before
      const batchEnd = Math.min(totalPages, pageNumber + 5) // And a few after
      
      // Only load pages we haven't loaded yet
      const pagesToLoad = []
      for (let i = batchStart; i <= batchEnd; i++) {
        if (!pages.find(p => p.pageNumber === i)) {
          pagesToLoad.push(i)
        }
      }
      
      if (pagesToLoad.length > 0) {
        const pagePromises = pagesToLoad.map(pageNum => renderPageThumbnail(pdf, pageNum))
        const renderedPages = await Promise.all(pagePromises)
        const validPages = renderedPages.filter(p => p !== null)
        
        setOriginalPages(prev => {
          const existingPageNumbers = new Set(prev.map(p => p.pageNumber))
          const newPages = validPages.filter(p => !existingPageNumbers.has(p.pageNumber))
          
          if (newPages.length === 0) return prev
          
          const result = [...prev]
          newPages.forEach(page => {
            const insertIndex = result.findIndex(p => p.pageNumber > page.pageNumber)
            if (insertIndex === -1) {
              result.push(page)
            } else {
              result.splice(insertIndex, 0, page)
            }
          })
          return result
        })
        
        // CRITICAL: Also update pages state for UI rendering
        setPages(prev => {
          const existingPageNumbers = new Set(prev.map(p => p.pageNumber))
          const newPages = validPages.filter(p => !existingPageNumbers.has(p.pageNumber))
          
          if (newPages.length === 0) return prev
          
          const result = [...prev]
          newPages.forEach(page => {
            const insertIndex = result.findIndex(p => p.pageNumber > page.pageNumber)
            if (insertIndex === -1) {
              result.push(page)
            } else {
              result.splice(insertIndex, 0, page)
            }
          })
          return result
        })
        
        setLoadedPages(Math.max(loadedPages, batchEnd))
      }
      
      // Scroll to page after loading
      setTimeout(() => {
        const pageElement = document.getElementById(`page-${pageNumber}`)
        if (pageElement) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      
    } catch (error) {
      console.error('❌ Error jumping to page:', error)
    } finally {
      setLoadingMore(false)
    }
  }

  const renderPageThumbnail = async (pdf, pageNumber, fitToPage = true, quality = QUALITY_TIERS.ULTRA_LOW) => {
    try {
      const page = await pdf.getPage(pageNumber)

      // Get quality config for the requested tier
      const qualityConfig = QUALITY_CONFIG[quality] || QUALITY_CONFIG[QUALITY_TIERS.ULTRA_LOW]
      let baseScale = qualityConfig.scale
      const targetPageSize = getPageSize(currentPageSize)

      if (fitToPage) {
        // Calculate scale to fit selected page dimensions
        const originalViewport = page.getViewport({ scale: 1.0 })
        const scaleX = targetPageSize.width / originalViewport.width
        const scaleY = targetPageSize.height / originalViewport.height

        // Use the smaller scale to ensure content fits within bounds (10% margin to prevent overflow)
        const fitScale = Math.min(scaleX, scaleY)
        baseScale = fitScale * baseScale * 0.90
      }

      const viewport = page.getViewport({ scale: baseScale })

      const canvas = document.createElement('canvas')
      // Use optimized context for better performance
      const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
      canvas.height = viewport.height
      canvas.width = viewport.width

      // Fill with white background
      context.fillStyle = 'white'
      context.fillRect(0, 0, canvas.width, canvas.height)

      // Enable high-quality image smoothing for better text rendering
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise

      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', qualityConfig.jpegQuality)
      })
      const blobURL = URL.createObjectURL(blob)

      return {
        pageNumber,
        thumbnail: blobURL,
        originalThumbnail: blobURL,
        width: viewport.width,
        height: viewport.height,
        isFittedToPage: fitToPage,
        pageSize: currentPageSize,
        quality: quality,
        _blobURL: blobURL
      }
    } catch (error) {
      console.error(`❌ Error rendering page ${pageNumber}:`, error)
      return null
    }
  }

  const evictCacheIfNeeded = (newQuality) => {
    setQualityCache(prevCache => {
      const newCache = new Map(prevCache)
      
      // Count pages by quality
      const counts = {
        [QUALITY_TIERS.ULTRA_LOW]: 0,
        [QUALITY_TIERS.APPROPRIATE]: 0,
        [QUALITY_TIERS.BEST]: 0
      }
      
      const pagesByQuality = {
        [QUALITY_TIERS.ULTRA_LOW]: [],
        [QUALITY_TIERS.APPROPRIATE]: [],
        [QUALITY_TIERS.BEST]: []
      }
      
      newCache.forEach((entry, pageNum) => {
        counts[entry.quality]++
        pagesByQuality[entry.quality].push({ pageNum, entry })
      })
      
      // Evict oldest pages if over limit for each tier
      Object.keys(counts).forEach(qualityTier => {
        const limit = CACHE_LIMITS[qualityTier]
        if (counts[qualityTier] >= limit) {
          // Remove oldest entry (LRU - first entry is oldest)
          const toEvict = pagesByQuality[qualityTier][0]
          if (toEvict && toEvict.entry.page._blobURL) {
            URL.revokeObjectURL(toEvict.entry.page._blobURL)
          }
          newCache.delete(toEvict.pageNum)
          console.log(`🗑️ Evicted ${qualityTier} quality page ${toEvict.pageNum} from cache`)
        }
      })
      
      return newCache
    })
  }

  const upgradePageQuality = async (pageNumber, targetQuality) => {
    if (!pdf) return
    
    // Check if we already have this quality or better
    const cached = qualityCache.get(pageNumber)
    const qualityOrder = [QUALITY_TIERS.ULTRA_LOW, QUALITY_TIERS.APPROPRIATE, QUALITY_TIERS.BEST]
    
    if (cached) {
      const cachedIndex = qualityOrder.indexOf(cached.quality)
      const targetIndex = qualityOrder.indexOf(targetQuality)
      if (cachedIndex >= targetIndex) {
        console.log(`✓ Page ${pageNumber} already at ${cached.quality} quality`)
        return cached.page
      }
    }
    
    // Check if already upgrading
    if (upgradingPages.has(pageNumber)) {
      console.log(`⏳ Page ${pageNumber} already upgrading`)
      return null
    }
    
    try {
      setUpgradingPages(prev => new Set(prev).add(pageNumber))
      console.log(`⬆️ Upgrading page ${pageNumber} to ${targetQuality} quality`)
      
      // Render at target quality
      const upgradedPage = await renderPageThumbnail(pdf, pageNumber, fitToPageEnabled, targetQuality)
      
      if (upgradedPage) {
        // Evict if needed before adding
        evictCacheIfNeeded(targetQuality)
        
        // Store in cache
        setQualityCache(prev => {
          const newCache = new Map(prev)
          
          // Revoke old blob URL if exists
          const oldEntry = newCache.get(pageNumber)
          if (oldEntry && oldEntry.page._blobURL) {
            URL.revokeObjectURL(oldEntry.page._blobURL)
          }
          
          newCache.set(pageNumber, { quality: targetQuality, page: upgradedPage })
          return newCache
        })
        
        // Update the page in originalPages
        setOriginalPages(prev => {
          const newPages = prev.map(p => 
            p.pageNumber === pageNumber ? upgradedPage : p
          )
          
          // If page doesn't exist, add it
          if (!prev.find(p => p.pageNumber === pageNumber)) {
            newPages.push(upgradedPage)
            newPages.sort((a, b) => a.pageNumber - b.pageNumber)
          }
          
          return newPages
        })
        
        // Update pages state for UI
        setPages(prev => {
          const newPages = prev.map(p => 
            p.pageNumber === pageNumber ? upgradedPage : p
          )
          
          // If page doesn't exist, add it
          if (!prev.find(p => p.pageNumber === pageNumber)) {
            newPages.push(upgradedPage)
            newPages.sort((a, b) => a.pageNumber - b.pageNumber)
          }
          
          return newPages
        })
        
        console.log(`✅ Upgraded page ${pageNumber} to ${targetQuality} quality`)
        return upgradedPage
      }
    } catch (error) {
      console.error(`❌ Error upgrading page ${pageNumber}:`, error)
    } finally {
      setUpgradingPages(prev => {
        const newSet = new Set(prev)
        newSet.delete(pageNumber)
        return newSet
      })
    }
    
    return null
  }

  const applyColorFilter = (sourceCanvas, colorMode) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = sourceCanvas.width
    canvas.height = sourceCanvas.height

    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (colorMode === 'BW') {
      ctx.filter = 'grayscale(100%)'
    }
    ctx.drawImage(sourceCanvas, 0, 0)
    ctx.filter = 'none'

    return canvas
  }

  const combineConsecutivePages = (page1Canvas, page2Canvas) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    // Create WIDE canvas - EXACT same as PDFEditor
    const gap = 8
    canvas.width = page1Canvas.width * 2 + gap
    canvas.height = page1Canvas.height

    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const halfWidth = canvas.width / 2
    const margin = 2

    // Draw thin page boundaries - EXACT same as PDFEditor
    ctx.strokeStyle = '#3B82F6'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(margin, margin, halfWidth - gap / 2 - margin, canvas.height - margin * 2)
    ctx.strokeRect(halfWidth + gap / 2, margin, halfWidth - gap / 2 - margin, canvas.height - margin * 2)
    ctx.setLineDash([])

    // Pages FILL the width - EXACT same as PDFEditor (not fitted/centered)
    const pageWidth = halfWidth - gap / 2 - margin * 3
    const pageHeight = canvas.height - margin * 4

    // Draw first page (left) - FILL width - EXACT same as editor
    ctx.drawImage(page1Canvas, margin * 2, margin * 2, pageWidth, pageHeight)

    // Draw SECOND page (right) - FILL width - EXACT same as editor
    ctx.drawImage(page2Canvas, halfWidth + gap / 2 + margin, margin * 2, pageWidth, pageHeight)

    return canvas
  }

  const applyPrintSettingsToPage = (page) => {
    return new Promise((resolve) => {
      const tempCanvas = document.createElement('canvas')
      const tempCtx = tempCanvas.getContext('2d')

      const img = new Image()
      img.src = page.originalThumbnail

      img.onload = () => {
        tempCanvas.width = page.width
        tempCanvas.height = page.height
        tempCtx.drawImage(img, 0, 0)

        // Only apply color filter (N-up is handled at a higher level)
        let processedCanvas = tempCanvas
        processedCanvas = applyColorFilter(processedCanvas, currentColorMode)

        resolve({
          ...page,
          thumbnail: processedCanvas.toDataURL()
        })
      }

      img.onerror = () => {
        resolve(page) // Return original page if processing fails
      }
    })
  }

  const applyPrintSettingsToPages = async () => {
    if (totalPages === 0) return

    if (currentPagesPerSheet === 2) {
      // FIX: Loop through ALL pages (1 to totalPages), not just loaded originalPages
      // This ensures we maintain all 200 sheets for a 200-page PDF
      const sheets = []

      for (let i = 1; i <= totalPages; i += 2) {
        const pageNumber1 = i
        const pageNumber2 = i + 1 <= totalPages ? i + 1 : null

        // Check if these pages are loaded
        const page1 = originalPages.find(p => p.pageNumber === pageNumber1)
        const page2 = pageNumber2 ? originalPages.find(p => p.pageNumber === pageNumber2) : null

        if (pageNumber2) {
          // Two-page sheet (pages i and i+1)
          if (page1 && page2) {
            const cacheKey = `${pageNumber1}|${pageNumber2}|${currentPageSize}|${currentColorMode}`
            let cachedSheet = nupCacheRef.current.get(cacheKey)
            
            if (!cachedSheet) {
              const canvas1 = await renderPageAtScale(pageNumber1, 2.0)
              const canvas2 = await renderPageAtScale(pageNumber2, 2.0)

              if (canvas1 && canvas2) {
                const combinedCanvas = combineConsecutivePages(canvas1, canvas2)
                const blob = await new Promise(resolve => {
                  combinedCanvas.toBlob(resolve, 'image/jpeg', 0.95)
                })
                const blobURL = URL.createObjectURL(blob)

                cachedSheet = {
                  pageNumber: `${pageNumber1}-${pageNumber2}`,
                  thumbnail: blobURL,
                  originalThumbnail: blobURL,
                  width: combinedCanvas.width,
                  height: combinedCanvas.height,
                  isSheet: true,
                  containsPages: [pageNumber1, pageNumber2],
                  isLoaded: true,
                  _blobURL: blobURL
                }
                
                nupCacheRef.current.set(cacheKey, cachedSheet)
              }
            }
            
            if (cachedSheet) {
              sheets.push(cachedSheet)
            }
          } else {
            // At least one page not loaded - create placeholder sheet
            // This preserves both page numbers even if only one is loaded
            sheets.push({
              pageNumber: `${pageNumber1}-${pageNumber2}`,
              thumbnail: null,
              originalThumbnail: null,
              width: 595,
              height: 842,
              isSheet: true,
              containsPages: [pageNumber1, pageNumber2],
              isLoaded: false
            })
          }
        } else {
          // Last page (odd page count) - single page sheet
          if (page1) {
            const cacheKey = `${pageNumber1}|${currentPageSize}|${currentColorMode}`
            let cachedSheet = nupCacheRef.current.get(cacheKey)
            
            if (!cachedSheet) {
              const canvas1 = await renderPageAtScale(pageNumber1, 2.0)
              if (canvas1) {
                const blob = await new Promise(resolve => {
                  canvas1.toBlob(resolve, 'image/jpeg', 0.95)
                })
                const blobURL = URL.createObjectURL(blob)
                
                cachedSheet = {
                  pageNumber: pageNumber1,
                  thumbnail: blobURL,
                  originalThumbnail: blobURL,
                  width: canvas1.width,
                  height: canvas1.height,
                  isSheet: true,
                  containsPages: [pageNumber1],
                  isLoaded: true,
                  _blobURL: blobURL
                }
                
                nupCacheRef.current.set(cacheKey, cachedSheet)
              }
            }
            
            if (cachedSheet) {
              sheets.push(cachedSheet)
            }
          } else {
            // Page not loaded - create placeholder
            sheets.push({
              pageNumber: pageNumber1,
              thumbnail: null,
              originalThumbnail: null,
              width: 595,
              height: 842,
              isSheet: true,
              containsPages: [pageNumber1],
              isLoaded: false
            })
          }
        }
      }

      // CRITICAL: Only update state once with ALL sheets ready
      // This prevents flickering from showing intermediate single-page states
      setPages(sheets)
    } else {
      // Normal 1-page mode - FIX: Create placeholders for ALL pages
      const allPagesList = []
      
      for (let i = 1; i <= totalPages; i++) {
        const loadedPage = originalPages.find(p => p.pageNumber === i)
        
        if (loadedPage) {
          // Page is loaded - process it
          const processed = await applyPrintSettingsToPage(loadedPage)
          allPagesList.push({ ...processed, isLoaded: true })
        } else {
          // Page not loaded - create placeholder
          allPagesList.push({
            pageNumber: i,
            thumbnail: null,
            originalThumbnail: null,
            width: 595,
            height: 842,
            isLoaded: false
          })
        }
      }
      
      setPages(allPagesList)
    }
  }

  const loadPageCanvas = (page) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = page.width
        canvas.height = page.height
        ctx.drawImage(img, 0, 0)
        resolve(canvas)
      }
      img.onerror = () => resolve(null)
      img.src = page.originalThumbnail
    })
  }

  const reloadPagesWithNewSize = async () => {
    if (!pdf || loadedPages === 0) return

    try {
      setLoading(true)
      console.log(`\ud83d\udd04 Reloading ${loadedPages} pages with new page size:`, currentPageSize)

      // Re-render all loaded pages with new page size
      const pagePromises = []
      for (let i = 1; i <= loadedPages; i++) {
        pagePromises.push(renderPageThumbnail(pdf, i, fitToPageEnabled))
      }

      const renderedPages = await Promise.all(pagePromises)
      const validPages = renderedPages.filter(p => p !== null)

      setPages(validPages)
      console.log(`\u2705 Successfully reloaded ${validPages.length} pages with new page size`)

    } catch (error) {
      console.error('❌ Error reloading pages with new size:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleFitToPage = async () => {
    if (!pdf) return

    try {
      setLoading(true)
      const newFitToPageState = !fitToPageEnabled
      setFitToPageEnabled(newFitToPageState)

      // Re-render all loaded pages with new fit-to-page setting
      const pagePromises = []
      for (let i = 1; i <= loadedPages; i++) {
        pagePromises.push(renderPageThumbnail(pdf, i, newFitToPageState))
      }

      const renderedPages = await Promise.all(pagePromises)
      const validPages = renderedPages.filter(p => p !== null)

      setPages(validPages)

    } catch (error) {
      console.error('❌ Error toggling fit to page:', error)
    } finally {
      setLoading(false)
    }
  }

  const isPageSelected = (page) => {
    if (page.isSheet && page.containsPages) {
      // For sheets, check if ALL contained pages are selected
      return page.containsPages.every(num => selectedPages.includes(num))
    }
    // For single pages
    return selectedPages.includes(page.pageNumber)
  }

  const togglePageSelection = (pageNumber) => {
    // Find the page/sheet to get its containsPages
    const pageOrSheet = pages.find(p => p.pageNumber === pageNumber)

    if (pageOrSheet?.isSheet && pageOrSheet.containsPages) {
      // For sheets, toggle all contained pages together
      const containedNumbers = pageOrSheet.containsPages
      const allSelected = containedNumbers.every(num => selectedPages.includes(num))

      let newSelection
      if (allSelected) {
        // Deselect all pages in this sheet
        newSelection = selectedPages.filter(n => !containedNumbers.includes(n))
      } else {
        // Select all pages in this sheet
        const toAdd = containedNumbers.filter(n => !selectedPages.includes(n))
        newSelection = [...selectedPages, ...toAdd].sort((a, b) => a - b)
      }

      onPagesSelected(newSelection)
    } else {
      // Normal single page toggle
      const newSelection = selectedPages.includes(pageNumber)
        ? selectedPages.filter(p => p !== pageNumber)
        : [...selectedPages, pageNumber].sort((a, b) => a - b)

      onPagesSelected(newSelection)
    }
  }

  const selectAllPages = () => {
    const allPages = Array.from({ length: totalPages }, (_, i) => i + 1)
    onPagesSelected(allPages)
  }

  const deselectAllPages = () => {
    onPagesSelected([])
  }

  const showPreview = async (page) => {
    if (!page || !pdf) return
    
    // For sheets with N-up, handle separately (not using quality tiers)
    if (page.isSheet && page.containsPages && currentPagesPerSheet === 2) {
      // Show current thumbnail immediately
      setPreviewPage(page)
      
      const pageNumber1 = page.containsPages[0]
      const pageNumber2 = page.containsPages[1]

      try {
        if (pageNumber2 && pageNumber1 >= 1 && pageNumber1 <= totalPages && pageNumber2 >= 1 && pageNumber2 <= totalPages) {
          // Two pages in sheet - render at ULTRA high quality (5.0x) for crystal clear preview
          const page1 = await pdf.getPage(pageNumber1)
          const page2 = await pdf.getPage(pageNumber2)

          // Render at 5.0 scale for ultra-sharp preview
          const viewport1 = page1.getViewport({ scale: 5.0 })
          const viewport2 = page2.getViewport({ scale: 5.0 })

          const canvas1 = document.createElement('canvas')
          const context1 = canvas1.getContext('2d', { alpha: false, willReadFrequently: false })
          canvas1.width = viewport1.width
          canvas1.height = viewport1.height
          context1.fillStyle = 'white'
          context1.fillRect(0, 0, canvas1.width, canvas1.height)
          context1.imageSmoothingEnabled = true
          context1.imageSmoothingQuality = 'high'

          const canvas2 = document.createElement('canvas')
          const context2 = canvas2.getContext('2d', { alpha: false, willReadFrequently: false })
          canvas2.width = viewport2.width
          canvas2.height = viewport2.height
          context2.fillStyle = 'white'
          context2.fillRect(0, 0, canvas2.width, canvas2.height)
          context2.imageSmoothingEnabled = true
          context2.imageSmoothingQuality = 'high'

          await page1.render({ canvasContext: context1, viewport: viewport1 }).promise
          await page2.render({ canvasContext: context2, viewport: viewport2 }).promise

          // Apply color filter if needed
          const filtered1 = applyColorFilter(canvas1, currentColorMode)
          const filtered2 = applyColorFilter(canvas2, currentColorMode)

          // Combine them for preview
          const previewCanvas = combineConsecutivePagesForPreview(filtered1, filtered2)

          // Update with ultra-high quality version
          setPreviewPage({
            ...page,
            thumbnail: previewCanvas.toDataURL('image/jpeg', 0.7),
            isHighQuality: true
          })
          return
        } else if (pageNumber1 >= 1 && pageNumber1 <= totalPages) {
          // Only one page in sheet (odd page) - render at ultra high quality
          const page1 = await pdf.getPage(pageNumber1)

          const viewport1 = page1.getViewport({ scale: 5.0 })

          const canvas1 = document.createElement('canvas')
          const context1 = canvas1.getContext('2d', { alpha: false, willReadFrequently: false })
          canvas1.width = viewport1.width
          canvas1.height = viewport1.height
          context1.fillStyle = 'white'
          context1.fillRect(0, 0, canvas1.width, canvas1.height)
          context1.imageSmoothingEnabled = true
          context1.imageSmoothingQuality = 'high'

          await page1.render({ canvasContext: context1, viewport: viewport1 }).promise

          const filtered1 = applyColorFilter(canvas1, currentColorMode)

          setPreviewPage({
            ...page,
            thumbnail: filtered1.toDataURL('image/jpeg', 0.7),
            isHighQuality: true
          })
          return
        }
      } catch (error) {
        console.error('Error creating preview:', error)
      }
      return
    }

    // For regular single pages, use progressive quality loading
    if (!page.isSheet) {
      const pageNumber = page.pageNumber
      
      // Step 1: Check if we have APPROPRIATE quality in cache, otherwise show current
      const cached = qualityCache.get(pageNumber)
      if (cached && cached.quality === QUALITY_TIERS.APPROPRIATE) {
        // Show APPROPRIATE quality immediately
        setPreviewPage({
          ...cached.page,
          isHighQuality: false
        })
      } else {
        // Show current thumbnail immediately (likely ULTRA_LOW)
        setPreviewPage({
          ...page,
          isHighQuality: false
        })
        
        // Render APPROPRIATE quality if not in cache
        try {
          const appropriatePage = await upgradePageQuality(pageNumber, QUALITY_TIERS.APPROPRIATE)
          if (appropriatePage) {
            setPreviewPage({
              ...appropriatePage,
              isHighQuality: false
            })
          }
        } catch (error) {
          console.error('Error loading APPROPRIATE quality for preview:', error)
        }
      }
      
      // Step 2: Asynchronously upgrade to BEST quality in background
      setTimeout(async () => {
        try {
          console.log(`⬆️ Upgrading preview to BEST quality for page ${pageNumber}`)
          const bestPage = await upgradePageQuality(pageNumber, QUALITY_TIERS.BEST)
          if (bestPage) {
            // Only update if preview is still showing this page
            setPreviewPage(current => {
              if (current && current.pageNumber === pageNumber) {
                return {
                  ...bestPage,
                  isHighQuality: true
                }
              }
              return current
            })
          }
        } catch (error) {
          console.error('Error upgrading to BEST quality:', error)
        }
      }, 100)
    }
  }

  // Setup intersection observer for auto-loading more pages on scroll
  React.useEffect(() => {
    if (!pdf || loadedPages >= totalPages) return

    const scrollObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && loadedPages < totalPages && !loadingMore) {
            console.log('📜 Scroll trigger reached - loading more pages')
            loadMorePages()
          }
        })
      },
      {
        root: null,
        rootMargin: '400px', // Load when within 400px of trigger
        threshold: 0.01
      }
    )

    scrollObserverRef.current = scrollObserver

    if (loadMoreTriggerRef.current) {
      scrollObserver.observe(loadMoreTriggerRef.current)
    }

    return () => {
      scrollObserver.disconnect()
    }
  }, [pdf, loadedPages, totalPages, loadingMore])

  // Setup intersection observer for viewport-based quality upgrades
  React.useEffect(() => {
    if (!pdf || pages.length === 0) return

    // Create intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pageNumber = parseInt(entry.target.dataset.pageNumber)
            if (pageNumber && !isNaN(pageNumber)) {
              // Delay upgrade slightly to avoid overwhelming during fast scrolling
              setTimeout(() => {
                if (entry.isIntersecting) {
                  // Upgrade visible thumbnails from ULTRA_LOW to APPROPRIATE quality
                  upgradePageQuality(pageNumber, QUALITY_TIERS.APPROPRIATE)
                }
              }, 100)
            }
          }
        })
      },
      {
        root: null,
        rootMargin: '100px', // Start upgrading 100px before element enters viewport
        threshold: 0.1
      }
    )

    observerRef.current = observer

    // Observe all page elements
    const pageElements = document.querySelectorAll('[data-page-number]')
    pageElements.forEach(el => observer.observe(el))

    return () => {
      observer.disconnect()
    }
  }, [pdf, pages.length, fitToPageEnabled])

  const renderPageAtScale = async (pageNumber, scale) => {
    try {
      if (!pdf) {
        console.error('PDF document not loaded')
        return null
      }

      const page = await pdf.getPage(pageNumber)

      const targetPageSize = getPageSize(currentPageSize)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })

      canvas.width = targetPageSize.width * scale
      canvas.height = targetPageSize.height * scale

      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Enable high-quality image smoothing
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const viewport = page.getViewport({ scale: 1.0 })
      const pdfScale = Math.min(canvas.width / viewport.width, canvas.height / viewport.height)
      const scaledViewport = page.getViewport({ scale: pdfScale })
      const offsetX = (canvas.width - scaledViewport.width) / 2
      const offsetY = (canvas.height - scaledViewport.height) / 2

      ctx.save()
      ctx.translate(offsetX, offsetY)
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise
      ctx.restore()

      if (currentColorMode === 'BW') {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
          data[i] = gray
          data[i + 1] = gray
          data[i + 2] = gray
        }
        ctx.putImageData(imageData, 0, 0)
      }

      return canvas
    } catch (error) {
      console.error(`Error rendering page ${pageNumber}:`, error)
      return null
    }
  }

  const combineConsecutivePagesForPreview = (page1Canvas, page2Canvas) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    const gap = Math.floor(page1Canvas.width * 0.015)
    canvas.width = page1Canvas.width * 2 + gap
    canvas.height = page1Canvas.height

    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const halfWidth = canvas.width / 2
    const margin = Math.floor(page1Canvas.width * 0.004)

    ctx.strokeStyle = '#3B82F6'
    ctx.lineWidth = Math.max(2, Math.floor(page1Canvas.width * 0.0025))
    const dashSize = Math.max(6, Math.floor(page1Canvas.width * 0.007))
    ctx.setLineDash([dashSize, dashSize])
    ctx.strokeRect(margin, margin, halfWidth - gap / 2 - margin, canvas.height - margin * 2)
    ctx.strokeRect(halfWidth + gap / 2, margin, halfWidth - gap / 2 - margin, canvas.height - margin * 2)
    ctx.setLineDash([])

    const pageWidth = halfWidth - gap / 2 - margin * 3
    const pageHeight = canvas.height - margin * 4

    ctx.drawImage(page1Canvas, margin * 2, margin * 2, pageWidth, pageHeight)
    ctx.drawImage(page2Canvas, halfWidth + gap / 2 + margin, margin * 2, pageWidth, pageHeight)

    return canvas
  }

  const closePreview = () => {
    setPreviewPage(null)
    setPreviewScale(1) // Reset zoom when closing
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const pageNumber = parseInt(searchTerm)
    if (pageNumber && pageNumber >= 1 && pageNumber <= totalPages) {
      jumpToPage(pageNumber)
    }
  }

  const filteredPages = pages.filter(page => {
    if (!searchTerm) return true
    return page.pageNumber.toString().includes(searchTerm)
  })

  if (!file || file.type !== 'application/pdf') {
    return null
  }

  if (error) {
    return (
      <div className="border-2 border-red-300 rounded-lg p-6 bg-red-50">
        <div className="text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 text-red-600" />
          <p className="text-red-600 font-medium">Error loading PDF</p>
          <p className="text-red-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-sm sm:text-base font-medium text-gray-900">
          Selected Pages ({selectedPages.length}/{totalPages})
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={selectAllPages}
            className="text-xs sm:text-sm bg-blue-100 text-blue-700 px-2 sm:px-3 py-1 rounded hover:bg-blue-200 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={deselectAllPages}
            className="text-xs sm:text-sm bg-gray-100 text-gray-700 px-2 sm:px-3 py-1 rounded hover:bg-gray-200 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={toggleFitToPage}
            className={`text-xs sm:text-sm px-2 sm:px-3 py-1 rounded transition-colors ${
              fitToPageEnabled
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {fitToPageEnabled ? 'Fit: ON' : 'Fit: OFF'}
          </button>
        </div>
      </div>

      {/* Search and Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Page number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 sm:pl-10 pr-2 sm:pr-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-36"
            />
          </div>
          <button
            type="submit"
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm hover:bg-blue-700 transition-colors"
          >
            Go
          </button>
        </form>

        {fitToPageEnabled && (
          <div className="text-xs sm:text-sm text-green-600">
            ✓ Fit Enabled
          </div>
        )}
      </div>

      {/* Conditional Rendering: Single Page View vs Grid View */}
      {viewMode === 'single' ? (
        /* === SINGLE PAGE VIEW === */
        (() => {
          // Use originalPages (actual thumbnails) instead of pages (which may have placeholders)
          const sourcePages = currentPagesPerSheet === 1 ? originalPages : pages
          
          // Apply filtering
          const singleViewFilteredPages = sourcePages.filter(page => {
            if (!searchTerm) return true
            return page.pageNumber.toString().includes(searchTerm)
          })
          
          const currentPage = singleViewFilteredPages[currentPageIndex]
          // Show editor immediately when PDF metadata is loaded (don't wait for pages)
          const hasPages = totalPages > 0
          
          // Handle page navigation with lazy loading
          const handlePageNav = (newIndex) => {
            const clampedIndex = Math.max(0, Math.min(newIndex, singleViewFilteredPages.length - 1))
            setCurrentPageIndex(clampedIndex)
            setCropActive(false)
            
            // If navigating to unloaded page, trigger load
            if (singleViewFilteredPages[clampedIndex] && !singleViewFilteredPages[clampedIndex].thumbnail && pdf) {
              const targetPageNumber = singleViewFilteredPages[clampedIndex].pageNumber
              if (targetPageNumber > loadedPages) {
                loadMorePages()
              }
            }
          }
          
          return (
            <div className="space-y-3">
              {/* Expand/Collapse Button */}
              <div className="flex justify-end">
                <button
                  onClick={() => setGridExpanded(!gridExpanded)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                >
                  {gridExpanded ? (
                    <>
                      <Minimize2 className="w-4 h-4" />
                      Compact View
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-4 h-4" />
                      Full View
                    </>
                  )}
                </button>
              </div>

              {/* Compact Scrollable Grid or Full View */}
              <div className={`border rounded-lg bg-gray-50 ${
                gridExpanded ? 'p-4' : 'p-3'
              }`}>
                <div className={`${
                  gridExpanded ? '' : 'max-h-[400px] overflow-y-auto'
                }`}>
                  {hasPages || loading ? (
                    <Suspense fallback={
                      <div className="flex justify-center items-center min-h-[200px]">
                        <Loader className="w-8 h-8 animate-spin text-blue-600" />
                      </div>
                    }>
                      <PDFEditor
                        file={file}
                        initialPageIndex={0}
                        onSave={(editedFile) => {
                          // Reload the component after save
                          setReloadVersion(v => v + 1)
                        }}
                        onCancel={() => {
                          // Do nothing on cancel
                        }}
                        directPageEdit={false}
                        pageSize={currentPageSize}
                        onPageSizeChange={(newSize) => setCurrentPageSize(newSize)}
                        colorMode={currentColorMode}
                        pagesPerSheet={currentPagesPerSheet}
                        selectedPages={selectedPages}
                        onPageSelect={togglePageSelection}
                      />
                    </Suspense>
                  ) : (
                    <div className="flex justify-center items-center min-h-[200px]">
                      <p className="text-gray-400">No pages available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()
      ) : (
        /* === GRID VIEW (Original) === */
        <div className="border rounded-lg p-2 sm:p-4 bg-gray-50 h-80 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
            {filteredPages.map((page) => (
            <div
              key={page.pageNumber}
              id={`page-${page.pageNumber}`}
              data-page-number={page.pageNumber}
              className={`relative border-2 rounded-lg p-1 sm:p-2 transition-all cursor-pointer ${
                isPageSelected(page)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {/* Selection Checkbox */}
              <div className="absolute top-1 left-1 z-10">
                <button
                  onClick={() => togglePageSelection(page.pageNumber)}
                  className="bg-white rounded shadow-sm p-1"
                >
                  {isPageSelected(page) ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>

              {/* Preview Button */}
              <div className="absolute top-1 right-1 z-10">
                <button
                  onClick={() => showPreview(page)}
                  className="bg-white rounded shadow-sm p-1 hover:bg-gray-50"
                  title="Preview"
                >
                  <Eye className="w-3 h-3 text-gray-600" />
                </button>
              </div>

              {/* Page Thumbnail */}
              <div
                className="w-full aspect-[3/4] bg-gray-100 rounded flex items-center justify-center overflow-hidden relative"
                onClick={() => togglePageSelection(page.pageNumber)}
              >
                {page.thumbnail ? (
                  <>
                    <img
                      src={page.thumbnail}
                      alt={`Page ${page.pageNumber}`}
                      className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${
                        page.quality === QUALITY_TIERS.BEST ? 'opacity-100' : 'opacity-95'
                      }`}
                      style={{ imageRendering: page.quality === QUALITY_TIERS.BEST ? 'crisp-edges' : 'auto' }}
                    />
                    {/* Loading shimmer overlay for quality upgrade */}
                    {upgradingPages.has(page.pageNumber) && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                    )}
                    {/* Quality indicator badge */}
                    {page.quality === QUALITY_TIERS.BEST && (
                      <div className="absolute bottom-1 right-1 bg-green-500 text-white text-[8px] px-1 py-0.5 rounded font-bold">
                        BEST
                      </div>
                    )}
                    {page.quality === QUALITY_TIERS.APPROPRIATE && (
                      <div className="absolute bottom-1 right-1 bg-blue-500 text-white text-[8px] px-1 py-0.5 rounded font-bold">
                        OK
                      </div>
                    )}
                  </>
                ) : page.isLoaded === false ? (
                  <div className="text-center">
                    <Loader className="w-6 h-6 text-gray-400 mx-auto mb-1 animate-spin" />
                    <p className="text-xs text-gray-500">Not loaded</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <FileText className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <p className="text-xs text-red-500">Failed to load</p>
                  </div>
                )}
              </div>

              {/* Page Number and Edit Status */}
              <div className="text-center mt-1 sm:mt-2">
                <span className="text-xs font-medium text-gray-700">
                  {page.pageNumber}
                </span>
                {page.isFittedToPage && (
                  <div className="text-xs text-green-600 mt-0.5">
                    ✓
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Auto-load trigger (invisible) + Optional Load More Button */}
        {loadedPages < totalPages && (
          <div className="text-center mt-6">
            {/* Invisible trigger for scroll-based auto-loading */}
            <div ref={loadMoreTriggerRef} className="h-px w-full" />
            
            {/* Loading indicator */}
            {loadingMore && (
              <div className="flex items-center justify-center gap-2 text-gray-600 py-4">
                <Loader className="w-5 h-5 animate-spin" />
                <span>Loading more pages...</span>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Enhanced Preview Modal */}
      {previewPage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Page {previewPage.pageNumber}</h3>
                  <p className="text-xs text-blue-100">PDF Preview</p>
                </div>
              </div>
              <button
                onClick={closePreview}
                className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="bg-blue-50 border-b border-blue-100 px-5 py-2 flex items-center justify-center">
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 shadow-sm border border-blue-200">
                <span className="text-xs font-medium text-gray-600">Zoom:</span>
                <button
                  onClick={() => setPreviewScale(Math.max(0.5, previewScale - 0.25))}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Zoom Out"
                >
                  <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                  </svg>
                </button>
                <span className="text-sm font-bold text-blue-600 min-w-[3rem] text-center">{Math.round(previewScale * 100)}%</span>
                <button
                  onClick={() => setPreviewScale(Math.min(3, previewScale + 0.25))}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Zoom In"
                >
                  <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </button>
                <button
                  onClick={() => setPreviewScale(1)}
                  className="ml-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors font-medium text-gray-700"
                  title="Reset Zoom"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Preview Image */}
            <div className="flex-1 p-6 bg-gray-50 overflow-auto relative" style={{ WebkitOverflowScrolling: 'touch' }}>
              {previewPage.thumbnail ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div 
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'center',
                      transition: 'transform 0.2s ease-out',
                      display: 'inline-block'
                    }}
                  >
                    <img
                      src={previewPage.thumbnail}
                      alt={`Page ${previewPage.pageNumber} Preview`}
                      className="h-auto rounded-lg shadow-lg"
                      style={{
                        maxHeight: '60vh',
                        imageRendering: previewPage.isHighQuality ? '-webkit-optimize-contrast' : 'auto',
                        display: 'block'
                      }}
                    />
                  </div>
                  {/* Ultra HD Quality Badge */}
                  {previewPage.isHighQuality && (
                    <div className="absolute top-8 right-8 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in z-10">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span className="text-xs font-bold">ULTRA HD</span>
                    </div>
                  )}
                  {/* Loading indicator during quality upgrade */}
                  {!previewPage.isHighQuality && (
                    <div className="absolute top-8 right-8 bg-blue-500 text-white px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 z-10">
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="text-xs font-medium">Enhancing...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Preview not available</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="bg-white border-t border-gray-200 p-4 flex items-center justify-between gap-3">
              <button
                onClick={() => togglePageSelection(previewPage.pageNumber)}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                  isPageSelected(previewPage)
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {isPageSelected(previewPage) ? (
                  <span className="flex items-center justify-center gap-2">
                    <CheckSquare className="w-4 h-4" />
                    Selected for Printing
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Square className="w-4 h-4" />
                    Select for Printing
                  </span>
                )}
              </button>
              {onEditPage && (
                <button
                  onClick={() => {
                    onEditPage(previewPage.pageNumber - 1)
                    closePreview()
                  }}
                  className="flex-1 py-3 px-4 rounded-lg font-medium bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit This Page
                </button>
              )}
              <button
                onClick={closePreview}
                className="py-3 px-6 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selection Summary */}
      {selectedPages.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
          <p className="text-blue-800 text-xs sm:text-sm mb-2">
            <strong>Selected:</strong> {selectedPages.length} page{selectedPages.length !== 1 ? 's' : ''}
          </p>
          <div className={`${showAllSelected ? 'h-auto' : 'h-10 sm:h-12'} overflow-y-auto bg-white rounded border border-blue-200 p-1.5 sm:p-2 transition-all duration-300`}>
            <p className="text-blue-600 text-xs leading-relaxed break-all">
              {selectedPages.join(', ')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0 mt-2">
            <button
              onClick={() => setShowAllSelected(!showAllSelected)}
              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
            >
              {showAllSelected ? 'Less' : 'More'}
            </button>
          </div>
          {selectedPages.length !== totalPages && (
            <p className="text-blue-600 text-xs mt-2">
              Only selected pages will print
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default PDFPageSelector
