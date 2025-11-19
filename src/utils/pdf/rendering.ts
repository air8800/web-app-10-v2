/**
 * PDF Rendering Utilities
 * 
 * Functions for rendering PDF pages to canvas elements,
 * applying transformations, and managing page display.
 */

import type * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'
import { Dimensions, CropArea } from './geometry'
import { calculateScaleToFit } from './geometry'
import { getPageDimensions, type PageOrientation } from './pageOrientation'

export interface EditHistory {
  rotation?: number
  scale?: number
  offsetX?: number
  offsetY?: number
  cropArea?: CropArea | null
}

export interface PDFPage {
  pageNumber: number
  canvas: HTMLCanvasElement
  originalCanvas: HTMLCanvasElement
  pristineOriginal?: HTMLCanvasElement
  width: number
  height: number
  orientation?: PageOrientation
  thumbnail: string
  edited: boolean
  editHistory: EditHistory
}

export interface StoredSettings {
  settings: EditHistory
  userScale: number
  currentPageSize: string
  cropInfo?: CropArea | null
}

export interface RenderOptions {
  /** Render scale (0.75 = low-res quick, 1.0 = full quality, default: 1.0) */
  scale?: number
  /** Skip thumbnail generation for faster initial render (default: false) */
  skipThumbnail?: boolean
  /** Skip pristine canvas cloning for faster initial render (default: false) */
  skipClone?: boolean
  /** Thumbnail scale (0.5 = half size, default: 1.0) */
  thumbnailScale?: number
  /** Thumbnail JPEG quality (0.4 = 40%, default: 0.6) */
  thumbnailQuality?: number
}

/**
 * Render a PDF page to a canvas with configurable quality/speed trade-offs
 * 
 * @param pdf - pdfjs-dist PDF document
 * @param pageNumber - Page number to render (1-indexed)
 * @param perfTracker - Optional performance tracker (from trackPageLoad().step())
 * @param options - Render options for quality vs speed trade-offs
 * @returns Rendered page object with canvas and metadata
 */
export const renderPage = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  perfTracker?: { step: (name: string) => any },
  options: RenderOptions = {}
): Promise<PDFPage | null> => {
  // Default options: preserve original behavior (full quality)
  const {
    scale = 1.0,
    skipThumbnail = false,
    skipClone = false,
    thumbnailScale = 1.0,
    thumbnailQuality = 0.6
  } = options
  try {
    // Step 1: Get page from PDF.js
    const getPageStart = performance.now()
    const page = await pdf.getPage(pageNumber)
    perfTracker?.step(`getPage(${(performance.now() - getPageStart).toFixed(0)}ms)`)
    
    // Step 2: Get viewport dimensions at requested scale
    const viewportStart = performance.now()
    const viewport = page.getViewport({ scale })
    perfTracker?.step(`getViewport(${(performance.now() - viewportStart).toFixed(0)}ms)`)

    // Step 3: Create canvas and context
    const canvasStart = performance.now()
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
    
    if (!context) {
      console.error(`Failed to get 2d context for page ${pageNumber}`)
      return null
    }
    
    canvas.height = viewport.height
    canvas.width = viewport.width

    // Fill with white background first
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)

    // Enable image smoothing for crisp text rendering
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    perfTracker?.step(`canvas-setup(${(performance.now() - canvasStart).toFixed(0)}ms)`)

    // Step 4: Render page content (THIS IS THE BOTTLENECK)
    const renderStart = performance.now()
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise
    perfTracker?.step(`page.render(${(performance.now() - renderStart).toFixed(0)}ms)`)
    
    // Step 5: Generate thumbnail (optional, optimized)
    let thumbnail = ''
    if (!skipThumbnail) {
      const thumbStart = performance.now()
      thumbnail = generateThumbnail(canvas, thumbnailScale, thumbnailQuality)
      perfTracker?.step(`thumbnail(${(performance.now() - thumbStart).toFixed(0)}ms)`)
    } else {
      perfTracker?.step(`thumbnail(skipped)`)
    }
    
    // Step 6: Clone pristine original (optional)
    const cloneStart = performance.now()
    let pristineOriginal: HTMLCanvasElement
    
    if (!skipClone) {
      pristineOriginal = document.createElement('canvas')
      pristineOriginal.width = canvas.width
      pristineOriginal.height = canvas.height
      const pristineCtx = pristineOriginal.getContext('2d', { alpha: false })
      
      if (pristineCtx) {
        pristineCtx.drawImage(canvas, 0, 0)
      }
      perfTracker?.step(`clone(${(performance.now() - cloneStart).toFixed(0)}ms)`)
    } else {
      // Use the same canvas as placeholder
      pristineOriginal = canvas
      perfTracker?.step(`clone(skipped)`)
    }
    
    // Detect page orientation from viewport dimensions
    const pageDimensions = getPageDimensions(viewport.width, viewport.height)
    
    return {
      pageNumber,
      canvas,
      originalCanvas: pristineOriginal,
      pristineOriginal: pristineOriginal,
      width: viewport.width,
      height: viewport.height,
      orientation: pageDimensions.orientation,
      thumbnail,
      edited: false,
      editHistory: {
        rotation: 0,
        scale: 100,
        offsetX: 0,
        offsetY: 0,
        cropArea: null
      }
    }
  } catch (error) {
    console.error(`❌ Error rendering page ${pageNumber}:`, error)
    return null
  }
}

