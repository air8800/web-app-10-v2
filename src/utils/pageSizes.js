// Page size configurations for printing
// All dimensions in points (1 point = 1/72 inch)

export const PAGE_SIZES = {
  A4: {
    name: 'A4',
    width: 595,
    height: 842,
    displayName: 'A4 (210 × 297 mm)',
    description: 'Standard international paper size'
  },
  A3: {
    name: 'A3',
    width: 842,
    height: 1191,
    displayName: 'A3 (297 × 420 mm)',
    description: 'Double the size of A4'
  },
  LETTER: {
    name: 'LETTER',
    width: 612,
    height: 792,
    displayName: 'Letter (8.5 × 11 in)',
    description: 'Standard US paper size'
  },
  LEGAL: {
    name: 'LEGAL',
    width: 612,
    height: 1008,
    displayName: 'Legal (8.5 × 14 in)',
    description: 'US legal document size'
  }
}

export const DEFAULT_PAGE_SIZE = 'A4'

export const getPageSize = (sizeName) => {
  return PAGE_SIZES[sizeName] || PAGE_SIZES[DEFAULT_PAGE_SIZE]
}

export const calculateScaleToFit = (contentWidth, contentHeight, pageWidth, pageHeight) => {
  const scaleX = pageWidth / contentWidth
  const scaleY = pageHeight / contentHeight
  return Math.min(scaleX, scaleY, 1)
}

export const fitContentToPage = (contentWidth, contentHeight, pageSize) => {
  const scale = calculateScaleToFit(contentWidth, contentHeight, pageSize.width, pageSize.height)
  return {
    width: contentWidth * scale,
    height: contentHeight * scale,
    scale,
    offsetX: (pageSize.width - contentWidth * scale) / 2,
    offsetY: (pageSize.height - contentHeight * scale) / 2
  }
}
