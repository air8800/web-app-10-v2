/**
 * Sequential Page Loader
 * Loads PDF pages one-by-one in small batches with proper loading states
 * Optimized for memory efficiency and smooth user experience
 */

export class SequentialPageLoader {
  constructor(options = {}) {
    this.options = {
      pagesPerMicroBatch: options.pagesPerMicroBatch || 2, // Load 2 pages at a time
      delayBetweenBatches: options.delayBetweenBatches || 50, // 50ms between micro-batches
      enableLogging: options.enableLogging !== false,
      logPrefix: options.logPrefix || '🔄 [SeqLoader]',
    }

    this.isLoading = false
    this.queue = []
    this.loadingPages = new Set()
    this.loadedPages = new Set()
    this.aborted = false

    this.stats = {
      totalPagesRequested: 0,
      totalPagesLoaded: 0,
      totalBatchesProcessed: 0,
      averageLoadTime: 0,
      loadTimes: []
    }
  }

  log(...args) {
    if (this.options.enableLogging) {
      console.log(this.options.logPrefix, ...args)
    }
  }

  /**
   * Queue pages for loading
   */
  queuePages(pageNumbers, renderFunction, onPageLoaded, onBatchComplete) {
    const newPages = pageNumbers.filter(
      num => !this.loadedPages.has(num) && !this.loadingPages.has(num)
    )

    if (newPages.length === 0) {
      this.log('All requested pages already loaded/loading')
      return
    }

    this.log(`📋 Queuing ${newPages.length} pages:`, newPages)

    this.queue.push({
      pages: newPages,
      renderFunction,
      onPageLoaded,
      onBatchComplete,
      queuedAt: Date.now()
    })

    this.stats.totalPagesRequested += newPages.length

    // Start processing if not already running
    if (!this.isLoading) {
      this.processQueue()
    }
  }

  /**
   * Process the queue sequentially
   */
  async processQueue() {
    if (this.isLoading || this.queue.length === 0 || this.aborted) {
      return
    }

    this.isLoading = true
    this.log('🚀 Starting sequential loading...')

    while (this.queue.length > 0 && !this.aborted) {
      const job = this.queue.shift()
      await this.processJob(job)
    }

    this.isLoading = false
    this.log('✅ Sequential loading complete')
    this.logStats()
  }

  /**
   * Process a single job (batch of pages)
   */
  async processJob(job) {
    const { pages, renderFunction, onPageLoaded, onBatchComplete } = job
    const microBatchSize = this.options.pagesPerMicroBatch

    this.log(`📦 Processing job: ${pages.length} pages in micro-batches of ${microBatchSize}`)

    const loadedInJob = []

    // Split into micro-batches
    for (let i = 0; i < pages.length; i += microBatchSize) {
      if (this.aborted) break

      const microBatch = pages.slice(i, i + microBatchSize)
      this.log(`  ⚡ Loading micro-batch: pages ${microBatch.join(', ')}`)

      const startTime = Date.now()

      // Mark as loading
      microBatch.forEach(num => this.loadingPages.add(num))

      // Load pages in parallel within micro-batch (still small)
      const promises = microBatch.map(async (pageNum) => {
        try {
          const result = await renderFunction(pageNum)
          
          // Mark as loaded
          this.loadingPages.delete(pageNum)
          this.loadedPages.add(pageNum)
          this.stats.totalPagesLoaded++

          // Emit individual page loaded event
          if (onPageLoaded && result) {
            onPageLoaded(result, pageNum)
          }

          return result
        } catch (error) {
          this.log(`❌ Error loading page ${pageNum}:`, error)
          this.loadingPages.delete(pageNum)
          return null
        }
      })

      const results = await Promise.all(promises)
      const validResults = results.filter(r => r !== null)
      loadedInJob.push(...validResults)

      const loadTime = Date.now() - startTime
      this.stats.loadTimes.push(loadTime)
      this.stats.totalBatchesProcessed++

      this.log(
        `  ✓ Micro-batch loaded in ${loadTime}ms ` +
        `(${validResults.length}/${microBatch.length} successful)`
      )

      // Small delay between micro-batches for smooth rendering
      if (i + microBatchSize < pages.length) {
        await this.delay(this.options.delayBetweenBatches)
      }
    }

    // Notify job completion
    if (onBatchComplete) {
      onBatchComplete(loadedInJob)
    }

    this.log(`✅ Job complete: ${loadedInJob.length} pages loaded`)
  }

  /**
   * Abort current loading
   */
  abort() {
    this.log('🛑 Aborting sequential loader')
    this.aborted = true
    this.queue = []
    this.loadingPages.clear()
  }

  /**
   * Reset abort flag
   */
  resume() {
    this.aborted = false
  }

  /**
   * Clear all state
   */
  clear() {
    this.log('🧹 Clearing loader state')
    this.abort()
    this.loadedPages.clear()
    this.isLoading = false
  }

  /**
   * Check if a page is currently loading
   */
  isPageLoading(pageNum) {
    return this.loadingPages.has(pageNum)
  }

  /**
   * Check if a page is loaded
   */
  isPageLoaded(pageNum) {
    return this.loadedPages.has(pageNum)
  }

  /**
   * Get loading state for a page
   */
  getPageState(pageNum) {
    if (this.loadedPages.has(pageNum)) return 'loaded'
    if (this.loadingPages.has(pageNum)) return 'loading'
    return 'pending'
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Calculate average load time
   */
  getAverageLoadTime() {
    if (this.stats.loadTimes.length === 0) return 0
    const sum = this.stats.loadTimes.reduce((a, b) => a + b, 0)
    return Math.round(sum / this.stats.loadTimes.length)
  }

  /**
   * Log statistics
   */
  logStats() {
    const avgTime = this.getAverageLoadTime()
    this.log('📊 Loading Statistics:', {
      totalRequested: this.stats.totalPagesRequested,
      totalLoaded: this.stats.totalPagesLoaded,
      batchesProcessed: this.stats.totalBatchesProcessed,
      averageLoadTime: `${avgTime}ms`,
      currentlyLoading: this.loadingPages.size,
      queueDepth: this.queue.length
    })
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      averageLoadTime: this.getAverageLoadTime(),
      currentlyLoading: this.loadingPages.size,
      queueDepth: this.queue.length,
      totalLoaded: this.loadedPages.size
    }
  }
}

export default SequentialPageLoader
