/**
 * Shop Utilities
 * 
 * Helper functions for working with shop data, operating hours,
 * and shop availability.
 */

export type DayName = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'

export type OperatingHours = {
  [K in DayName]?: string
}

/**
 * Get today's day name in lowercase
 * @returns Day name (e.g., 'monday', 'tuesday', etc.)
 */
export const getTodayDayName = (): DayName => {
  const days: DayName[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[new Date().getDay()]
}

/**
 * Get today's operating hours for a shop
 * @param operatingHours - Shop's operating hours object
 * @returns Formatted string with today's hours (e.g., "Today: 9:00-18:00")
 */
export const getTodayHours = (operatingHours?: OperatingHours | null): string => {
  if (!operatingHours) return 'Hours not available'
  const today = getTodayDayName()
  const hours = operatingHours[today]
  return `Today: ${hours || 'Closed'}`
}

/**
 * Check if a shop is currently open based on operating hours
 * @param operatingHours - Shop's operating hours object
 * @returns True if shop is open now, false otherwise
 */
export const isShopOpen = (operatingHours?: OperatingHours | null): boolean => {
  if (!operatingHours) return false

  const today = getTodayDayName()
  const hours = operatingHours[today]

  if (!hours || hours.toLowerCase() === 'closed') return false

  // Parse hours (format: "9:00-18:00" or "9:00 AM-6:00 PM")
  const match = hours.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  if (!match) return false

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const openMinutes = parseInt(match[1]) * 60 + parseInt(match[2])
  const closeMinutes = parseInt(match[3]) * 60 + parseInt(match[4])

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes
}
