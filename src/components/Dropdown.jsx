import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

const Dropdown = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  className = '',
  disabled = false,
  label = '',
  fullWidth = true
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [maxHeight, setMaxHeight] = useState(240)
  const [dropdownPosition, setDropdownPosition] = useState('bottom')
  const dropdownRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const buttonRect = dropdownRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - buttonRect.bottom
      const spaceAbove = buttonRect.top

      const maxDropdownHeight = 240
      const padding = 16

      if (spaceBelow < maxDropdownHeight + padding && spaceAbove > spaceBelow) {
        setDropdownPosition('top')
        setMaxHeight(Math.min(maxDropdownHeight, spaceAbove - padding))
      } else {
        setDropdownPosition('bottom')
        setMaxHeight(Math.min(maxDropdownHeight, spaceBelow - padding))
      }
    }
  }, [isOpen])

  const getDisplayValue = () => {
    if (Array.isArray(options) && options.length > 0) {
      if (typeof options[0] === 'object') {
        const selected = options.find(opt => opt.value === value)
        return selected ? selected.label : placeholder
      } else {
        return value || placeholder
      }
    }
    return placeholder
  }

  const handleSelect = (optionValue) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  const isSelected = (optionValue) => {
    return value === optionValue
  }

  if (disabled) {
    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
        <div className="px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-500 cursor-not-allowed">
          {getDisplayValue()}
        </div>
      </div>
    )
  }

  return (
    <div ref={dropdownRef} className={`relative ${fullWidth ? 'w-full' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          ${fullWidth ? 'w-full' : ''}
          px-4 py-3 bg-white border-2 border-gray-300 rounded-lg
          flex items-center justify-between gap-2
          text-left font-medium text-sm
          hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200
          transition-all duration-200
          ${isOpen ? 'border-blue-500 ring-2 ring-blue-200' : ''}
        `}
      >
        <span className="truncate flex-1">{getDisplayValue()}</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className={`
            fixed bg-white border-2 border-blue-500 rounded-lg shadow-xl overflow-y-auto
            ${dropdownPosition === 'top' ? '' : ''}
          `}
          style={{
            maxHeight: `${maxHeight}px`,
            zIndex: 9999,
            left: dropdownRef.current?.getBoundingClientRect().left + 'px',
            width: dropdownRef.current?.getBoundingClientRect().width + 'px',
            ...(dropdownPosition === 'top'
              ? { bottom: `${window.innerHeight - dropdownRef.current?.getBoundingClientRect().top + 8}px` }
              : { top: `${dropdownRef.current?.getBoundingClientRect().bottom + 8}px` })
          }}
        >
          {Array.isArray(options) && options.length > 0 ? (
            typeof options[0] === 'object' ? (
              options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`
                    w-full px-4 py-3 text-left text-sm
                    flex items-center justify-between gap-2
                    transition-colors duration-150
                    ${isSelected(option.value)
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                    border-b border-gray-100 last:border-b-0
                  `}
                >
                  <span className="flex-1">{option.label}</span>
                  {isSelected(option.value) && (
                    <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  )}
                </button>
              ))
            ) : (
              options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`
                    w-full px-4 py-3 text-left text-sm
                    flex items-center justify-between gap-2
                    transition-colors duration-150
                    ${isSelected(option)
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                    }
                    border-b border-gray-100 last:border-b-0
                  `}
                >
                  <span className="flex-1">{option}</span>
                  {isSelected(option) && (
                    <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  )}
                </button>
              ))
            )
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500">No options available</div>
          )}
        </div>
      )}
    </div>
  )
}

export default Dropdown
