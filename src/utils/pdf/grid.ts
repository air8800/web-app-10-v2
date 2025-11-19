/**
 * PDF Grid Layout Utilities
 * 
 * Functions for creating N-up page layouts (multiple pages per sheet)
 * by combining multiple page canvases into a single canvas.
 */

import { Dimensions } from './geometry'

/**
 * Combine two consecutive pages into a single canvas for N-up (2 pages per sheet) display
 * 
 * @param page1Canvas - Canvas for first page
 * @param page2Canvas - Canvas for second page
 * @param targetPageSize - Target page dimensions {width, height}
 * @returns Combined canvas with both pages side-by-side
 */
export const combineConsecutivePagesForGrid = (
  page1Canvas: HTMLCanvasElement,
  page2Canvas: HTMLCanvasElement,
  targetPageSize: Dimensions
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
  
  if (!ctx) {
    console.error('Failed to get 2d context for grid combination')
    return page1Canvas
  }
  
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const thumbnailScale = 0.3
  const pageWidth = targetPageSize.width * thumbnailScale
  const pageHeight = targetPageSize.height * thumbnailScale

  const gap = 8
  canvas.width = pageWidth * 2 + gap
  canvas.height = pageHeight

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const halfWidth = canvas.width / 2
  const margin = 2

  // Draw page boundaries with dashed lines
  ctx.strokeStyle = '#3B82F6'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.strokeRect(margin, margin, halfWidth - gap / 2 - margin, canvas.height - margin * 2)
  ctx.strokeRect(halfWidth + gap / 2, margin, halfWidth - gap / 2 - margin, canvas.height - margin * 2)
  ctx.setLineDash([])

  const availableWidth = halfWidth - gap / 2 - margin * 4
  const availableHeight = canvas.height - margin * 6

  const drawPageFitted = (pageCanvas: HTMLCanvasElement, x: number, y: number) => {
    const pageRatio = pageCanvas.width / pageCanvas.height
    const availRatio = availableWidth / availableHeight

    let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number

    if (pageRatio > availRatio) {
      drawWidth = availableWidth
      drawHeight = availableWidth / pageRatio
      offsetX = x
      offsetY = y + (availableHeight - drawHeight) / 2
    } else {
      drawHeight = availableHeight
      drawWidth = availableHeight * pageRatio
      offsetX = x + (availableWidth - drawWidth) / 2
      offsetY = y
    }

    ctx.drawImage(pageCanvas, offsetX, offsetY, drawWidth, drawHeight)
  }

  drawPageFitted(page1Canvas, margin * 2, margin * 3)
  drawPageFitted(page2Canvas, halfWidth + gap / 2 + margin * 2, margin * 3)

  return canvas
}
