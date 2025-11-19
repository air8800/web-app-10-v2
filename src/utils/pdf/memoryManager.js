/**
 * PDF Memory Manager
 * Manages blob URLs, canvas memory, and quality tier caching with intelligent eviction
 * Provides detailed logging and tracking for performance optimization
 */

class PDFMemoryManager {
  constructor(options = {}) {
    this.options = {
      maxUltraLowPages: options.maxUltraLowPages || 120,
      maxAppropriatPages: options.maxAppropriatPages || 80,
      maxBestPages: options.maxBestPages || 12,
      maxNupSheets: options.maxNupSheets || 60,
      enableLogging: options.enableLogging !== false,
      logPrefix: options.logPrefix || '🧠 [MemoryMgr]',
    }

    // Central blob URL registry - single source of truth
    this.blobRegistry = new Map() // pageKey -> { url, type, quality, timestamp, size }
    
    // LRU tracking for each quality tier
    this.qualityLRU = {
      ULTRA_LOW: [],
      APPROPRIATE: [],
      BEST: []
    }
    
    // N-up sheet tracking
    this.nupLRU = []
    
    // Statistics
    this.stats = {
      totalBlobsCreated: 0,
      totalBlobsRevoked: 0,
      totalMemoryAllocated: 0,
      totalMemoryFreed: 0,
      currentBlobCount: 0,
      evictions: {
        ULTRA_LOW: 0,
        APPROPRIATE: 0,
        BEST: 0,
        NUP: 0
      }
    }

    // Active blob size tracking (approximate)
    this.activeBlobSize = 0

    this.log('Initialized', this.options)
  }

  log(...args) {
    if (this.options.enableLogging) {
      console.log(this.options.logPrefix, ...args)
    }
  }

  /**
   * Register a new blob URL with metadata
   */
  registerBlob(pageKey, blobUrl, metadata = {}) {
    const { type = 'page', quality = 'ULTRA_LOW', size = 0 } = metadata

    // Check if we already have this blob
    if (this.blobRegistry.has(pageKey)) {
      this.log(`⚠️ Blob already registered for ${pageKey}, will replace`)
      this.revokeBlob(pageKey)
    }

    const entry = {
      url: blobUrl,
      type,
      quality,
      timestamp: Date.now(),
      size: size || this.estimateBlobSize(type, quality),
      pageKey
    }

    this.blobRegistry.set(pageKey, entry)
    this.stats.totalBlobsCreated++
    this.stats.currentBlobCount++
    this.stats.totalMemoryAllocated += entry.size
    this.activeBlobSize += entry.size

    // Add to appropriate LRU
    if (type === 'page') {
      this.qualityLRU[quality].push({ pageKey, timestamp: entry.timestamp })
    } else if (type === 'nup') {
      this.nupLRU.push({ pageKey, timestamp: entry.timestamp })
    }

    this.log(`✅ Registered blob: ${pageKey} | ${type} | ${quality} | ${this.formatBytes(entry.size)}`)
    this.logMemoryStatus()

    // Check if eviction needed
    this.checkAndEvict()

    return blobUrl
  }

  /**
   * Revoke a specific blob URL
   */
  revokeBlob(pageKey) {
    const entry = this.blobRegistry.get(pageKey)
    if (!entry) return false

    try {
      URL.revokeObjectURL(entry.url)
      this.stats.totalBlobsRevoked++
      this.stats.currentBlobCount--
      this.stats.totalMemoryFreed += entry.size
      this.activeBlobSize -= entry.size

      this.blobRegistry.delete(pageKey)

      // Remove from LRU
      if (entry.type === 'page') {
        this.qualityLRU[entry.quality] = this.qualityLRU[entry.quality].filter(
          item => item.pageKey !== pageKey
        )
      } else if (entry.type === 'nup') {
        this.nupLRU = this.nupLRU.filter(item => item.pageKey !== pageKey)
      }

      this.log(`🗑️ Revoked blob: ${pageKey} | ${entry.type} | ${entry.quality} | ${this.formatBytes(entry.size)}`)
      return true
    } catch (error) {
      this.log(`❌ Error revoking blob ${pageKey}:`, error)
      return false
    }
  }