/**
 * Generate thumbnail from a canvas
 * Creates a smaller, optimized thumbnail for efficient display
 * 
 * @param canvas - Source canvas to create thumbnail from
 * @param scale - Scale factor for thumbnail (default: 0.5)
 * @param quality - JPEG quality 0-1 (default: 0.6)
 * @returns Data URL string for the thumbnail
 */
export const generateThumbnail = (
  canvas: HTMLCanvasElement,
  scale: number = 0.5,
  quality: number = 0.6
): string => {
  // Create smaller thumbnail canvas for better performance
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = canvas.width * scale
  thumbCanvas.height = canvas.height * scale
  const thumbCtx = thumbCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
  
  if (!thumbCtx) {
    // Fallback: use full-size canvas if thumbnail creation fails
    return canvas.toDataURL('image/jpeg', quality)
  }
  
  thumbCtx.fillStyle = 'white'
  thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height)
  thumbCtx.imageSmoothingEnabled = true
  thumbCtx.imageSmoothingQuality = 'high'
  thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
  
  return thumbCanvas.toDataURL('image/jpeg', quality)
}

/**
 * Apply stored transformation settings to a page
 * Used for applying "Apply All" settings to lazy-loaded pages
 * 
 * @param originalPage - Source page object
 * @param storedSettings - Settings to apply (rotation, scale, crop, etc.)
 * @param getPageSize - Function to get page dimensions by size name
 * @returns Page with transformations applied
 */
export const applyStoredSettingsToPage = async (
  originalPage: PDFPage,
  storedSettings: StoredSettings,
  getPageSize: (size: string) => Dimensions
): Promise<PDFPage> => {
  try {
    const { settings, userScale: storedUserScale, currentPageSize: storedPageSize, cropInfo } = storedSettings
    const targetPageSize = getPageSize(storedPageSize)
    
    const pageCanvas = document.createElement('canvas')
    const pageCtx = pageCanvas.getContext('2d', { alpha: false, willReadFrequently: false })
    
    if (!pageCtx) {
      console.error(`Failed to get 2d context for page ${originalPage.pageNumber}`)
      return originalPage
    }
    
    pageCtx.imageSmoothingEnabled = true
    pageCtx.imageSmoothingQuality = 'medium' // Use 'medium' instead of 'high' for faster processing
    
    pageCanvas.width = targetPageSize.width
    pageCanvas.height = targetPageSize.height
    
    pageCtx.fillStyle = 'white'
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    
    pageCtx.save()
    pageCtx.translate(pageCanvas.width / 2, pageCanvas.height / 2)
    pageCtx.translate(settings.offsetX || 0, settings.offsetY || 0)

    if (settings.rotation && settings.rotation !== 0) {
      pageCtx.rotate((settings.rotation * Math.PI) / 180)
    }

    // Calculate scale to fit
    const rotation = settings.rotation || 0
    const scaleToFit = calculateScaleToFit(
      originalPage.width,
      originalPage.height,
      pageCanvas.width,
      pageCanvas.height,
      rotation
    )

    const contentScale = storedUserScale / 100
    const finalScale = scaleToFit * contentScale
    const drawWidth = originalPage.width * finalScale
    const drawHeight = originalPage.height * finalScale

    // ALWAYS draw from pristine original (prevents rotation compounding)
    const sourceCanvas = originalPage.pristineOriginal || originalPage.originalCanvas || originalPage.canvas
    if (sourceCanvas) {
      pageCtx.drawImage(sourceCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
    }
    pageCtx.restore()

    // Apply crop if stored
    let finalCanvas = pageCanvas
    let normalizedCropArea: CropArea | null = null
    
    if (cropInfo) {
      console.log(`✂️ Applying stored crop to lazy-loaded page ${originalPage.pageNumber}`)
      
      const cropX = Math.round(cropInfo.x * pageCanvas.width)
      const cropY = Math.round(cropInfo.y * pageCanvas.height)
      const cropWidth = Math.round(cropInfo.width * pageCanvas.width)
      const cropHeight = Math.round(cropInfo.height * pageCanvas.height)
      
      // Extract cropped region
      const croppedCanvas = document.createElement('canvas')
      croppedCanvas.width = cropWidth
      croppedCanvas.height = cropHeight
      const croppedCtx = croppedCanvas.getContext('2d')
      
      if (croppedCtx) {
        croppedCtx.drawImage(pageCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
      }
      
      // Create final canvas at ORIGINAL page dimensions (keep page size unchanged)
      finalCanvas = document.createElement('canvas')
      finalCanvas.width = targetPageSize.width
      finalCanvas.height = targetPageSize.height
      const finalCtx = finalCanvas.getContext('2d')
      
      if (finalCtx) {
        // Fill with white background
        finalCtx.fillStyle = 'white'
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
        
        // Draw cropped content at its exact position
        finalCtx.drawImage(croppedCanvas, cropX, cropY)
      }
      
      normalizedCropArea = cropInfo
    }

    return {
      ...originalPage,
      canvas: finalCanvas,
      edited: true,
      thumbnail: generateThumbnail(finalCanvas, 0.5, 0.6), // Use helper for consistent thumbnails
      editHistory: {
        ...settings,
        cropArea: normalizedCropArea
      }
    }
  } catch (error) {
    console.error(`❌ Error applying stored settings to page ${originalPage.pageNumber}:`, error)
    return originalPage
  }
}
