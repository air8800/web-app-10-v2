/**
 * PDF Editor Performance Logger
 * Centralized performance tracking with structured console output
 */

export class PerformanceLogger {
  constructor(name = 'PDFEditor', enableLogging = true) {
    this.name = name
    this.enableLogging = enableLogging
    this.marks = new Map() // label -> timestamp
    this.measures = new Map() // label -> { start, end, duration, metadata }
    this.pageTimings = [] // Array of { pageNum, startTime, endTime, duration, type }
    this.startTime = null
    this.firstPageReady = null
    this.editorReady = null
  }

  /**
   * Mark the start of the entire loading process
   */
  start() {
    this.startTime = performance.now()
    this.marks.clear()
    this.measures.clear()
    this.pageTimings = []
    this.firstPageReady = null
    this.editorReady = null
    this.log('🚀 Performance tracking started')
  }

  /**
   * Mark a specific point in time
   */
  mark(label) {
    const timestamp = performance.now()
    this.marks.set(label, timestamp)
    
    if (this.startTime) {
      const elapsed = timestamp - this.startTime
      this.log(`⏱️ [${label}] at ${this.formatDuration(elapsed)}`)
    }
  }

  /**
   * Measure time between two marks
   */
  measure(label, startLabel, endLabel, metadata = {}) {
    const start = this.marks.get(startLabel)
    const end = this.marks.get(endLabel) || performance.now()
    
    if (!start) {
      console.warn(`No start mark found for: ${startLabel}`)
      return null
    }

    const duration = end - start
    const measure = { start, end, duration, metadata, label }
    this.measures.set(label, measure)

    this.log(`📊 [${label}] took ${this.formatDuration(duration)}`, metadata)
    return duration
  }

  /**
   * Record page loading timing
   */
  recordPageLoad(pageNum, startTime, endTime, type = 'progressive', metadata = {}) {
    const duration = endTime - startTime
    const timing = {
      pageNum,
      startTime,
      endTime,
      duration,
      type,
      ...metadata
    }
    
    this.pageTimings.push(timing)

    // Track first page specially
    if (!this.firstPageReady && type === 'first') {
      this.firstPageReady = duration
    }

    const fromStart = this.startTime ? startTime - this.startTime : 0
    this.log(
      `📄 Page ${pageNum} (${type}): ${this.formatDuration(duration)} ` +
      `(started at +${this.formatDuration(fromStart)})`
    )

    // Warn if page takes too long
    if (duration > 500) {
      console.warn(`⚠️ Slow page load detected: Page ${pageNum} took ${this.formatDuration(duration)}`)
    }

    return duration
  }

  /**
   * Mark editor as ready for interaction
   */
  markEditorReady() {
    if (!this.startTime) return
    
    this.editorReady = performance.now() - this.startTime
    this.log(`✅ Editor Interactive: ${this.formatDuration(this.editorReady)}`)
  }

  /**
   * Get statistics about page loading
   */
  getPageStats() {
    if (this.pageTimings.length === 0) {
      return null
    }

    const durations = this.pageTimings.map(t => t.duration)
    const sum = durations.reduce((a, b) => a + b, 0)
    const avg = sum / durations.length
    const min = Math.min(...durations)
    const max = Math.max(...durations)
    
    // Calculate median
    const sorted = [...durations].sort((a, b) => a - b)
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]

    // Find slow pages (> 500ms)
    const slowPages = this.pageTimings.filter(t => t.duration > 500)

