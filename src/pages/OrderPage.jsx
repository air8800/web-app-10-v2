import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShopInfo, getShopPricing, calculateOrderCost, uploadFile, uploadFileChunked, submitPrintJob, formatCurrency, updatePaymentStatus, updatePrintJob } from '../utils/supabase'
import PDFPageSelector from '../components/PDFPageSelector'
import Dropdown from '../components/Dropdown'
import PDFPreview from '../components/PDFPreview'
import { PDFDocument } from 'pdf-lib'
import { CreditCard as Edit, FileText, Image as ImageIcon, Info, Clock, CircleDot, Maximize2, Home, ChevronRight, Copy, Layers, BookOpen, Square, Grid2x2, FlipHorizontal2, MoreHorizontal, Columns2, ArrowLeftRight } from 'lucide-react'
import { PAGE_SIZES, DEFAULT_PAGE_SIZE, getPageSize } from '../utils/pageSizes'
import { getTodayDayName, getTodayHours, isShopOpen } from '../utils/shop'
import { normalizePdfToA4 } from '../utils/pdf/normalizeToA4'

const PDFEditor = lazy(() => import('../components/PDFEditor'))
const ImageEditor = lazy(() => import('../components/ImageEditor'))

const OrderPage = () => {
  const { shopId } = useParams()
  const navigate = useNavigate()
  const [shop, setShop] = useState(null)
  const [pricing, setPricing] = useState([])
  const [availablePaperSizes, setAvailablePaperSizes] = useState(['A4'])
  const [previewPageSize, setPreviewPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [orderData, setOrderData] = useState({
    file: null,
    files: [], // For multiple images
    filename: '',
    selectedPages: [],
    selectedImages: [],
    copies: 1,
    paperSize: 'A4',
    colorMode: 'BW',
    printType: 'Single',
    pagesPerSheet: 1,
    customerName: '',
    customerEmail: '',
    customerPhone: ''
  })
  const [costInfo, setCostInfo] = useState({ cost: 0 })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editorType, setEditorType] = useState(null)
  const [initialEditPageIndex, setInitialEditPageIndex] = useState(0) // 'pdf' or 'image'
  const [isDirectPageEdit, setIsDirectPageEdit] = useState(false) // Track if editing specific page from preview

  // Add error boundary state
  const [editorError, setEditorError] = useState(null)

  // Shop info popup state
  const [showInfoPopup, setShowInfoPopup] = useState(false)

  // Image-to-PDF conversion state
  const [isConvertingToPDF, setIsConvertingToPDF] = useState(false)
  const [conversionProgress, setConversionProgress] = useState(0)
  const [conversionMessage, setConversionMessage] = useState('')

  // PDF normalization state
  const [isNormalizingPDF, setIsNormalizingPDF] = useState(false)
  const [normalizationProgress, setNormalizationProgress] = useState(0)
  const [normalizationMessage, setNormalizationMessage] = useState('')

  // Store edited pages from PDF Editor (with crop, etc.)
  const [editedPages, setEditedPages] = useState({})
  
  // Pre-generated PDF blob (ready to upload on submit)
  const [readyPDFBlob, setReadyPDFBlob] = useState(null)
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
  
  // Pre-uploaded file URL (uploaded in background for instant submit)
  const [preUploadedFileUrl, setPreUploadedFileUrl] = useState(null)
  const preUploadedFileUrlRef = useRef(null) // Ref for reliable polling
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [backgroundUploadProgress, setBackgroundUploadProgress] = useState(0)
  const [currentUploadRef, setCurrentUploadRef] = useState(null)
  
  // Submission popup state
  const [showSubmitPopup, setShowSubmitPopup] = useState(false)
  const [submitPopupMessage, setSubmitPopupMessage] = useState('')
  
  // Page selector collapse state
  const [isPageSelectorExpanded, setIsPageSelectorExpanded] = useState(false)

  useEffect(() => {
    loadShopData()
  }, [shopId])

  // Listen for PDF editor updates (crop, adjustments, etc.)
  useEffect(() => {
    const handlePDFEditorUpdate = (event) => {
      if (event.detail && event.detail.editedPages) {
        const editedPagesData = event.detail.editedPages
        console.log('📝 Received edited pages from PDFEditor:', Object.keys(editedPagesData).length, 'pages')
        
        // Log canvas availability
        Object.keys(editedPagesData).forEach(pageNum => {
          const hasCanvas = editedPagesData[pageNum].canvas ? '✅' : '❌'
          console.log(`  Page ${pageNum}: ${hasCanvas} canvas available`)
        })
        
        setEditedPages(prevEdited => ({
          ...prevEdited,
          ...editedPagesData
        }))
        
        // Pre-generate PDF in background when edits are saved
        regeneratePDFInBackground(editedPagesData)
      }
    }

    window.addEventListener('pdfEditorUpdate', handlePDFEditorUpdate)
    return () => {
      window.removeEventListener('pdfEditorUpdate', handlePDFEditorUpdate)
    }
  }, [orderData.files, orderData.selectedImages, previewPageSize, orderData.pagesPerSheet])

  useEffect(() => {
    if (pricing.length > 0) {
      calculateCost()
    }
  }, [orderData.copies, orderData.paperSize, orderData.colorMode, orderData.printType, pricing])

  const loadShopData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Load shop info and pricing in parallel
      const [shopResult, pricingResult] = await Promise.all([
        getShopInfo(shopId),
        getShopPricing(shopId)
      ])
      
      if (shopResult.error) {
        throw new Error('Failed to load shop: ' + shopResult.error.message)
      }
      
      if (!shopResult.data) {
        throw new Error('Shop not found or inactive')
      }
      
      setShop(shopResult.data)
      
      if (pricingResult.error) {
        console.warn('⚠️ Warning: Failed to load pricing:', pricingResult.error)
        // Continue anyway, we'll show a message to the user
      }
      
      if (pricingResult.data && pricingResult.data.length > 0) {
        setPricing(pricingResult.data)
        
        // Extract available paper sizes from pricing
        const sizes = [...new Set(pricingResult.data.map(config => config.paper_size))]
        if (sizes.length > 0) {
          setAvailablePaperSizes(sizes)
          setOrderData(prev => ({
            ...prev,
            paperSize: sizes[0] // Set first available size as default
          }))
        }
      } else {
        console.warn('⚠️ No pricing configurations found for this shop')
      }
      
    } catch (error) {
      console.error('❌ Error loading shop data:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const calculateCost = async () => {
    if (!orderData.paperSize || !orderData.colorMode || !orderData.printType) {
      return
    }
    
    const result = await calculateOrderCost(shopId, {
      paperSize: orderData.paperSize,
      colorMode: orderData.colorMode,
      printType: orderData.printType,
      copies: orderData.copies
    })
    
    setCostInfo(result)
  }

  // Auto-convert images to PDF with progress tracking
  const convertImagesToPDFWithProgress = async (imageFiles) => {
    try {
      setIsConvertingToPDF(true)
      setConversionProgress(0)
      
      const totalImages = imageFiles.length
      console.log(`📸 Converting ${totalImages} image(s) to PDF...`)
      
      // Create PDF document
      const pdfDoc = await PDFDocument.create()
      const pageDimensions = getPageSize(orderData.paperSize || 'A4')
      
      // Process images one by one with progress updates
      for (let i = 0; i < totalImages; i++) {
        const file = imageFiles[i]
        const imageNum = i + 1
        
        setConversionMessage(`Converting image ${imageNum} of ${totalImages}...`)
        
        // Load image to canvas for compression
        const img = await new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = reject
          const reader = new FileReader()
          reader.onload = (e) => { image.src = e.target.result }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        
        // Create canvas and compress to JPEG at 98% quality
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        
        // Compress to JPEG at 98% quality for high print quality
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.98)
        const imageBytes = await fetch(compressedDataUrl).then(res => res.arrayBuffer())
        
        // Create page and embed compressed image
        const page = pdfDoc.addPage([pageDimensions.width, pageDimensions.height])
        const embeddedImage = await pdfDoc.embedJpg(imageBytes)
        
        const imgDims = embeddedImage.scale(1)
        const scale = Math.min(
          pageDimensions.width / imgDims.width,
          pageDimensions.height / imgDims.height
        ) * 0.95
        
        const scaledWidth = imgDims.width * scale
        const scaledHeight = imgDims.height * scale
        
        page.drawImage(embeddedImage, {
          x: (pageDimensions.width - scaledWidth) / 2,
          y: (pageDimensions.height - scaledHeight) / 2,
          width: scaledWidth,
          height: scaledHeight
        })
        
        // Update progress
        const progress = Math.round(((imageNum) / totalImages) * 100)
        setConversionProgress(progress)
        
        // Small delay to ensure UI updates
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      // Save PDF
      setConversionMessage('Finalizing PDF...')
      const pdfBytes = await pdfDoc.save()
      const pdfFile = new File(
        [pdfBytes], 
        totalImages === 1 ? imageFiles[0].name.replace(/\.[^.]+$/, '.pdf') : `${totalImages}_images.pdf`,
        { type: 'application/pdf' }
      )
      
      // Calculate original vs compressed sizes
      const originalSize = imageFiles.reduce((sum, file) => sum + file.size, 0)
      const compressedSize = pdfFile.size
      const savings = ((originalSize - compressedSize) / originalSize * 100).toFixed(1)
      
      console.log('✅ Images converted to PDF successfully')
      console.log(`📊 Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`)
      console.log(`📊 Compressed PDF size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`)
      console.log(`💾 File size reduced by ${savings}% (saved ${((originalSize - compressedSize) / 1024 / 1024).toFixed(2)} MB)`)
      setConversionMessage('Conversion complete!')
      
      // Brief delay to show completion
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Return both the file and the page count from pdf-lib
      return { pdfFile, pageCount: pdfDoc.getPageCount() }
      
    } catch (error) {
      console.error('❌ Error converting images to PDF:', error)
      throw new Error('Failed to convert images to PDF: ' + error.message)
    } finally {
      setIsConvertingToPDF(false)
      setConversionProgress(0)
      setConversionMessage('')
    }
  }

  const handleFileChange = async (filesOrFile) => {
    if (!filesOrFile) return

    // Handle both single file and multiple files
    const fileList = filesOrFile.length ? Array.from(filesOrFile) : [filesOrFile]
    const firstFile = fileList[0]

    console.log('📁 Files selected:', fileList.length, 'files')
    console.log('📄 First file type:', firstFile.type, 'Name:', firstFile.name)

    // Clear any pre-generated PDF and pre-uploaded URL from previous upload
    setReadyPDFBlob(null)
    setPreUploadedFileUrl(null)
    preUploadedFileUrlRef.current = null
    setEditedPages({})
    setUploadProgress(0)
    
    // Check if it's PDF or images
    console.log('🔍 Checking file type... isPDF?', firstFile.type === 'application/pdf')
    if (firstFile.type === 'application/pdf') {
      // Single PDF file - normalize to A4 with smart orientation
      try {
        console.log('📄 Normalizing PDF to A4 with smart orientation...')
        
        const normalizeResult = await normalizePdfToA4(firstFile, {
          skipIfA4: true,
          onProgress: (progress, message) => {
            setIsNormalizingPDF(true)
            setNormalizationProgress(progress)
            setNormalizationMessage(message)
          }
        })

        const finalPdfFile = normalizeResult.normalizedFile

        if (normalizeResult.wasNormalized) {
          console.log(`✅ PDF normalized: ${normalizeResult.pageCount} pages`)
          console.log(`📐 Orientations: ${normalizeResult.orientations.join(', ')}`)
          console.log(`📄 Normalized file size: ${(finalPdfFile.size / 1024 / 1024).toFixed(2)} MB`)
        } else {
          console.log('ℹ️ PDF already A4-sized, skipped normalization')
        }

        console.log(`🔄 Setting orderData.file to normalized PDF (${finalPdfFile.name}, ${(finalPdfFile.size / 1024 / 1024).toFixed(2)} MB)`)

        setOrderData(prev => ({
          ...prev,
          file: finalPdfFile,
          files: [],
          filename: firstFile.name,
          selectedPages: [],
          selectedImages: []
        }))
        setShowEditor(false)
        
        // Pre-generate PDF immediately for instant submit
        console.log('🚀 Pre-generating PDF for instant submission...')
        generateInitialPDF(finalPdfFile, [])

        // Clear normalization state
        setIsNormalizingPDF(false)
        setNormalizationProgress(0)
        setNormalizationMessage('')
        
      } catch (error) {
        console.error('❌ Error normalizing PDF:', error)
        alert('Failed to normalize PDF: ' + (error?.message || 'Unknown error'))
        setIsNormalizingPDF(false)
        setNormalizationProgress(0)
        setNormalizationMessage('')
      }
    } else if (firstFile.type.startsWith('image/')) {
      // Images - auto-convert to PDF
      try {
        const allImages = fileList.filter(f => f.type.startsWith('image/'))
        console.log(`🖼️ Auto-converting ${allImages.length} image(s) to PDF...`)
        
        // Convert images to PDF with progress tracking
        const { pdfFile, pageCount } = await convertImagesToPDFWithProgress(allImages)
        
        // Auto-select all pages - no need for page selector delay!
        const allPages = Array.from({ length: pageCount }, (_, i) => i + 1)
        
        // Set the converted PDF as the file with ALL pages pre-selected
        setOrderData(prev => ({
          ...prev,
          file: pdfFile,
          files: [],
          filename: pdfFile.name,
          selectedPages: allPages, // Auto-select all pages - no need for page selector!
          selectedImages: []
        }))
        
        setShowEditor(false)
        
        // Show success message
        console.log(`✅ Images automatically converted to PDF (${pageCount} pages, all selected)`)
        
        // Pre-generate PDF immediately after conversion (for instant submit)
        console.log('🚀 Pre-generating PDF for instant submission...')
        generateInitialPDF(pdfFile, allPages)
        
      } catch (error) {
        console.error('❌ Error converting images:', error)
        console.error('Error details:', error?.message, error?.stack)
        const errorMsg = error?.message || 'Unknown error occurred'
        alert('Failed to convert images to PDF: ' + errorMsg)
        // Reset state
        setIsConvertingToPDF(false)
        setConversionProgress(0)
        setConversionMessage('')
      }
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files)
    }
  }

  const handleImagesSelected = (imageNumbers) => {
    setOrderData(prev => ({
      ...prev,
      selectedImages: imageNumbers
    }))
  }

  const handlePagesSelected = (pages) => {
    setOrderData(prev => ({
      ...prev,
      selectedPages: pages
    }))
  }

  const handleEditFile = (pageIndex) => {
    if (!orderData.file) return

    try {
      setEditorError(null)
      
      // Determine if this is direct page edit (from preview) or full grid edit
      const isDirectEdit = pageIndex !== undefined && pageIndex >= 0
      setIsDirectPageEdit(isDirectEdit)
      
      // When N-up mode is active (2 pages per sheet), convert page index to sheet index
      let editorPageIndex = pageIndex !== undefined ? pageIndex : 0
      if (orderData.pagesPerSheet === 2) {
        // Page 0,1 -> Sheet 0 (pages 1-2)
        // Page 2,3 -> Sheet 1 (pages 3-4)
        editorPageIndex = Math.floor(editorPageIndex / 2)
        console.log(`🔄 N-up mode: Converting page ${pageIndex} to sheet ${editorPageIndex}`)
      }
      
      setInitialEditPageIndex(editorPageIndex)

      if (orderData.file.type === 'application/pdf') {
        setEditorType('pdf')
      } else if (orderData.file.type.startsWith('image/')) {
        setEditorType('image')
      }
      setShowEditor(true)
    } catch (error) {
      console.error('❌ Error opening editor:', error)
      setEditorError('Failed to open editor: ' + error.message)
    }
  }

  const handleSaveEdits = (editedFileOrFiles) => {
    try {
      // Handle both single file and array of files
      if (Array.isArray(editedFileOrFiles)) {
        // Multiple images edited
        setOrderData(prev => ({
          ...prev,
          files: editedFileOrFiles,
          filename: `${editedFileOrFiles.length} images`,
          selectedImages: Array.from({ length: editedFileOrFiles.length }, (_, i) => i + 1)
        }))
      } else {
        // Single file edited
        setOrderData(prev => ({
          ...prev,
          file: editedFileOrFiles,
          filename: editedFileOrFiles.name,
          selectedPages: []
        }))
      }
      setShowEditor(false)
      setEditorType(null)
      setEditorError(null)
      setIsDirectPageEdit(false) // Reset direct page edit flag
    } catch (error) {
      console.error('❌ Error saving edits:', error)
      setEditorError('Failed to save edits: ' + error.message)
    }
  }

  const handleCancelEdit = () => {
    setShowEditor(false)
    setEditorType(null)
    setEditorError(null)
    setIsDirectPageEdit(false) // Reset direct page edit flag
  }

  const processSelectedPages = async (originalFile, selectedPages) => {
    try {
      if (!selectedPages || selectedPages.length === 0) {
        throw new Error('No pages selected')
      }

      // If all pages are selected, return original file
      const arrayBuffer = await originalFile.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)
      const totalPages = pdfDoc.getPageCount()
      
      if (selectedPages.length === totalPages && 
          selectedPages.every((page, index) => page === index + 1)) {
        console.log('✅ All pages selected, using original file')
        return originalFile
      }

      console.log(`📄 Processing ${selectedPages.length} selected pages from ${totalPages} total pages`)
      
      // Remove unselected pages (in reverse order to maintain indices)
      const pagesToRemove = []
      for (let i = 1; i <= totalPages; i++) {
        if (!selectedPages.includes(i)) {
          pagesToRemove.push(i - 1) // Convert to 0-based index
        }
      }
      
      // Remove pages in reverse order
      pagesToRemove.reverse().forEach(pageIndex => {
        pdfDoc.removePage(pageIndex)
      })
      
      const modifiedPdfBytes = await pdfDoc.save()
      const modifiedFile = new File([modifiedPdfBytes], originalFile.name, {
        type: 'application/pdf'
      })
      
      console.log('✅ PDF processed successfully')
      return modifiedFile
      
    } catch (error) {
      console.error('❌ Error processing PDF pages:', error)
      throw new Error('Failed to process selected pages: ' + error.message)
    }
  }

  // Background PDF regeneration when edits are saved
  // Generate initial PDF right after upload (even without edits) AND upload it
  const generateInitialPDF = async (file, selectedPages = []) => {
    const startTime = performance.now()
    console.log('🚀 [TIMING] Starting PDF preparation and background upload...')
    setIsGeneratingPDF(true)
    
    try {
      // For PDFs, just use the original file
      if (file && file.type === 'application/pdf') {
        setReadyPDFBlob(file)
        console.log(`⏱️ [TIMING] PDF prepared in ${((performance.now() - startTime) / 1000).toFixed(3)}s`)
        console.log('✅ Original PDF ready - starting background upload...')
        
        // Upload immediately in background
        uploadInBackground(file)
      }
    } catch (error) {
      console.error('❌ Error preparing PDF:', error)
    } finally {
      setIsGeneratingPDF(false)
    }
  }
  
  // Upload file in background immediately after PDF is ready
  const uploadInBackground = async (file) => {
    const uploadStartTime = performance.now()
    console.log('📤 [TIMING] Starting background upload with CHUNKED protocol...')
    console.log(`📊 File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`)
    setIsUploading(true)
    setUploadProgress(0)
    setBackgroundUploadProgress(0)
    
    try {
      setSubmitPopupMessage('Uploading in background...')
      
      let uploadRef = null
      const uploadResult = await uploadFileChunked(
        file, 
        shopId, 
        (bytesUploaded, bytesTotal, percentage) => {
          const progress = parseFloat(percentage)
          setUploadProgress(progress)
          setBackgroundUploadProgress(progress)
          setSubmitPopupMessage(`Uploading... ${percentage}%`)
        },
        (upload) => {
          uploadRef = upload
          setCurrentUploadRef(upload)
        }
      )
      
      if (uploadResult.error) {
        console.error('❌ Background upload failed:', uploadResult.error)
        setPreUploadedFileUrl(null)
        preUploadedFileUrlRef.current = null
        setCurrentUploadRef(null)
        return
      }
      
      const uploadTime = ((performance.now() - uploadStartTime) / 1000).toFixed(2)
      console.log(`⏱️ [TIMING] Background upload completed in ${uploadTime}s`)
      console.log('✅ File pre-uploaded! Submit will be instant!')
      console.log('📎 Pre-uploaded URL:', uploadResult.data.publicUrl)
      
      const publicUrl = uploadResult.data.publicUrl
      setPreUploadedFileUrl(publicUrl)
      preUploadedFileUrlRef.current = publicUrl // Also set ref for polling
      setUploadProgress(100)
      setBackgroundUploadProgress(100)
      setSubmitPopupMessage('✅ Ready to submit!')
      setCurrentUploadRef(null)
    } catch (error) {
      if (error.message && error.message.includes('aborted')) {
        console.log('⏸️ Background upload was aborted (user submitted)')
      } else {
        console.error('❌ Background upload error:', error)
      }
      setSubmitPopupMessage('')
      setCurrentUploadRef(null)
    } finally {
      setIsUploading(false)
    }
  }

  const regeneratePDFInBackground = async (editedPagesData) => {
    console.log('🔄 Pre-generating PDF in background...')
    setIsGeneratingPDF(true)
    
    // Clear stale pre-uploaded URL since we're creating a new PDF
    setPreUploadedFileUrl(null)
    preUploadedFileUrlRef.current = null
    
    try {
      let pdfBlob = null
      
      // Handle different file types
      if (orderData.files && orderData.files.length > 0 && orderData.selectedImages.length > 0) {
        // Multiple images case
        pdfBlob = await createPDFFromImages(
          orderData.files, 
          orderData.selectedImages, 
          previewPageSize, 
          orderData.pagesPerSheet,
          editedPagesData
        )
      } else if (orderData.file && orderData.file.type === 'application/pdf') {
        // PDF with edits case - generate final PDF with edits applied
        pdfBlob = await generateEditedPDF(orderData.file, orderData.selectedPages, editedPagesData)
      }
      
      if (pdfBlob) {
        setReadyPDFBlob(pdfBlob)
        console.log('✅ PDF with edits pre-generated successfully!')
        // Upload the new edited PDF immediately
        console.log('📤 Uploading edited PDF in background...')
        uploadInBackground(pdfBlob)
      }
    } catch (error) {
      console.error('❌ Error pre-generating PDF:', error)
      // Don't show error to user - we'll regenerate on submit if needed
    } finally {
      setIsGeneratingPDF(false)
    }
  }
  
  // Generate final PDF with edits applied
  const generateEditedPDF = async (pdfFile, selectedPages, editedPagesData) => {
    try {
      console.log('📄 Generating PDF with edits...', {
        hasEdits: Object.keys(editedPagesData).length,
        selectedPages: selectedPages.length
      })
      
      // If no edits, return null (will use original file)
      if (Object.keys(editedPagesData).length === 0) {
        return null
      }
      
      // Load the PDF
      const arrayBuffer = await pdfFile.arrayBuffer()
      const pdfDoc = await PDFDocument.load(arrayBuffer)
      
      // Create new PDF with edited pages
      const newPdfDoc = await PDFDocument.create()
      const totalPages = pdfDoc.getPageCount()
      
      // If no pages selected, use all pages
      const pagesToInclude = selectedPages.length > 0 ? selectedPages : Array.from({ length: totalPages }, (_, i) => i + 1)
      
      for (const pageNum of pagesToInclude) {
        const pageIndex = pageNum - 1
        const editedPage = editedPagesData[pageNum]
        
        if (editedPage && editedPage.canvas) {
          // Use edited canvas - Optimized JPEG quality (85% is excellent for print, much faster than 98%)
          const dataUrl = editedPage.canvas.toDataURL('image/jpeg', 0.85)
          const imageBytes = await fetch(dataUrl).then(res => res.arrayBuffer())
          const embeddedImage = await newPdfDoc.embedJpg(imageBytes)
          
          const originalPage = pdfDoc.getPage(pageIndex)
          const { width, height } = originalPage.getSize()
          const page = newPdfDoc.addPage([width, height])
          
          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width,
            height
          })
        } else {
          // Copy original page
          const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [pageIndex])
          newPdfDoc.addPage(copiedPage)
        }
      }
      
      const pdfBytes = await newPdfDoc.save()
      const pdfBlob = new File([pdfBytes], pdfFile.name, { type: 'application/pdf' })
      
      console.log('✅ PDF with edits generated successfully')
      return pdfBlob
      
    } catch (error) {
      console.error('❌ Error generating edited PDF:', error)
      throw error
    }
  }

  const createPDFFromImages = async (imageFiles, selectedImageIndices, pageSize, pagesPerSheet, editedPagesOverride = null) => {
    try {
      console.log('📄 Creating PDF from images...', {
        totalImages: imageFiles.length,
        selectedCount: selectedImageIndices.length,
        pageSize,
        pagesPerSheet,
        hasEditedPages: Object.keys(editedPages).length > 0
      })

      const pdfDoc = await PDFDocument.create()
      const pageDimensions = getPageSize(pageSize)

      // Filter selected images
      const selectedFiles = selectedImageIndices
        .map(index => imageFiles[index - 1])
        .filter(file => file != null)

      console.log('📄 Processing', selectedFiles.length, 'selected images')

      // Handle mix of edited and unedited pages
      const pagesToUse = editedPagesOverride || editedPages
      const hasEdits = Object.keys(pagesToUse).length > 0
      let loadedImages = []

      if (hasEdits) {
        // Mix of edited and unedited pages - handle each individually
        console.log('✂️ Using mix of edited and original canvases')
        const imagePromises = selectedImageIndices.map((pageNum, idx) => {
          const editedPage = pagesToUse[pageNum]
          if (editedPage && editedPage.canvas) {
            // Use edited canvas - Optimized JPEG quality (85% is excellent for print, much faster than 98%)
            return Promise.resolve({
              dataUrl: editedPage.canvas.toDataURL('image/jpeg', 0.85),
              isEdited: true
            })
          } else {
            // Use original file
            const file = selectedFiles[idx]
            if (!file) {
              console.warn(`⚠️ No file found for page ${pageNum}`)
              return Promise.resolve(null)
            }
            return new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = (e) => resolve({ file, dataUrl: e.target.result, isEdited: false })
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
          }
        })
        loadedImages = (await Promise.all(imagePromises)).filter(img => img !== null)
      } else {
        // No edits - load original image files
        console.log('📄 Using original image files (no edits)')
        const imagePromises = selectedFiles.map(file => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (e) => resolve({ file, dataUrl: e.target.result, isEdited: false })
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        })
        loadedImages = await Promise.all(imagePromises)
      }

      // Embed images based on N-up setting
      if (pagesPerSheet === 2) {
        // 2-up layout: 2 images side by side per page
        for (let i = 0; i < loadedImages.length; i += 2) {
          const page = pdfDoc.addPage([pageDimensions.width, pageDimensions.height])

          const halfWidth = pageDimensions.width / 2
          const positions = [
            { x: 0, width: halfWidth }, // Left
            { x: halfWidth, width: halfWidth } // Right
          ]

          for (let j = 0; j < 2 && (i + j) < loadedImages.length; j++) {
            const { dataUrl } = loadedImages[i + j]
            const imageBytes = await fetch(dataUrl).then(res => res.arrayBuffer())

            // Always use JPEG for smaller file size
            let embeddedImage
            if (dataUrl.startsWith('data:image/jpeg')) {
              embeddedImage = await pdfDoc.embedJpg(imageBytes)
            } else if (dataUrl.startsWith('data:image/png')) {
              embeddedImage = await pdfDoc.embedPng(imageBytes)
            } else {
              embeddedImage = await pdfDoc.embedJpg(imageBytes)
            }

            const imgDims = embeddedImage.scale(1)
            const scale = Math.min(
              positions[j].width / imgDims.width,
              pageDimensions.height / imgDims.height
            ) * 0.95

            const scaledWidth = imgDims.width * scale
            const scaledHeight = imgDims.height * scale

            page.drawImage(embeddedImage, {
              x: positions[j].x + (positions[j].width - scaledWidth) / 2,
              y: (pageDimensions.height - scaledHeight) / 2,
              width: scaledWidth,
              height: scaledHeight
            })
          }
        }
      } else {
        // 1-up layout: 1 image per page
        for (const { dataUrl } of loadedImages) {
          const page = pdfDoc.addPage([pageDimensions.width, pageDimensions.height])

          const imageBytes = await fetch(dataUrl).then(res => res.arrayBuffer())

          let embeddedImage
          if (dataUrl.startsWith('data:image/png')) {
            embeddedImage = await pdfDoc.embedPng(imageBytes)
          } else {
            embeddedImage = await pdfDoc.embedJpg(imageBytes)
          }

          const imgDims = embeddedImage.scale(1)
          const scale = Math.min(
            pageDimensions.width / imgDims.width,
            pageDimensions.height / imgDims.height
          ) * 0.95

          const scaledWidth = imgDims.width * scale
          const scaledHeight = imgDims.height * scale

          page.drawImage(embeddedImage, {
            x: (pageDimensions.width - scaledWidth) / 2,
            y: (pageDimensions.height - scaledHeight) / 2,
            width: scaledWidth,
            height: scaledHeight
          })
        }
      }

      const pdfBytes = await pdfDoc.save()
      const pdfFile = new File([pdfBytes], 'images.pdf', { type: 'application/pdf' })

      console.log('✅ PDF created successfully from images')
      return pdfFile

    } catch (error) {
      console.error('❌ Error creating PDF from images:', error)
      throw new Error('Failed to create PDF from images: ' + error.message)
    }
  }

  const handleSubmitOrder = async () => {
    if (!orderData.customerName) {
      alert('Please enter customer name')
      return
    }

    // Validate file uploads
    if (orderData.file) {
      // Check if PDF has pages selected
      if (orderData.file.type === 'application/pdf' && orderData.selectedPages.length === 0) {
        alert('Please select at least one page to print')
        return
      }
    } else if (orderData.files && orderData.files.length > 0) {
      // Check if images are selected
      if (orderData.selectedImages.length === 0) {
        alert('Please select at least one image to print')
        return
      }
    } else {
      alert('Please upload a file')
      return
    }

    // Show popup immediately
    setShowSubmitPopup(true)
    setSubmitPopupMessage('Preparing your order...')
    setIsSubmitting(true)
    const submitStartTime = performance.now()
    const popupStartTime = performance.now()
    console.log('🚀 [TIMING] === ORDER SUBMISSION STARTED ===')

    try {
      let fileUrl = null
      
      // ⚡ INSTANT SUBMIT: Check if we already uploaded the file in background
      if (preUploadedFileUrl) {
        console.log('⚡⚡⚡ [TIMING] INSTANT SUBMIT! Using pre-uploaded file URL')
        console.log('📎 Pre-uploaded URL:', preUploadedFileUrl)
        fileUrl = preUploadedFileUrl
        setSubmitPopupMessage('Finalizing order...')
      } else if (currentUploadRef && isUploading) {
        // Background upload is still running - continue from its progress
        console.log(`📤 [TIMING] Background upload in progress at ${backgroundUploadProgress}%... continuing`)
        setSubmitPopupMessage(`Uploading... ${Math.round(backgroundUploadProgress)}%`)
        
        // Wait for background upload to complete using ref for reliable polling
        try {
          const backgroundResult = await new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
              // Check ref instead of state for reliable polling
              if (preUploadedFileUrlRef.current) {
                console.log('✅ Background upload completed while waiting!')
                clearInterval(checkInterval)
                resolve(preUploadedFileUrlRef.current)
              }
            }, 100)
            
            // Timeout after 120 seconds
            setTimeout(() => {
              clearInterval(checkInterval)
              reject(new Error('Background upload timeout'))
            }, 120000)
          })
          
          fileUrl = backgroundResult
          setSubmitPopupMessage('Finalizing order...')
        } catch (error) {
          console.log('⚠️ Background upload did not complete in time, starting new upload...')
          // Cancel background and start fresh
          if (currentUploadRef) {
            currentUploadRef.abort()
            setCurrentUploadRef(null)
          }
          // Continue to fallback upload below
        }
      }
      
      if (!fileUrl) {
        // Fallback: Upload now if not pre-uploaded
        console.log('⚠️ [TIMING] File not pre-uploaded, uploading now...')
        
        // Start visual progress from where background left off
        const startProgress = backgroundUploadProgress > 0 ? backgroundUploadProgress : 0
        console.log(`📊 Starting visual progress from ${startProgress}%`)
        
        let fileToUpload = null
        const hasEdits = Object.keys(editedPages).length > 0

        // Handle different file types
        const fileSelectionStart = performance.now()
        if (orderData.file) {
          // Check if we have pre-generated PDF with edits
          if (hasEdits && readyPDFBlob) {
            console.log('⚡ Using pre-generated PDF with edits')
            fileToUpload = readyPDFBlob
          } else if (readyPDFBlob) {
            console.log('⚡ Using pre-generated PDF')
            fileToUpload = readyPDFBlob
          } else {
            // Use original file
            fileToUpload = orderData.file
            console.log('📤 Using original file')
          }
        } else if (orderData.files && orderData.files.length > 0) {
          // Multiple images - use pre-generated PDF if available
          if (readyPDFBlob) {
            console.log('⚡ Using pre-generated PDF')
            fileToUpload = readyPDFBlob
          } else {
            setSubmitPopupMessage('Creating PDF from images...')
            console.log('📤 Combining images into PDF...')
            const pdfGenStart = performance.now()
            fileToUpload = await createPDFFromImages(orderData.files, orderData.selectedImages, previewPageSize, orderData.pagesPerSheet)
            console.log(`⏱️ [TIMING] PDF generation took: ${((performance.now() - pdfGenStart) / 1000).toFixed(2)}s`)
          }
        } else {
          throw new Error('No file to upload')
        }
        console.log(`⏱️ [TIMING] File selection took: ${((performance.now() - fileSelectionStart) / 1000).toFixed(2)}s`)
        console.log(`📊 File size to upload: ${(fileToUpload.size / 1024 / 1024).toFixed(2)} MB`)

        // Upload the file with chunked upload - continue from background progress
        setSubmitPopupMessage(`Uploading... ${Math.round(startProgress)}%`)
        const uploadStart = performance.now()
        
        const quickFileResult = await uploadFileChunked(fileToUpload, shopId, (bytesUploaded, bytesTotal, percentage) => {
          // Show smooth continuation from background progress
          const actualProgress = parseFloat(percentage)
          const visualProgress = Math.max(actualProgress, startProgress)
          setUploadProgress(visualProgress)
          setSubmitPopupMessage(`Uploading... ${Math.round(visualProgress)}%`)
        })
        
        console.log(`⏱️ [TIMING] Upload took: ${((performance.now() - uploadStart) / 1000).toFixed(2)}s`)
        if (quickFileResult.error) throw new Error('File upload failed: ' + quickFileResult.error.message)
        
        fileUrl = quickFileResult.data.publicUrl
      }

      // Create job record with the uploaded file URL
      setSubmitPopupMessage('Finalizing order...')
      const dbStart = performance.now()
      const jobData = {
        shop_id: shopId,
        filename: orderData.filename,
        file_url: fileUrl,
        copies: orderData.copies,
        paper_size: orderData.paperSize,
        color_mode: orderData.colorMode,
        print_type: orderData.printType,
        pages_per_sheet: orderData.pagesPerSheet,
        customer_name: orderData.customerName,
        customer_email: orderData.customerEmail || null,
        customer_phone: orderData.customerPhone || null,
        total_cost: costInfo.cost
      }

      const jobResult = await submitPrintJob(jobData)
      console.log(`⏱️ [TIMING] Database job creation took: ${((performance.now() - dbStart) / 1000).toFixed(3)}s`)
      if (jobResult.error) throw new Error('Failed to submit order: ' + jobResult.error.message)

      const jobId = jobResult.data.id

      const totalTime = ((performance.now() - submitStartTime) / 1000).toFixed(2)
      console.log(`⏱️ [TIMING] === TOTAL SUBMISSION TIME: ${totalTime}s ===`)
      console.log(`✅ Order submitted successfully in ${totalTime}s`)

      // Ensure popup shows for at least 1.5 seconds for visual feedback
      const popupElapsed = performance.now() - popupStartTime
      const minPopupTime = 1500
      if (popupElapsed < minPopupTime) {
        setSubmitPopupMessage('Order submitted! ✓')
        await new Promise(resolve => setTimeout(resolve, minPopupTime - popupElapsed))
      }

      // Navigate to status page
      navigate(`/status/${jobId}`)

      // BACKGROUND: Process PDF pages if needed (after navigation)
      if (orderData.file?.type === 'application/pdf' && orderData.selectedPages.length > 0 && orderData.selectedPages.length < orderData.file.size) {
        console.log('📄 Background: Processing PDF with selected pages...')
        ;(async () => {
          try {
            const processedFile = await processSelectedPages(orderData.file, orderData.selectedPages)
            const processedResult = await uploadFileChunked(processedFile, shopId)

            if (processedResult.error) {
              console.error('❌ Background processing failed:', processedResult.error)
              return
            }

            // Update with processed file
            await updatePrintJob(jobId, { file_url: processedResult.data.publicUrl })
            console.log('✅ Background processing completed - Updated with processed PDF')
          } catch (bgError) {
            console.error('❌ Background processing error:', bgError)
          }
        })()
      }

      // Mark payment as paid (fast, no blocking)
      await updatePaymentStatus(jobId, 'paid')

    } catch (error) {
      console.error('❌ Error submitting order:', error)
      alert('Failed to submit order: ' + error.message)
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading shop information...</p>
          <p className="text-sm text-gray-500 mt-2">Fetching pricing data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Shop</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadShopData}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!shop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Shop Not Found</h1>
          <p className="text-gray-600">The shop you're looking for doesn't exist or is not active.</p>
        </div>
      </div>
    )
  }

  // Error boundary for editor
  if (editorError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center py-20">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Editor Error</h3>
              <p className="text-gray-600 mb-8">{editorError}</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setEditorError(null)}
                  className="btn-primary"
                >
                  Try Again
                </button>
                <button
                  onClick={() => navigate(`/shop/${shopId}`)}
                  className="btn-secondary"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show editor if requested
  if (showEditor && editorType && orderData.file) {
    if (editorType === 'pdf') {
      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-4 sm:mb-6">
              <h1 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">PDF Editor</h1>
              <p className="text-sm sm:text-base text-gray-600">Edit before printing</p>
            </div>
            <Suspense fallback={<div></div>}>
              <PDFEditor
                file={orderData.file}
                initialPageIndex={initialEditPageIndex}
                onSave={handleSaveEdits}
                onCancel={handleCancelEdit}
                directPageEdit={isDirectPageEdit}
                pageSize={previewPageSize}
                onPageSizeChange={setPreviewPageSize}
                colorMode={orderData.colorMode}
                pagesPerSheet={orderData.pagesPerSheet}
              />
            </Suspense>
          </div>
        </div>
      )
    } else if (editorType === 'image') {
      return (
        <Suspense fallback={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading Image Editor...</p>
            </div>
          </div>
        }>
          <ImageEditor
            file={orderData.file}
            onSave={handleSaveEdits}
            onCancel={handleCancelEdit}
            pageSize={previewPageSize}
            onPageSizeChange={setPreviewPageSize}
            colorMode={orderData.colorMode}
            pagesPerSheet={orderData.pagesPerSheet}
          />
        </Suspense>
      )
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-4 sm:mb-6">
          <nav className="flex items-center gap-2 text-sm text-gray-600">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1 hover:text-blue-600 transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-400">Place Order</span>
          </nav>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold mb-1">{shop.name}</h1>
              <p className="text-sm sm:text-base text-gray-600">{shop.address}</p>
            </div>
            <button
              onClick={() => setShowInfoPopup(true)}
              className="flex-shrink-0 p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
              title="Shop Information"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>

          {/* Today's Hours and Status */}
          {shop.operating_hours && (
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-gray-500" />
                <span className="text-gray-700 font-medium">
                  {getTodayHours(shop.operating_hours)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CircleDot className={`w-4 h-4 ${isShopOpen(shop.operating_hours) ? 'text-green-500' : 'text-red-500'}`} />
                <span className={`text-sm font-medium ${
                  isShopOpen(shop.operating_hours) ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isShopOpen(shop.operating_hours) ? 'Open Now' : 'Closed'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Shop Info Popup */}
        {showInfoPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowInfoPopup(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Shop Information</h2>
                <button
                  onClick={() => setShowInfoPopup(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Contact Info */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Contact</h3>
                  <p className="text-sm text-gray-600 mb-1">{shop.address}</p>
                  <p className="text-sm text-blue-600">{shop.phone}</p>
                  {shop.email && <p className="text-sm text-gray-600">{shop.email}</p>}
                </div>

                {/* Services */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Our Services</h3>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mr-2"></div>
                      <span className="text-sm">Document Printing (PDF, Word, Images)</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mr-2"></div>
                      <span className="text-sm">Black & White and Color Printing</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mr-2"></div>
                      <span className="text-sm">Single and Double Sided Printing</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mr-2"></div>
                      <span className="text-sm">Multiple Paper Sizes (A3, A4, Letter)</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mr-2"></div>
                      <span className="text-sm">Bulk Printing Discounts</span>
                    </div>
                  </div>
                </div>

                {/* Operating Hours */}
                {shop.operating_hours && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Hours</h3>
                    <div className="space-y-1">
                      {Object.entries(shop.operating_hours).map(([day, hours]) => (
                        <div key={day} className="flex justify-between text-sm">
                          <span className="capitalize font-medium text-gray-700">{day}</span>
                          <span className="text-gray-600">{hours}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* File Upload */}
          <div>
            <label className="block text-xs sm:text-sm font-medium mb-2">Upload Document</label>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {isConvertingToPDF || isNormalizingPDF ? (
                <div className="py-8">
                  <div className="max-w-md mx-auto space-y-4">
                    {/* Conversion/Normalization Animation */}
                    <div className="flex items-center justify-center mb-4">
                      <div className="relative">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                          {isConvertingToPDF ? (
                            <ImageIcon className="w-8 h-8 text-blue-600 animate-pulse" />
                          ) : (
                            <FileText className="w-8 h-8 text-blue-600 animate-pulse" />
                          )}
                        </div>
                        <div className="absolute -right-2 -bottom-2 w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center animate-bounce">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress Message */}
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {isConvertingToPDF ? 'Converting to PDF...' : 'Normalizing PDF to A4...'}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {isConvertingToPDF ? conversionMessage : normalizationMessage}
                      </p>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-blue-600">Progress</span>
                        <span className="text-xs font-bold text-blue-700">
                          {isConvertingToPDF ? conversionProgress : normalizationProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-1"
                          style={{ width: `${isConvertingToPDF ? conversionProgress : normalizationProgress}%` }}
                        >
                          {(isConvertingToPDF ? conversionProgress : normalizationProgress) > 10 && (
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-500 text-center">
                      {isConvertingToPDF 
                        ? 'Please wait while we prepare your images...'
                        : 'Optimizing pages with smart orientation detection...'
                      }
                    </p>
                  </div>
                </div>
              ) : orderData.file || orderData.files.length > 0 ? (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      {orderData.file?.type === 'application/pdf' ? (
                        <FileText className="w-6 h-6 text-green-600" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-green-600 font-medium">{orderData.filename}</p>
                      <p className="text-sm text-gray-500">
                        {orderData.file?.type === 'application/pdf' ? 'PDF Document' :
                         orderData.files.length > 1 ? `${orderData.files.length} Images` : 'Image File'} •
                        {orderData.file ? (orderData.file.size / 1024 / 1024).toFixed(2) :
                         (orderData.files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={handleEditFile}
                      className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs sm:text-sm hover:bg-blue-700 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Edit {orderData.file?.type === 'application/pdf' ? 'PDF' : orderData.files.length > 1 ? 'Images' : 'Image'}
                    </button>
                    <button
                      onClick={() => setOrderData(prev => ({ ...prev, file: null, files: [], filename: '', selectedPages: [], selectedImages: [] }))}
                      className="text-red-600 text-xs sm:text-sm hover:underline px-4 py-2"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm sm:text-base text-gray-600 mb-2">Drag and drop or</p>
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(e.target.files)}
                    accept=".pdf,.doc,.docx,.jpg,.png,.jpeg"
                    multiple
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-700"
                  >
                    Choose Files
                  </label>
                  <p className="text-xs text-gray-500 mt-2">
                    Supported: PDF, Images (JPG, PNG) - Multiple images allowed
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Compact Print Settings - Show after file upload */}
          {(orderData.file || orderData.files.length > 0) && (
            <div className="bg-white border-2 border-gray-200 rounded-xl p-3 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Print Settings
              </h3>

              {/* Compact Print Settings Layout */}
              <div className="space-y-3">
                {/* Paper Size - Common sizes in one row */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Paper Size</label>
                  <div className="flex flex-wrap gap-1.5">
                    {availablePaperSizes.slice(0, 4).map(size => (
                      <button
                        key={size}
                        onClick={() => setOrderData(prev => ({ ...prev, paperSize: size }))}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                          orderData.paperSize === size
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                    {availablePaperSizes.length > 4 && (
                      <button
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                        <span>More</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Color Mode - Full Width */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Color Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOrderData(prev => ({ ...prev, colorMode: 'BW' }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${
                        orderData.colorMode === 'BW'
                          ? 'bg-gray-700 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded bg-gray-500" />
                      <span>B&W</span>
                    </button>
                    <button
                      onClick={() => setOrderData(prev => ({ ...prev, colorMode: 'Color' }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${
                        orderData.colorMode === 'Color'
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500" />
                      <span>Color</span>
                    </button>
                  </div>
                </div>

                {/* Pages/Sheet + Print Type - Same Row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Pages Per Sheet */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Pages/Sheet</label>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => setOrderData(prev => ({ ...prev, pagesPerSheet: 1 }))}
                        className={`flex items-center justify-center gap-2 px-2 py-2.5 text-xs font-medium rounded-lg transition-all ${
                          orderData.pagesPerSheet === 1
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span>1 Page</span>
                      </button>
                      <button
                        onClick={() => setOrderData(prev => ({ ...prev, pagesPerSheet: 2 }))}
                        className={`flex items-center justify-center gap-2 px-2 py-2.5 text-xs font-medium rounded-lg transition-all ${
                          orderData.pagesPerSheet === 2
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="4" width="20" height="16" rx="1" />
                          <line x1="12" y1="4" x2="12" y2="20" strokeWidth="2" />
                          <line x1="5" y1="8" x2="9" y2="8" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="5" y1="11" x2="9" y2="11" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="5" y1="14" x2="9" y2="14" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="15" y1="8" x2="19" y2="8" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="15" y1="11" x2="19" y2="11" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="15" y1="14" x2="19" y2="14" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <span>2 Pages</span>
                      </button>
                    </div>
                  </div>

                  {/* Print Type */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Print Type</label>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => setOrderData(prev => ({ ...prev, printType: 'Single' }))}
                        className={`flex items-center justify-center gap-2 px-2 py-2.5 text-xs font-medium rounded-lg transition-all ${
                          orderData.printType === 'Single'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <FileText className="w-4 h-4" />
                        <span>Single</span>
                      </button>
                      <button
                        onClick={() => setOrderData(prev => ({ ...prev, printType: 'Double' }))}
                        className={`flex items-center justify-center gap-2 px-2 py-2.5 text-xs font-medium rounded-lg transition-all ${
                          orderData.printType === 'Double'
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="5" y="4" width="10" height="14" rx="1" fill="white" />
                          <line x1="7" y1="7" x2="13" y2="7" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="7" y1="10" x2="13" y2="10" strokeWidth="1.5" strokeLinecap="round" />
                          <line x1="7" y1="13" x2="10" y2="13" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="M17 9 Q 19 9, 19 11 Q 19 13, 17 13" fill="none" strokeWidth="2" strokeLinecap="round" />
                          <path d="M17.5 9 L 16 10.5 M 17.5 13 L 16 11.5" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span>Double</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Copies - Full Width */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Copies</label>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setOrderData(prev => ({ ...prev, copies: Math.max(1, prev.copies - 1) }))}
                      className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-bold text-xl transition-all"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={orderData.copies}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '' || val === '0') {
                          setOrderData(prev => ({ ...prev, copies: '' }))
                        } else {
                          setOrderData(prev => ({ ...prev, copies: parseInt(val) || 1 }))
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '' || parseInt(e.target.value) < 1) {
                          setOrderData(prev => ({ ...prev, copies: 1 }))
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-24 text-center p-2.5 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-semibold text-base"
                    />
                    <button
                      onClick={() => setOrderData(prev => ({ ...prev, copies: Math.min(1000, prev.copies + 1) }))}
                      className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-bold text-xl transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible PDF Page Selection */}
          {orderData.file && orderData.file.type === 'application/pdf' && (
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              {/* Clickable Header */}
              <button
                onClick={() => setIsPageSelectorExpanded(!isPageSelectorExpanded)}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-all"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-900">
                    Edit and Select Pages to Print
                  </span>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-600 transition-transform ${isPageSelectorExpanded ? 'rotate-90' : ''}`} />
              </button>

              {/* Expandable Content */}
              {isPageSelectorExpanded && (
                <div className="p-4 bg-white">
                  <PDFPageSelector
                    file={orderData.file}
                    selectedPages={orderData.selectedPages}
                    onPagesSelected={handlePagesSelected}
                    pageSize={previewPageSize}
                    colorMode={orderData.colorMode}
                    pagesPerSheet={orderData.pagesPerSheet}
                    onEditPage={handleEditFile}
                    viewMode="single"
                  />
                </div>
              )}
            </div>
          )}

          {/* Customer Info */}
          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium mb-2">Your Name *</label>
              <input
                type="text"
                value={orderData.customerName}
                onChange={(e) => setOrderData(prev => ({ ...prev, customerName: e.target.value }))}
                className="w-full p-3 border rounded-lg"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={orderData.customerEmail}
                  onChange={(e) => setOrderData(prev => ({ ...prev, customerEmail: e.target.value }))}
                  className="w-full p-3 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium mb-2">Phone</label>
                <input
                  type="tel"
                  value={orderData.customerPhone}
                  onChange={(e) => setOrderData(prev => ({ ...prev, customerPhone: e.target.value }))}
                  className="w-full p-3 border rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Cost Display */}
          {costInfo.cost > 0 ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-medium">Total Cost:</span>
                <span className="text-2xl font-bold text-blue-600">
                  {formatCurrency(costInfo.cost)}
                </span>
              </div>
              
              {costInfo.appliedTier && (
                <div className="text-sm text-green-600">
                  <p>✓ Bulk discount applied: {costInfo.appliedTier.name}</p>
                  <p>You save: {formatCurrency(costInfo.savings)}</p>
                </div>
              )}
              
              <div className="text-sm text-gray-600 mt-2">
                <p>Price per page: {formatCurrency(costInfo.pricePerPage)}</p>
                <p>{orderData.copies} copies × {formatCurrency(costInfo.pricePerPage)} = {formatCurrency(costInfo.cost)}</p>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">
                {pricing.length === 0 
                  ? "This shop hasn't set up pricing yet. Please contact them directly."
                  : `No pricing found for ${orderData.paperSize} ${orderData.colorMode} ${orderData.printType}. Try a different combination.`
                }
              </p>
            </div>
          )}

          {/* Background processing indicator */}
          {isGeneratingPDF && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
              <span className="text-sm text-blue-700">⚡ Optimizing PDF for faster submission...</span>
            </div>
          )}
          
          {readyPDFBlob && !isGeneratingPDF && Object.keys(editedPages).length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-sm text-green-700">Ready for instant submission!</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmitOrder}
            disabled={
              isSubmitting ||
              (!orderData.file && (!orderData.files || orderData.files.length === 0)) ||
              !orderData.customerName ||
              costInfo.cost <= 0 ||
              (orderData.file?.type === 'application/pdf' && orderData.selectedPages.length === 0) ||
              (orderData.files?.length > 0 && orderData.selectedImages.length === 0)
            }
            className="w-full bg-blue-600 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Order'}
          </button>
          
          {costInfo.cost <= 0 && pricing.length > 0 && (
            <p className="text-sm text-red-600 text-center">
              Please select a valid combination of paper size, color mode, and print type
            </p>
          )}
          
          {orderData.file?.type === 'application/pdf' && orderData.selectedPages.length === 0 && (
            <p className="text-sm text-red-600 text-center">
              Please select at least one page to print from the PDF
            </p>
          )}

          {/* PDF Preview - Development/Testing */}
          {orderData.file?.type === 'application/pdf' && (
            <PDFPreview file={orderData.file} />
          )}
        </div>
      </div>

      {/* Submit Popup Animation */}
      {showSubmitPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 animate-scale-in">
            <div className="flex flex-col items-center gap-4">
              {/* Animated Spinner */}
              <div className="relative">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200"></div>
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent absolute top-0 left-0"></div>
              </div>
              
              {/* Message */}
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-800 mb-2 tabular-nums min-w-[200px] transition-all duration-150">
                  {submitPopupMessage}
                </h3>
                <p className="text-sm text-gray-500">Please wait...</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrderPage
