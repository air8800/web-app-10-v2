/**
 * PDF Color Filter Utilities
 * 
 * Functions for applying color filters to canvas elements,
 * such as grayscale conversion for black and white printing.
 */

export type ColorMode = 'BW' | 'Color'

/**
 * Apply color filter to a canvas
 * 
 * @param canvas - Source canvas to filter
 * @param mode - Color mode ('BW' for grayscale, 'Color' for no filter)
 * @returns Filtered canvas (new canvas for BW, original for Color)
 */
export const applyColorFilter = (canvas: HTMLCanvasElement, mode: ColorMode): HTMLCanvasElement => {
  if (mode !== 'BW') return canvas

  // Optimized grayscale using GPU-accelerated canvas filter
  const filtered = document.createElement('canvas')
  filtered.width = canvas.width
  filtered.height = canvas.height
  const ctx = filtered.getContext('2d', { alpha: false, willReadFrequently: false })
  
  if (!ctx) {
    console.error('Failed to get 2d context for color filter')
    return canvas
  }
  
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  // Fill with white background
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, filtered.width, filtered.height)
  
  // Apply grayscale filter using GPU acceleration
  ctx.filter = 'grayscale(100%)'
  ctx.drawImage(canvas, 0, 0)
  
  return filtered
}
