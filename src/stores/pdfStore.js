import { create } from 'zustand'

const usePDFStore = create((set, get) => ({
  pdf: null,
  totalPages: 0,
  pages: new Map(),
  loadedPages: new Set(),
  dirtyPages: new Set(),
  renderQueue: [],
  
  setPDF: (pdfDoc) => set({ pdf: pdfDoc, totalPages: pdfDoc?.numPages || 0 }),
  
  initializePages: (totalPages) => {
    const pages = new Map()
    for (let i = 1; i <= totalPages; i++) {
      pages.set(i, {
        pageNumber: i,
        loaded: false,
        canvas: null,
        originalCanvas: null,
        thumbnail: null,
        originalThumbnail: null,
        width: 0,
        height: 0,
        dirty: false,
        editHistory: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          rotation: 0,
          filter: 'none',
          cropArea: null,
          scale: 100,
          offsetX: 0,
          offsetY: 0
        }
      })
    }
    set({ pages, totalPages })
  },
  
  setPageData: (pageNumber, data) => set((state) => {
    const pages = new Map(state.pages)
    const existing = pages.get(pageNumber) || {}
    pages.set(pageNumber, { ...existing, ...data, pageNumber, loaded: true })
    
    const loadedPages = new Set(state.loadedPages)
    loadedPages.add(pageNumber)
    
    return { pages, loadedPages }
  }),
  
  setPageEdit: (pageNumber, editHistory) => set((state) => {
    const pages = new Map(state.pages)
    const page = pages.get(pageNumber)
    if (!page) return state
    
    const hasChanges = Object.keys(editHistory).some(key => {
      if (key === 'cropArea') {
        return editHistory[key] !== null
      }
      return editHistory[key] !== 0 && editHistory[key] !== 'none' && editHistory[key] !== 100
    })
    
    pages.set(pageNumber, {
      ...page,
      editHistory: { ...page.editHistory, ...editHistory },
      dirty: hasChanges
    })
    
    const dirtyPages = new Set(state.dirtyPages)
    if (hasChanges) {
      dirtyPages.add(pageNumber)
    } else {
      dirtyPages.delete(pageNumber)
    }
    
    return { pages, dirtyPages }
  }),
  
  applyEditToAllPages: (editHistory) => set((state) => {
    const pages = new Map(state.pages)
    const dirtyPages = new Set()
    
    const hasChanges = Object.keys(editHistory).some(key => {
      if (key === 'cropArea') return editHistory[key] !== null
      return editHistory[key] !== 0 && editHistory[key] !== 'none' && editHistory[key] !== 100
    })
    
    for (let i = 1; i <= state.totalPages; i++) {
      const page = pages.get(i)
      if (page) {
        pages.set(i, {
          ...page,
          editHistory: { ...page.editHistory, ...editHistory },
          dirty: hasChanges
        })
        if (hasChanges) {
          dirtyPages.add(i)
        }
      }
    }
    
    return { pages, dirtyPages }
  }),
  
  resetPageEdit: (pageNumber) => set((state) => {
    const pages = new Map(state.pages)
    const page = pages.get(pageNumber)
    if (!page) return state
    
    pages.set(pageNumber, {
      ...page,
      canvas: page.originalCanvas,
      editHistory: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        rotation: 0,
        filter: 'none',
        cropArea: null,
        scale: 100,
        offsetX: 0,
        offsetY: 0
      },
      dirty: false
    })
    
    const dirtyPages = new Set(state.dirtyPages)
    dirtyPages.delete(pageNumber)
    
    return { pages, dirtyPages }
  }),
  
  clearDirtyPages: () => set({ dirtyPages: new Set() }),
  
  addToRenderQueue: (pageNumbers) => set((state) => ({
    renderQueue: [...new Set([...state.renderQueue, ...pageNumbers])]
  })),
  
  removeFromRenderQueue: (pageNumber) => set((state) => ({
    renderQueue: state.renderQueue.filter(p => p !== pageNumber)
  })),
  
  getVisibleWindow: (centerPage, windowSize = 6) => {
    const state = get()
    const halfWindow = Math.floor(windowSize / 2)
    const start = Math.max(1, centerPage - halfWindow)
    const end = Math.min(state.totalPages, start + windowSize - 1)
    
    const visiblePages = []
    for (let i = start; i <= end; i++) {
      visiblePages.push(i)
    }
    return visiblePages
  },
  
  getPagesToLoad: (visiblePages) => {
    const state = get()
    return visiblePages.filter(pageNum => !state.loadedPages.has(pageNum))
  },
  
  reset: () => set({
    pdf: null,
    totalPages: 0,
    pages: new Map(),
    loadedPages: new Set(),
    dirtyPages: new Set(),
    renderQueue: []
  })
}))

export default usePDFStore
