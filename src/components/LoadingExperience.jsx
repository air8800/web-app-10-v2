import React, { useState, useEffect } from 'react'

const LOADING_MESSAGES = [
  "Loading your document...",
  "Preparing pages for editing...",
  "Almost ready...",
  "Setting up workspace..."
]

const LoadingExperience = ({ loadingStage, loadedCount, totalPages }) => {
  const [messageIndex, setMessageIndex] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const showLoader = loadingStage === 'parsing' || loadingStage === 'loading'
  
  const progress = totalPages > 0 ? (loadedCount / totalPages) * 100 : 0

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = (e) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!showLoader || prefersReducedMotion) return

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
    }, 2500)

    return () => clearInterval(interval)
  }, [showLoader, prefersReducedMotion])

  if (!showLoader) return null

  return (
    <div className="mb-4 flex justify-center">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-slate-400 loading-spinner" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 message-fade-in" key={messageIndex}>
                {LOADING_MESSAGES[messageIndex]}
              </h3>
              {loadingStage === 'loading' && totalPages > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 progress-pulse">
                  {totalPages} pages
                </span>
              )}
            </div>

            {loadingStage === 'loading' && (
              <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-slate-400 dark:bg-slate-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoadingExperience
