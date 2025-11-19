/**
 * PDF Geometry Utilities
 * 
 * Pure functions for calculating geometric transformations for PDF pages,
 * including crop, rotation, scale, and offset calculations for both
 * canvas rendering and PDF export.
 */

export interface Dimensions {
  width: number
  height: number
}

export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

export interface EditHistory {
  cropArea?: CropArea | null
  rotation?: number
  scale?: number
  offsetX?: number
  offsetY?: number
}

export interface SourceRect {
  x: number
  y: number
  width: number
  height: number
}

export interface GeometricTransform {
  sourceRect: SourceRect
  scaleToFit: number
  finalScale: number
  drawWidth: number
  drawHeight: number
  drawX: number
  drawY: number
  pdfDrawX: number
  pdfDrawY: number
  pdfRotation: number
  offsetX: number
  offsetY: number
}

/**
 * Builds unified geometric transformation for combining crop, rotation, and scale
 * Returns all parameters needed for both canvas rendering and PDF export
 * 
 * @param originalDims - {width, height} of original uncropped page
 * @param targetDims - {width, height} of target page (usually same as original)
 * @param editHistory - {cropArea, rotation, scale, offsetX, offsetY}
 * @returns Transformation parameters for rendering and export
 */
export const buildGeometricTransform = (
  originalDims: Dimensions,
  targetDims: Dimensions,
  editHistory?: EditHistory | null
): GeometricTransform => {
  const { cropArea, rotation = 0, scale = 100, offsetX = 0, offsetY = 0 } = editHistory || {}
  
  // Step 1: Determine source rectangle (crop region in original page coordinates)
  let sourceRect: SourceRect = {
    x: 0,
    y: 0,
    width: originalDims.width,
    height: originalDims.height
  }
  
  if (cropArea) {
    sourceRect = {
      x: cropArea.x * originalDims.width,
      y: cropArea.y * originalDims.height,
      width: cropArea.width * originalDims.width,
      height: cropArea.height * originalDims.height
    }
  }
  
  // Step 2: Calculate auto-scale to fit rotated content in target page
  // CRITICAL: For crop, DON'T auto-scale to fill page. Crop should preserve size relationship.
  // Auto-scale only needed for rotation to fit rotated content in fixed page dimensions.
  const normalizedRotation = ((rotation % 360) + 360) % 360
  const isRotated90or270 = normalizedRotation === 90 || normalizedRotation === 270
  
  let scaleToFit: number
  if (rotation !== 0) {
    // ROTATION: Auto-scale to fit rotated content in page
    if (isRotated90or270) {
      // Dimensions are swapped after 90/270° rotation
      const scaleX = targetDims.width / sourceRect.height
      const scaleY = targetDims.height / sourceRect.width
      scaleToFit = Math.min(scaleX, scaleY) * 0.90  // 10% margin to prevent overflow
    } else {
      // For non-90° rotations, use original dimensions for bounding box
      // This is approximate - true bounding box needs cos/sin calculation
      const scaleX = targetDims.width / sourceRect.width
      const scaleY = targetDims.height / sourceRect.height
      scaleToFit = Math.min(scaleX, scaleY) * 0.90  // 10% margin to prevent overflow
    }
  } else {
    // NO ROTATION: No auto-scaling, preserve 1:1 relationship
    scaleToFit = 1
  }
  
  // Step 3: Apply user scale on top of auto-fit
  const userScaleFactor = scale / 100
  const finalScale = scaleToFit * userScaleFactor
  
  // Step 4: Calculate final draw dimensions
  const drawWidth = sourceRect.width * finalScale
  const drawHeight = sourceRect.height * finalScale
  
  // Step 5: Calculate drawing position (centered, with user offset)
  // For canvas: draw centered at origin after ctx.translate to center
  const drawX = -drawWidth / 2
  const drawY = -drawHeight / 2
  
  // Step 6: Build PDF transformation matrix (for pdf-lib export)
  // pdf-lib uses bottom-left origin and counter-clockwise rotation
  const radians = (-rotation * Math.PI) / 180  // Negate for counter-clockwise
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  
  // Calculate rotated offset vector (center to bottom-left corner)
  const vectorX = -drawWidth / 2
  const vectorY = -drawHeight / 2
  const rotatedVectorX = vectorX * cos - vectorY * sin
  const rotatedVectorY = vectorX * sin + vectorY * cos
  
  const pageCenterX = targetDims.width / 2
  const pageCenterY = targetDims.height / 2
  
  const pdfDrawX = pageCenterX + rotatedVectorX + offsetX
  const pdfDrawY = pageCenterY + rotatedVectorY - offsetY  // Flip Y for PDF coords
  
  return {
    sourceRect,           // Crop region in original coordinates
    scaleToFit,          // Auto-fit scale factor
    finalScale,          // Total scale (auto-fit × user scale)
    drawWidth,           // Final width to draw
    drawHeight,          // Final height to draw
    drawX,               // Canvas: drawing X (relative to center)
    drawY,               // Canvas: drawing Y (relative to center)
    pdfDrawX,            // PDF: drawing X (absolute)
    pdfDrawY,            // PDF: drawing Y (absolute)
    pdfRotation: -rotation,  // PDF rotation (counter-clockwise)
    offsetX,             // User offset X
    offsetY              // User offset Y
  }
}

/**
 * Calculate scale to fit dimensions considering rotation
 * 
 * @param sourceWidth - Original width
 * @param sourceHeight - Original height
 * @param targetWidth - Target width
 * @param targetHeight - Target height
 * @param rotation - Rotation angle in degrees
 * @returns Scale factor to fit content in target
 */
export const calculateScaleToFit = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  rotation: number
): number => {
  const normalizedRotation = ((rotation % 360) + 360) % 360
  const isRotated90or270 = normalizedRotation === 90 || normalizedRotation === 270
  
  if (isRotated90or270) {
    // Dimensions are swapped after 90/270° rotation
    const scaleX = targetWidth / sourceHeight
    const scaleY = targetHeight / sourceWidth
    return Math.min(scaleX, scaleY) * 0.90  // 10% margin to prevent overflow
  } else {
    // For 0°/180° or non-90° rotations
    const scaleX = targetWidth / sourceWidth
    const scaleY = targetHeight / sourceHeight
    return Math.min(scaleX, scaleY) * 0.90  // 10% margin to prevent overflow
  }
}

/**
 * Normalize rotation angle to 0-359 range
 * 
 * @param rotation - Rotation angle in degrees (can be negative)
 * @returns Normalized rotation (0-359)
 */
export const normalizeRotation = (rotation: number): number => {
  return ((rotation % 360) + 360) % 360
}

/**
 * Check if rotation is 90 or 270 degrees
 * 
 * @param rotation - Rotation angle in degrees
 * @returns True if rotation is 90 or 270 degrees
 */
export const isRotated90or270 = (rotation: number): boolean => {
  const normalized = normalizeRotation(rotation)
  return normalized === 90 || normalized === 270
}