  /**
   * Touch a blob to mark it as recently used (updates LRU)
   */
  touchBlob(pageKey) {
    const entry = this.blobRegistry.get(pageKey)
    if (!entry) return

    entry.timestamp = Date.now()

    // Update LRU position
    if (entry.type === 'page') {
      const lru = this.qualityLRU[entry.quality]
      const index = lru.findIndex(item => item.pageKey === pageKey)
      if (index !== -1) {
        lru.splice(index, 1)
        lru.push({ pageKey, timestamp: entry.timestamp })
      }
    } else if (entry.type === 'nup') {
      const index = this.nupLRU.findIndex(item => item.pageKey === pageKey)
      if (index !== -1) {
        this.nupLRU.splice(index, 1)
        this.nupLRU.push({ pageKey, timestamp: entry.timestamp })
      }
    }
  }

  /**
   * Check cache limits and evict oldest entries if needed
   */
  checkAndEvict() {
    // Check each quality tier
    ['ULTRA_LOW', 'APPROPRIATE', 'BEST'].forEach(quality => {
      const limit = this.getLimit(quality)
      const lru = this.qualityLRU[quality]

      if (lru.length > limit) {
        const toEvict = lru.length - limit
        this.log(`⚠️ ${quality} cache exceeded (${lru.length}/${limit}), evicting ${toEvict} oldest`)

        for (let i = 0; i < toEvict; i++) {
          const oldest = lru[0] // First is oldest
          if (oldest) {
            this.revokeBlob(oldest.pageKey)
            this.stats.evictions[quality]++
          }
        }
      }
    })

    // Check N-up cache
    const nupLimit = this.options.maxNupSheets
    if (this.nupLRU.length > nupLimit) {
      const toEvict = this.nupLRU.length - nupLimit
      this.log(`⚠️ N-up cache exceeded (${this.nupLRU.length}/${nupLimit}), evicting ${toEvict} oldest`)

      for (let i = 0; i < toEvict; i++) {
        const oldest = this.nupLRU[0]
        if (oldest) {
          this.revokeBlob(oldest.pageKey)
          this.stats.evictions.NUP++
        }
      }
    }
  }

  /**
   * Upgrade a page to higher quality (removes lower quality version)
   */
  upgradeQuality(pageNumber, oldQuality, newQuality, newBlobUrl, metadata = {}) {
    const oldKey = this.makePageKey(pageNumber, oldQuality)
    const newKey = this.makePageKey(pageNumber, newQuality)

    this.log(`⬆️ Upgrading page ${pageNumber}: ${oldQuality} → ${newQuality}`)

    // Revoke old quality
    this.revokeBlob(oldKey)

    // Register new quality
    this.registerBlob(newKey, newBlobUrl, {
      type: 'page',
      quality: newQuality,
      ...metadata
    })
  }

  /**
   * Revoke all blobs of a specific quality tier
   */
  revokeQualityTier(quality) {
    const lru = this.qualityLRU[quality]
    const count = lru.length

    this.log(`🗑️ Revoking entire ${quality} tier (${count} blobs)`)

    while (lru.length > 0) {
      const item = lru[0]
      this.revokeBlob(item.pageKey)
    }

    return count
  }

  /**
   * Revoke all N-up sheets
   */
  revokeAllNup() {
    const count = this.nupLRU.length
    this.log(`🗑️ Revoking all N-up sheets (${count} blobs)`)

    while (this.nupLRU.length > 0) {
      const item = this.nupLRU[0]
      this.revokeBlob(item.pageKey)
    }

    return count
  }

  /**
   * Clear everything - use on component unmount
   */
  clear() {
    this.log(`🧹 Clearing all blobs (${this.blobRegistry.size} total)`)

    const urls = Array.from(this.blobRegistry.keys())
    urls.forEach(key => this.revokeBlob(key))

    this.blobRegistry.clear()
    this.qualityLRU = { ULTRA_LOW: [], APPROPRIATE: [], BEST: [] }
    this.nupLRU = []

    this.logMemoryStatus()
    this.logFinalStats()
  }

  /**
   * Get blob URL for a page/quality combination
   */
  getBlob(pageKey) {
    const entry = this.blobRegistry.get(pageKey)
    if (entry) {
      this.touchBlob(pageKey) // Mark as recently used
      return entry.url
    }
    return null
  }

