import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getShopInfo, testConnection } from '../utils/supabase'

const ShopPage = () => {
  const { shopId } = useParams()
  const navigate = useNavigate()
  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadShopInfo()
  }, [shopId])

  const loadShopInfo = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // First test connection
      console.log('🔍 Testing connection...')
      const connectionTest = await testConnection()
      
      if (!connectionTest.success) {
        throw new Error('Database connection failed: ' + connectionTest.error)
      }
      
      console.log('✅ Connection successful, loading shop...')
      
      // Then load shop info
      const { data, error } = await getShopInfo(shopId)
      
      if (error) {
        throw new Error('Failed to load shop: ' + error.message)
      }
      
      if (!data) {
        throw new Error('Shop not found or inactive')
      }
      
      setShop(data)
      
      // Save to recent shops
      const recent = JSON.parse(localStorage.getItem('recentShops') || '[]')
      const updated = [data, ...recent.filter(s => s.id !== data.id)].slice(0, 5)
      localStorage.setItem('recentShops', JSON.stringify(updated))
      
    } catch (error) {
      console.error('❌ Error loading shop:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePlaceOrder = () => {
    navigate(`/shop/${shopId}/order`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading shop information...</p>
          <p className="text-sm text-gray-500 mt-2">Connecting to database...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Unable to Load Shop</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadShopInfo}
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{shop.name}</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">{shop.address}</p>
          <p className="text-sm sm:text-base text-blue-600 mt-1">{shop.phone}</p>
          {shop.email && <p className="text-sm sm:text-base text-gray-600">{shop.email}</p>}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          {/* Services */}
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Our Services</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                <span>Document Printing (PDF, Word, Images)</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                <span>Black & White and Color Printing</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                <span>Single and Double Sided Printing</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                <span>Multiple Paper Sizes (A3, A4, Letter)</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                <span>Bulk Printing Discounts</span>
              </div>
            </div>
          </div>

          {/* Operating Hours */}
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Hours</h2>
            {shop.operating_hours ? (
              <div className="space-y-2">
                {Object.entries(shop.operating_hours).map(([day, hours]) => (
                  <div key={day} className="flex justify-between">
                    <span className="capitalize font-medium">{day}</span>
                    <span className="text-gray-600">{hours}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600">Contact shop for operating hours</p>
            )}
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-6 sm:mt-8 text-center">
          <button
            onClick={handlePlaceOrder}
            className="w-full sm:w-auto bg-blue-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-lg text-base sm:text-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
          >
            Place Print Order
          </button>
          <p className="text-sm sm:text-base text-gray-600 mt-3 sm:mt-4 px-4">
            Upload and get instant pricing
          </p>
        </div>
      </div>
    </div>
  )
}

export default ShopPage