    return {
      totalPages: this.pageTimings.length,
      avgDuration: avg,
      minDuration: min,
      maxDuration: max,
      medianDuration: median,
      totalTime: sum,
      slowPages: slowPages.map(t => ({ page: t.pageNum, duration: t.duration }))
    }
  }

  /**
   * Generate comprehensive summary report
   */
  generateReport() {
    if (!this.startTime) {
      console.warn('Performance logger was never started')
      return
    }

    const totalTime = performance.now() - this.startTime
    const pageStats = this.getPageStats()

    const report = {
      '📊 Total Time': this.formatDuration(totalTime),
      '⚡ Editor Ready': this.editorReady ? this.formatDuration(this.editorReady) : 'N/A',
      '📄 First Page': this.firstPageReady ? this.formatDuration(this.firstPageReady) : 'N/A',
    }

    if (pageStats) {
      report['📚 Pages Loaded'] = pageStats.totalPages
      report['⏱️ Avg Page Time'] = this.formatDuration(pageStats.avgDuration)
      report['🐌 Slowest Page'] = this.formatDuration(pageStats.maxDuration)
      report['⚡ Fastest Page'] = this.formatDuration(pageStats.minDuration)
      report['📊 Median Page Time'] = this.formatDuration(pageStats.medianDuration)
    }

    return report
  }

  /**
   * Log summary to console
   */
  logSummary() {
    if (!this.enableLogging) return

    const report = this.generateReport()
    const pageStats = this.getPageStats()

    console.groupCollapsed(`📊 ${this.name} Performance Summary`)
    console.table(report)

    if (pageStats && pageStats.slowPages.length > 0) {
      console.group('⚠️ Slow Pages (>500ms)')
      console.table(pageStats.slowPages)
      console.groupEnd()
    }

    // Show all measures
    if (this.measures.size > 0) {
      console.group('📏 Detailed Measurements')
      const measuresTable = Array.from(this.measures.entries()).map(([label, measure]) => ({
        Stage: label,
        Duration: this.formatDuration(measure.duration),
        Metadata: JSON.stringify(measure.metadata)
      }))
      console.table(measuresTable)
      console.groupEnd()
    }

    // Show page load timeline
    if (this.pageTimings.length > 0 && this.pageTimings.length <= 20) {
      console.group('📄 Page Load Timeline (first 20)')
      const timeline = this.pageTimings.slice(0, 20).map(t => ({
        Page: t.pageNum,
        Type: t.type,
        Duration: this.formatDuration(t.duration),
        'Started At': this.formatDuration(t.startTime - this.startTime)
      }))
      console.table(timeline)
      console.groupEnd()
    }

    console.groupEnd()
  }

  /**
   * Log a message with the component prefix
   */
  log(message, data = null) {
    if (!this.enableLogging) return

    if (data) {
      console.log(`[${this.name}] ${message}`, data)
    } else {
      console.log(`[${this.name}] ${message}`)
    }
  }

  /**
   * Format duration in a human-readable way
   */
  formatDuration(ms) {
    if (ms < 1) return `${ms.toFixed(2)}ms`
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  /**
   * Get time since start
   */
  getElapsed() {
    if (!this.startTime) return 0
    return performance.now() - this.startTime
  }

  /**
   * Create a scoped timing function for a specific operation
   */
  createTimer(label) {
    const startTime = performance.now()
    
    return {
      end: (metadata = {}) => {
        const endTime = performance.now()
        const duration = endTime - startTime
        this.log(`⏱️ [${label}] ${this.formatDuration(duration)}`, metadata)
        return duration
      }
    }
  }

  /**
   * Track a page load with automatic timing
   */
  trackPageLoad(pageNum, type = 'progressive') {
    const startTime = performance.now()
    const steps = [] // Track individual steps within page loading
    
    return {
      step: (stepName) => {
        const stepTime = performance.now()
        const duration = stepTime - (steps.length > 0 ? steps[steps.length - 1].endTime : startTime)
        steps.push({
          name: stepName,
          startTime: steps.length > 0 ? steps[steps.length - 1].endTime : startTime,
          endTime: stepTime,
          duration: duration
        })
        
        // Log granular step (only for first 5 pages to avoid spam)
        if (pageNum <= 5) {
          this.log(`  ├─ ${stepName}: ${this.formatDuration(duration)}`)
        }
        
        return this
      },
      complete: (metadata = {}) => {
        const endTime = performance.now()
        
        // Log step summary for first 5 pages
        if (pageNum <= 5 && steps.length > 0) {
          this.log(`  └─ Total: ${this.formatDuration(endTime - startTime)}`)
          this.log(`     Path: ${steps.map(s => s.name).join(' → ')}`)
        }
        
        return this.recordPageLoad(pageNum, startTime, endTime, type, { 
          ...metadata, 
          steps: steps 
        })
      }
    }
  }

  /**
   * Reset all tracking data
   */
  reset() {
    this.marks.clear()
    this.measures.clear()
    this.pageTimings = []
    this.startTime = null
    this.firstPageReady = null
    this.editorReady = null
  }
}

/**
 * Create a performance logger instance
 */
export const createPerformanceLogger = (name, enableLogging = true) => {
  return new PerformanceLogger(name, enableLogging)
}

export default PerformanceLogger
