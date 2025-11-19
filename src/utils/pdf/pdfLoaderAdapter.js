/**
 * PDF Loader Adapter
 * Integrates memory management and sequential loading with existing PDF rendering
 * This adapter wraps the existing rendering logic without changing functionality
 */

import { createMemoryManager } from './memoryManager.js'
import SequentialPageLoader from './sequentialLoader.js'

export class PDFLoaderAdapter {
  constructor(options = {}) {
    this.options = {
      enableMemoryManagement: options.enableMemoryManagement !== false,
      enableSequentialLoading: options.enableSequentialLoading !== false,
      memoryOptions: options.memoryOptions || {},
      loaderOptions: options.loaderOptions || {},
      enableLogging: options.enableLogging !== false
    }

    // Initialize memory manager
    this.memoryManager = this.options.enableMemoryManagement
      ? createMemoryManager({
          ...this.options.memoryOptions,
          enableLogging: this.options.enableLogging
        })
      : null

    // Initialize sequential loader
    this.sequentialLoader = this.options.enableSequentialLoading
      ? new SequentialPageLoader({
          ...this.options.loaderOptions,
          enableLogging: this.options.enableLogging
        })
      : null

    this.log = this.options.enableLogging
      ? (...args) => console.log('📦 [PDFAdapter]', ...args)
      : () => {}
  }

  /**
   * Wrap blob URL creation with memory tracking
   */
  async createBlobFromCanvas(canvas, pageNumber, quality = 'ULTRA_LOW', type = 'page') {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null)
          return
        }

        const blobUrl = URL.createObjectURL(blob)

        // Register with memory manager if enabled
        if (this.memoryManager) {
          const pageKey = type === 'nup' 
            ? this.memoryManager.makeNupKey([pageNumber])
            : this.memoryManager.makePageKey(pageNumber, quality)

          this.memoryManager.registerBlob(pageKey, blobUrl, {
            type,
            quality,
            size: blob.size
          })
        }

        resolve(blobUrl)
      }, 'image/jpeg', this.getJpegQuality(quality))
    })
  }

  /**
   * Create blob from canvas for N-up sheets
   */
  async createNupBlob(canvas, pageNumbers, quality = 0.95) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null)
          return
        }

        const blobUrl = URL.createObjectURL(blob)

        // Register with memory manager
        if (this.memoryManager) {
          const nupKey = this.memoryManager.makeNupKey(pageNumbers)
          this.memoryManager.registerBlob(nupKey, blobUrl, {
            type: 'nup',
            quality: 'NUP',
            size: blob.size
          })
        }

        resolve(blobUrl)
      }, 'image/jpeg', quality)
    })
  }

  /**
   * Load pages sequentially with proper state management
   */
  loadPagesSequentially(pageNumbers, renderFunction, callbacks = {}) {
    const {
      onPageLoaded = () => {},
      onBatchComplete = () => {},
      onProgress = () => {}
    } = callbacks

    if (!this.sequentialLoader) {
      this.log('⚠️ Sequential loader disabled, falling back to batch loading')
      return Promise.all(pageNumbers.map(renderFunction))
    }

    return new Promise((resolve) => {
      const loadedPages = []

      this.sequentialLoader.queuePages(
        pageNumbers,
        renderFunction,
        (result, pageNum) => {
          loadedPages.push(result)
          onPageLoaded(result, pageNum)
          onProgress({
            loaded: loadedPages.length,
            total: pageNumbers.length,
            percentage: Math.round((loadedPages.length / pageNumbers.length) * 100)
          })
        },
        (results) => {
          onBatchComplete(results)
          resolve(loadedPages)
        }
      )
    })
  }

  /**
   * Upgrade page quality with memory management
   */
  upgradePageQuality(pageNumber, oldQuality, newQuality, newBlobUrl, metadata = {}) {
    if (this.memoryManager) {
      this.memoryManager.upgradeQuality(pageNumber, oldQuality, newQuality, newBlobUrl, metadata)
    }
  }

  /**
   * Touch a blob to mark as recently used
   */
  touchPage(pageNumber, quality = 'ULTRA_LOW') {
    if (this.memoryManager) {
      const pageKey = this.memoryManager.makePageKey(pageNumber, quality)
      this.memoryManager.touchBlob(pageKey)
    }
  }

  /**
   * Check if page is loaded (sequential loader)
   */
  isPageLoaded(pageNumber) {
    return this.sequentialLoader ? this.sequentialLoader.isPageLoaded(pageNumber) : false
  }

  /**
   * Check if page is loading
   */
  isPageLoading(pageNumber) {
    return this.sequentialLoader ? this.sequentialLoader.isPageLoading(pageNumber) : false
  }

  /**
   * Get page loading state
   */
  getPageState(pageNumber) {
    return this.sequentialLoader ? this.sequentialLoader.getPageState(pageNumber) : 'unknown'
  }

  /**
   * Revoke specific quality tier
   */
  revokeQualityTier(quality) {
    if (this.memoryManager) {
      return this.memoryManager.revokeQualityTier(quality)
    }
    return 0
  }

  /**
   * Revoke all N-up sheets
   */
  revokeAllNup() {
    if (this.memoryManager) {
      return this.memoryManager.revokeAllNup()
    }
    return 0
  }

  /**
   * Clear everything on component unmount
   */
  cleanup() {
    this.log('🧹 Cleaning up PDF loader adapter')

    if (this.sequentialLoader) {
      this.sequentialLoader.clear()
    }

    if (this.memoryManager) {
      this.memoryManager.clear()
    }
  }

  /**
   * Get combined statistics
   */
  getStats() {
    const stats = {
      enabled: {
        memoryManagement: this.options.enableMemoryManagement,
        sequentialLoading: this.options.enableSequentialLoading
      }
    }

    if (this.memoryManager) {
      stats.memory = this.memoryManager.getReport()
    }

    if (this.sequentialLoader) {
      stats.loading = this.sequentialLoader.getStats()
    }

    return stats
  }

  /**
   * Log combined statistics
   */
  logStats() {
    if (this.memoryManager) {
      this.memoryManager.logStats()
    }

    if (this.sequentialLoader) {
      this.sequentialLoader.logStats()
    }
  }

  /**
   * Get JPEG quality for a quality tier
   */
  getJpegQuality(quality) {
    const qualities = {
      ULTRA_LOW: 0.4,
      APPROPRIATE: 0.6,
      BEST: 0.85
    }
    return qualities[quality] || 0.6
  }

  /**
   * Periodic memory report (call this on interval)
   */
  reportMemoryUsage() {
    if (this.memoryManager) {
      this.memoryManager.logMemoryStatus()
    }
  }
}

export default PDFLoaderAdapter
