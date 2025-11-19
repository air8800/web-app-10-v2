import React, { useState, useEffect, useRef } from 'react'
import { X, Save, RotateCw, RotateCcw, Crop, Sun, Contrast, RefreshCw, ZoomIn, ZoomOut, Move, Grid2x2 as Grid, Scissors, Check, Maximize2, ArrowLeftRight, ArrowUpDown } from 'lucide-react'
import { getPageSize, DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../utils/pageSizes'
import Dropdown from './Dropdown'

const ImageEditor = ({ file, onSave, onCancel, pageSize = DEFAULT_PAGE_SIZE, onPageSizeChange, colorMode = 'BW', pagesPerSheet = 1 }) => {
  const [image, setImage] = useState(null)
  const [originalImage, setOriginalImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentPageSize, setCurrentPageSize] = useState(pageSize)

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

  const [settings, setSettings] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    rotation: 0,
    filter: 'none',
    scale: 100,
    offsetX: 0,
    offsetY: 0
  })

  const [cropMode, setCropMode] = useState(false)
  const [cropArea, setCropArea] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragHandle, setDragHandle] = useState(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const rafRef = useRef(null)
  const [imageRect, setImageRect] = useState(null)
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(1)

  const [activeTab, setActiveTab] = useState('pagesize')
  const [tempPageSize, setTempPageSize] = useState(pageSize)

  const canvasRef = useRef(null)
  const imageContainerRef = useRef(null)
  const debounceTimeoutRef = useRef(null)

  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      loadImage()
    }
  }, [file])

  useEffect(() => {
    if (image) {
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
      }, 16) // 16ms debounce for instant 60fps slider response
    }
    
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [settings, image, currentPageSize, colorMode, pagesPerSheet])

  const loadImage = async () => {
    try {
      console.time('⏱️ Image Editor - Total Load Time')
      setLoading(true)
      setError(null)

      console.time('⏱️ Image Editor - Create Image Object')
      const img = new Image()
      img.onload = () => {
        console.timeEnd('⏱️ Image Editor - Create Image Object')
        console.log(`🖼️ Image Editor - Dimensions: ${img.width}x${img.height}`)
        
        console.time('⏱️ Image Editor - Create Canvas')
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        canvas.width = img.width
        canvas.height = img.height

        context.fillStyle = 'white'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(img, 0, 0)
        console.timeEnd('⏱️ Image Editor - Create Canvas')

        console.time('⏱️ Image Editor - Setup State')
        setImage({
          canvas,
          width: img.width,
          height: img.height
        })
        setOriginalImage({
          canvas: canvas.cloneNode(),
          width: img.width,
          height: img.height
        })
        console.timeEnd('⏱️ Image Editor - Setup State')

        console.timeEnd('⏱️ Image Editor - Total Load Time')
        console.log('✅ Image Editor - Image loaded successfully')
        setLoading(false)
      }
      img.onerror = () => {
        console.error('❌ Error loading image')
        setError('Failed to load image')
        setLoading(false)
      }
      img.src = URL.createObjectURL(file)
    } catch (error) {
      console.error('❌ Error loading image:', error)
      setError('Failed to load image: ' + error.message)
      setLoading(false)
    }
  }

  const applyEdits = () => {
    if (!image || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // Get target page size dimensions
    const targetPageSize = getPageSize(currentPageSize)

    let sourceCanvas = originalImage ? originalImage.canvas : image.canvas
    let workingCanvas = sourceCanvas
    let workingWidth = sourceCanvas.width
    let workingHeight = sourceCanvas.height

    // Set canvas to target page size dimensions
    const canvasWidth = targetPageSize.width
    const canvasHeight = targetPageSize.height

    canvas.width = canvasWidth
    canvas.height = canvasHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)

    ctx.translate(settings.offsetX, settings.offsetY)

    if (settings.rotation !== 0) {
      ctx.rotate((settings.rotation * Math.PI) / 180)
    }

    let filterString = ''
    if (settings.brightness !== 0) {
      filterString += `brightness(${100 + settings.brightness}%) `
    }
    if (settings.contrast !== 0) {
      filterString += `contrast(${100 + settings.contrast}%) `
    }
    if (settings.saturation !== 0) {
      filterString += `saturate(${100 + settings.saturation}%) `
    }

    switch (settings.filter) {
      case 'grayscale':
        filterString += 'grayscale(100%) '
        break
      case 'sepia':
        filterString += 'sepia(100%) '
        break
      case 'blur':
        filterString += 'blur(1px) '
        break
    }

    ctx.filter = filterString || 'none'

    let scaleToFit = 1
    let drawWidth = workingWidth
    let drawHeight = workingHeight

    const rotation = settings.rotation % 360
    const isRotated90or270 = rotation === 90 || rotation === 270

    if (isRotated90or270) {
      const rotatedContentWidth = workingHeight
      const rotatedContentHeight = workingWidth

      const scaleX = canvasWidth / rotatedContentWidth
      const scaleY = canvasHeight / rotatedContentHeight
      scaleToFit = Math.min(scaleX, scaleY, 1)
    } else {
      const scaleX = canvasWidth / workingWidth
      const scaleY = canvasHeight / workingHeight
      scaleToFit = Math.min(scaleX, scaleY, 1)
    }

    // Apply automatic fit scaling
    drawWidth = workingWidth * scaleToFit
    drawHeight = workingHeight * scaleToFit

    const contentScale = settings.scale / 100
    drawWidth *= contentScale
    drawHeight *= contentScale

    ctx.drawImage(workingCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
    ctx.restore()

    // Apply color mode filter (BW/Color) - optimized using canvas filter
    if (colorMode === 'BW') {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const tempCtx = tempCanvas.getContext('2d')
      tempCtx.filter = 'grayscale(100%)'
      tempCtx.drawImage(canvas, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(tempCanvas, 0, 0)
    }

    // Apply N-up layout visualization
    if (pagesPerSheet === 2) {
      // Store the current canvas content
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const tempCtx = tempCanvas.getContext('2d')
      tempCtx.drawImage(canvas, 0, 0)

      // Create WIDE landscape canvas
      const gap = 12
      canvas.width = tempCanvas.width * 2 + gap
      canvas.height = tempCanvas.height

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
      ctx.drawImage(tempCanvas, margin * 2, margin * 2, pageWidth, pageHeight)

      // Draw second page (right) - FILL width
      ctx.drawImage(tempCanvas, halfWidth + gap / 2 + margin, margin * 2, pageWidth, pageHeight)
    }

    setTimeout(updateImageRect, 150)
  }

  const updateImageRect = () => {
    if (!canvasRef.current) return

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

    setImageRect(imageRect)
  }

  const startCrop = () => {
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

        const canvasPixelWidth = canvas.width
        const canvasPixelHeight = canvas.height

        const cropWidth = canvasPixelWidth * 0.8
        const cropHeight = canvasPixelHeight * 0.8

        const cropX = (canvasPixelWidth - cropWidth) / 2
        const cropY = (canvasPixelHeight - cropHeight) / 2

        setCropArea({
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight
        })
      }
    }, 200)
  }

  const handleMouseDown = (e, handle) => {
    if (!cropMode || !cropArea) return

    e.preventDefault()
    e.stopPropagation()

    console.log('🕱️ Mouse down on handle:', handle, 'Current zoom:', zoom)

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
      const canvasDOMWidth = rect.width / zoom
      const canvasDOMHeight = rect.height / zoom

      // Convert DOM delta to canvas pixel delta
      const pixelToDOMRatioX = canvasDOMWidth / canvas.width
      const pixelToDOMRatioY = canvasDOMHeight / canvas.height

      const deltaX = domDeltaX / pixelToDOMRatioX
      const deltaY = domDeltaY / pixelToDOMRatioY

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
    if (!cropArea || !image) return

    try {
      const displayCanvas = canvasRef.current
      if (!displayCanvas) return

      if (cropArea.width < 10 || cropArea.height < 10) return

      const croppedCanvas = document.createElement('canvas')
      const croppedCtx = croppedCanvas.getContext('2d')

      const cropX = Math.max(0, Math.round(cropArea.x))
      const cropY = Math.max(0, Math.round(cropArea.y))
      const cropWidth = Math.min(Math.round(cropArea.width), displayCanvas.width - cropX)
      const cropHeight = Math.min(Math.round(cropArea.height), displayCanvas.height - cropY)

      croppedCanvas.width = cropWidth
      croppedCanvas.height = cropHeight

      croppedCtx.drawImage(
        displayCanvas,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      )

      const finalCanvas = document.createElement('canvas')
      const finalCtx = finalCanvas.getContext('2d')

      finalCanvas.width = originalImage.width
      finalCanvas.height = originalImage.height

      finalCtx.fillStyle = 'white'
      finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)

      const offsetX = (finalCanvas.width - cropWidth) / 2
      const offsetY = (finalCanvas.height - cropHeight) / 2
      finalCtx.drawImage(croppedCanvas, offsetX, offsetY)

      setImage({
        canvas: finalCanvas,
        width: originalImage.width,
        height: originalImage.height
      })

      setSettings({
        brightness: 0,
        contrast: 0,
        saturation: 0,
        rotation: 0,
        filter: 'none',
        scale: 100,
        offsetX: 0,
        offsetY: 0
      })

      setCropMode(false)
      setCropArea(null)

      requestAnimationFrame(() => {
        if (canvasRef.current) {
          const displayCanvas = canvasRef.current
          const displayCtx = displayCanvas.getContext('2d')
          displayCanvas.width = finalCanvas.width
          displayCanvas.height = finalCanvas.height
          displayCtx.drawImage(finalCanvas, 0, 0)
        }
      })

    } catch (error) {
      console.error('❌ Error applying crop:', error)
    }
  }

  const resetSettings = () => {
    setSettings({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      rotation: 0,
      filter: 'none',
      scale: 100,
      offsetX: 0,
      offsetY: 0
    })
  }

  const applyAllChanges = () => {
    if (cropMode && cropArea && !isDragging) {
      applyCrop()
      setTimeout(() => {
        finalizeSave()
      }, 100)
      return
    }

    finalizeSave()
  }

  const finalizeSave = () => {
    if (!image || !originalImage) return

    // Create a new canvas with the proper dimensions for saving
    const finalCanvas = document.createElement('canvas')
    const finalCtx = finalCanvas.getContext('2d')

    // Determine the output dimensions based on rotation
    const rotation = settings.rotation % 360
    const isRotated90or270 = rotation === 90 || rotation === 270

    let outputWidth, outputHeight
    if (isRotated90or270) {
      // Swap dimensions for 90/270 degree rotations
      outputWidth = originalImage.height
      outputHeight = originalImage.width
    } else {
      outputWidth = originalImage.width
      outputHeight = originalImage.height
    }

    // Apply user scale to output dimensions
    const userScale = settings.scale / 100
    outputWidth = Math.round(outputWidth * userScale)
    outputHeight = Math.round(outputHeight * userScale)

    finalCanvas.width = outputWidth
    finalCanvas.height = outputHeight

    // Fill with white background
    finalCtx.fillStyle = 'white'
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)

    // Apply transformations
    finalCtx.save()
    finalCtx.translate(finalCanvas.width / 2, finalCanvas.height / 2)

    // Apply offset
    finalCtx.translate(settings.offsetX * userScale, settings.offsetY * userScale)

    // Apply rotation
    if (settings.rotation !== 0) {
      finalCtx.rotate((settings.rotation * Math.PI) / 180)
    }

    // Apply filters
    let filterString = ''
    if (settings.brightness !== 0) {
      filterString += `brightness(${100 + settings.brightness}%) `
    }
    if (settings.contrast !== 0) {
      filterString += `contrast(${100 + settings.contrast}%) `
    }
    if (settings.saturation !== 0) {
      filterString += `saturate(${100 + settings.saturation}%) `
    }

    switch (settings.filter) {
      case 'grayscale':
        filterString += 'grayscale(100%) '
        break
      case 'sepia':
        filterString += 'sepia(100%) '
        break
      case 'blur':
        filterString += 'blur(1px) '
        break
    }

    finalCtx.filter = filterString || 'none'

    // Use the original image source
    const sourceCanvas = originalImage.canvas
    const sourceWidth = originalImage.width
    const sourceHeight = originalImage.height

    // Calculate the draw dimensions (applying user scale)
    const drawWidth = sourceWidth * userScale
    const drawHeight = sourceHeight * userScale

    // Draw the image centered
    finalCtx.drawImage(sourceCanvas, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
    finalCtx.restore()

    // Apply color mode filter - optimized using canvas filter
    if (colorMode === 'BW') {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = finalCanvas.width
      tempCanvas.height = finalCanvas.height
      const tempCtx = tempCanvas.getContext('2d')
      tempCtx.filter = 'grayscale(100%)'
      tempCtx.drawImage(finalCanvas, 0, 0)
      finalCtx.clearRect(0, 0, finalCanvas.width, finalCanvas.height)
      finalCtx.fillStyle = 'white'
      finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
      finalCtx.drawImage(tempCanvas, 0, 0)
    }

    // Save the final canvas as an image file
    finalCanvas.toBlob((blob) => {
      const editedFile = new File([blob], file.name, { type: 'image/png' })
      onSave(editedFile)
    }, 'image/png', 0.95)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-800/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-100 rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Loading Image Editor</h3>
          <p className="text-gray-600">Preparing your image for editing...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-gray-800/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Error Loading Image</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-all duration-200"
          >
            Close Editor
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-2 py-2 sm:px-4 sm:py-3 flex items-center justify-between flex-shrink-0 shadow-md">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold truncate">Edit Image</h2>
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
              onClick={onCancel}
              className="p-1.5 bg-white/15 hover:bg-white/25 rounded transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-gray-100 flex items-center justify-center relative overflow-hidden">
          <div
            ref={imageContainerRef}
            className="image-container relative w-full h-full flex items-center justify-center overflow-hidden"
            style={{ transform: `scale(${zoom})` }}
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
            {image && (
              <>
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-full object-contain"
                />

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

                  const canvasRect = canvas.getBoundingClientRect()
                  const container = canvas.closest('.image-container')
                  const containerRect = container.getBoundingClientRect()

                  // Divide by zoom to get base unzoomed DOM size
                  const canvasDOMWidth = canvasRect.width / zoom
                  const canvasDOMHeight = canvasRect.height / zoom

                  const canvasPixelWidth = canvas.width
                  const canvasPixelHeight = canvas.height

                  const pixelToDOMRatioX = canvasDOMWidth / canvasPixelWidth
                  const pixelToDOMRatioY = canvasDOMHeight / canvasPixelHeight

                  const domX = cropArea.x * pixelToDOMRatioX
                  const domY = cropArea.y * pixelToDOMRatioY
                  const domWidth = cropArea.width * pixelToDOMRatioX
                  const domHeight = cropArea.height * pixelToDOMRatioY

                  // Calculate canvas position relative to container (accounting for centering)
                  const canvasLeft = (containerRect.width / zoom - canvasDOMWidth) / 2
                  const canvasTop = (containerRect.height / zoom - canvasDOMHeight) / 2

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

        <div className="bg-gray-50 border-t border-gray-200 p-2 flex-shrink-0">
          <div className="flex gap-1 mb-2">
            {[
              { id: 'pagesize', label: 'Size', icon: Maximize2 },
              { id: 'crop', label: 'Crop', icon: Crop },
              { id: 'adjust', label: 'Adjust', icon: Sun },
              { id: 'transform', label: 'Rotate', icon: RotateCw }
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

          <div className="flex items-center gap-2 flex-wrap">
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

            {activeTab === 'crop' && (
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
              </>
            )}

            {activeTab === 'adjust' && (
              <>
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded p-2 shadow-sm">
                  <Sun className="w-3 h-3 text-yellow-500" />
                  <span className="text-xs font-medium min-w-[50px]">Bright</span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={settings.brightness}
                    onChange={(e) => setSettings(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                    className="w-24 sm:w-32 h-2"
                  />
                  <span className="text-xs text-gray-600 min-w-[30px] font-medium">{settings.brightness}</span>
                </div>

                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded p-2 shadow-sm">
                  <Contrast className="w-3 h-3 text-gray-600" />
                  <span className="text-xs font-medium min-w-[50px]">Contrast</span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={settings.contrast}
                    onChange={(e) => setSettings(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                    className="w-24 sm:w-32 h-2"
                  />
                  <span className="text-xs text-gray-600 min-w-[30px] font-medium">{settings.contrast}</span>
                </div>
              </>
            )}

            {activeTab === 'transform' && (
              <div className="flex flex-col gap-2.5 w-full">
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
                </div>

                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <span className="text-xs text-gray-600 font-medium min-w-[36px]">Scale</span>
                  <input
                    type="range"
                    min="10"
                    max="700"
                    step="5"
                    value={settings.scale}
                    onChange={(e) => setSettings(prev => ({ ...prev, scale: parseInt(e.target.value) }))}
                    className="flex-1 h-1.5"
                  />
                  <span className="text-xs text-gray-700 font-medium min-w-[42px] text-right">{settings.scale}%</span>
                </div>

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

          <div className="mt-3 pt-3 border-t border-gray-200">
            <button
              onClick={applyAllChanges}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors text-xs font-medium"
            >
              <Save className="w-3.5 h-3.5" />
              Save & Close
            </button>
          </div>
        </div>
      </div>
    )
}

export default ImageEditor
