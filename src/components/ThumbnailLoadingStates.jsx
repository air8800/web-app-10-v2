/**
 * Zero-Memory Thumbnail Loading States
 * Pure CSS animations for thumbnail loading indicators
 * No JavaScript execution cost, GPU-accelerated
 */

import React from 'react'

/**
 * Shimmer loading effect - perfect for thumbnails being loaded
 */
export const ShimmerLoader = ({ width = '100%', height = '200px', className = '' }) => {
  return (
    <div 
      className={`thumbnail-shimmer ${className}`}
      style={{ width, height }}
      aria-label="Loading thumbnail"
    >
      <style jsx>{`
        .thumbnail-shimmer {
          position: relative;
          overflow: hidden;
          background: linear-gradient(
            90deg,
            #f0f0f0 0%,
            #f0f0f0 40%,
            #e8e8e8 50%,
            #f0f0f0 60%,
            #f0f0f0 100%
          );
          background-size: 200% 100%;
          animation: shimmer 2s ease-in-out infinite;
          border-radius: 4px;
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Pulse loading effect - subtle and elegant
 */
export const PulseLoader = ({ width = '100%', height = '200px', className = '' }) => {
  return (
    <div 
      className={`thumbnail-pulse ${className}`}
      style={{ width, height }}
      aria-label="Loading thumbnail"
    >
      <style jsx>{`
        .thumbnail-pulse {
          position: relative;
          background: #f5f5f5;
          border-radius: 4px;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Skeleton loader with wave effect
 */
export const SkeletonLoader = ({ width = '100%', height = '200px', className = '' }) => {
  return (
    <div 
      className={`thumbnail-skeleton ${className}`}
      style={{ width, height }}
      aria-label="Loading thumbnail"
    >
      <div className="skeleton-wave"></div>
      <style jsx>{`
        .thumbnail-skeleton {
          position: relative;
          background: #f0f0f0;
          border-radius: 4px;
          overflow: hidden;
        }

        .skeleton-wave {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.6),
            transparent
          );
          animation: wave 2s ease-in-out infinite;
        }

        @keyframes wave {
          0% {
            left: -100%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Spinner loader - classic spinning indicator
 */
export const SpinnerLoader = ({ size = 40, className = '' }) => {
  return (
    <div className={`thumbnail-spinner-container ${className}`}>
      <div className="thumbnail-spinner" style={{ width: size, height: size }}>
        <style jsx>{`
          .thumbnail-spinner-container {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            background: #f9f9f9;
            border-radius: 4px;
          }

          .thumbnail-spinner {
            border: 3px solid #e0e0e0;
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  )
}

/**
 * Progressive dots loader
 */
export const DotsLoader = ({ className = '' }) => {
  return (
    <div className={`thumbnail-dots-container ${className}`}>
      <div className="dots-wrapper">
        <span className="dot dot-1"></span>
        <span className="dot dot-2"></span>
        <span className="dot dot-3"></span>
      </div>
      <style jsx>{`
        .thumbnail-dots-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background: #f9f9f9;
          border-radius: 4px;
        }

        .dots-wrapper {
          display: flex;
          gap: 8px;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #3b82f6;
          animation: bounce 1.4s ease-in-out infinite;
        }

        .dot-1 {
          animation-delay: 0s;
        }

        .dot-2 {
          animation-delay: 0.2s;
        }

        .dot-3 {
          animation-delay: 0.4s;
        }

        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * Thumbnail container with loading state
 * Use this wrapper for automatic state management
 */
export const ThumbnailContainer = ({ 
  isLoading, 
  isLoaded,
  children, 
  loadingType = 'shimmer',
  width = '100%', 
  height = '200px',
  className = '' 
}) => {
  const LoaderComponent = {
    shimmer: ShimmerLoader,
    pulse: PulseLoader,
    skeleton: SkeletonLoader,
    spinner: SpinnerLoader,
    dots: DotsLoader
  }[loadingType] || ShimmerLoader

  return (
    <div className={`thumbnail-container ${className}`} style={{ width, height }}>
      {!isLoaded && isLoading && (
        <LoaderComponent width={width} height={height} />
      )}
      {isLoaded && (
        <div className="thumbnail-content fade-in">
          {children}
        </div>
      )}
      {!isLoading && !isLoaded && (
        <div className="thumbnail-placeholder" style={{ width, height }}>
          <div className="placeholder-icon">📄</div>
        </div>
      )}
      <style jsx>{`
        .thumbnail-container {
          position: relative;
          overflow: hidden;
        }

        .thumbnail-content {
          width: 100%;
          height: 100%;
        }

        .fade-in {
          animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .thumbnail-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          border: 2px dashed #d0d0d0;
          border-radius: 4px;
        }

        .placeholder-icon {
          font-size: 48px;
          opacity: 0.3;
        }
      `}</style>
    </div>
  )
}

/**
 * Usage Examples:
 * 
 * 1. Simple shimmer loader:
 *    <ShimmerLoader width="150px" height="200px" />
 * 
 * 2. Pulse loader:
 *    <PulseLoader width="150px" height="200px" />
 * 
 * 3. With container (automatic state):
 *    <ThumbnailContainer 
 *      isLoading={pageState === 'loading'}
 *      isLoaded={pageState === 'loaded'}
 *      loadingType="shimmer"
 *    >
 *      <img src={thumbnail} />
 *    </ThumbnailContainer>
 * 
 * 4. In grid with loading state:
 *    {pages.map(page => (
 *      <ThumbnailContainer
 *        key={page.pageNumber}
 *        isLoading={adapter.isPageLoading(page.pageNumber)}
 *        isLoaded={adapter.isPageLoaded(page.pageNumber)}
 *        loadingType="skeleton"
 *      >
 *        <img src={page.thumbnail} alt={`Page ${page.pageNumber}`} />
 *      </ThumbnailContainer>
 *    ))}
 */

export default ThumbnailContainer