  /**
   * Check if a blob exists
   */
  hasBlob(pageKey) {
    return this.blobRegistry.has(pageKey)
  }

  /**
   * Generate consistent page keys
   */
  makePageKey(pageNumber, quality = 'ULTRA_LOW') {
    return `page_${pageNumber}_${quality}`
  }

  makeNupKey(pageNumbers) {
    return `nup_${pageNumbers.join('-')}`
  }

  /**
   * Estimate blob size based on type and quality
   */
  estimateBlobSize(type, quality) {
    // Rough estimates in bytes
    const estimates = {
      page: {
        ULTRA_LOW: 5 * 1024,      // ~5 KB
        APPROPRIATE: 30 * 1024,   // ~30 KB
        BEST: 150 * 1024          // ~150 KB
      },
      nup: 100 * 1024,             // ~100 KB
      preview: 300 * 1024          // ~300 KB
    }

    if (type === 'page' && estimates.page[quality]) {
      return estimates.page[quality]
    }
    return estimates[type] || 50 * 1024
  }

  /**
   * Get limit for a quality tier
   */
  getLimit(quality) {
    const limits = {
      ULTRA_LOW: this.options.maxUltraLowPages,
      APPROPRIATE: this.options.maxAppropriatPages,
      BEST: this.options.maxBestPages
    }
    return limits[quality] || 50
  }

  /**
   * Format bytes for logging
   */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * Log current memory status
   */
  logMemoryStatus() {
    const ultraLowCount = this.qualityLRU.ULTRA_LOW.length
    const appropriateCount = this.qualityLRU.APPROPRIATE.length
    const bestCount = this.qualityLRU.BEST.length
    const nupCount = this.nupLRU.length

    this.log(
      `📊 Memory: ${this.formatBytes(this.activeBlobSize)} | ` +
      `Blobs: ${this.stats.currentBlobCount} | ` +
      `Ultra: ${ultraLowCount}/${this.options.maxUltraLowPages} | ` +
      `Appropriate: ${appropriateCount}/${this.options.maxAppropriatPages} | ` +
      `Best: ${bestCount}/${this.options.maxBestPages} | ` +
      `N-up: ${nupCount}/${this.options.maxNupSheets}`
    )
  }

  /**
   * Log detailed statistics
   */
  logStats() {
    this.log('📈 Statistics:', {
      ...this.stats,
      activeBlobSize: this.formatBytes(this.activeBlobSize),
      totalAllocated: this.formatBytes(this.stats.totalMemoryAllocated),
      totalFreed: this.formatBytes(this.stats.totalMemoryFreed),
      qualityDistribution: {
        ULTRA_LOW: this.qualityLRU.ULTRA_LOW.length,
        APPROPRIATE: this.qualityLRU.APPROPRIATE.length,
        BEST: this.qualityLRU.BEST.length
      },
      nupCount: this.nupLRU.length
    })
  }

  /**
   * Log final stats on cleanup
   */
  logFinalStats() {
    this.log('🏁 Final Statistics:', {
      totalBlobsCreated: this.stats.totalBlobsCreated,
      totalBlobsRevoked: this.stats.totalBlobsRevoked,
      totalMemoryAllocated: this.formatBytes(this.stats.totalMemoryAllocated),
      totalMemoryFreed: this.formatBytes(this.stats.totalMemoryFreed),
      totalEvictions: this.stats.evictions,
      leaked: this.stats.totalBlobsCreated - this.stats.totalBlobsRevoked
    })
  }

  /**
   * Get current memory report
   */
  getReport() {
    return {
      activeBlobSize: this.activeBlobSize,
      activeBlobCount: this.stats.currentBlobCount,
      totalCreated: this.stats.totalBlobsCreated,
      totalRevoked: this.stats.totalBlobsRevoked,
      distribution: {
        ULTRA_LOW: this.qualityLRU.ULTRA_LOW.length,
        APPROPRIATE: this.qualityLRU.APPROPRIATE.length,
        BEST: this.qualityLRU.BEST.length,
        NUP: this.nupLRU.length
      },
      evictions: { ...this.stats.evictions }
    }
  }
}

// Export singleton instance and class
export const createMemoryManager = (options) => new PDFMemoryManager(options)
export default PDFMemoryManager
