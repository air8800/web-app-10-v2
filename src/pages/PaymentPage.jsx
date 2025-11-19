import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getJobStatus, updatePaymentStatus, getShopInfo, formatCurrency } from '../utils/supabase'

const PaymentPage = () => {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [shop, setShop] = useState(null)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadJobDetails()
  }, [jobId])

  const loadJobDetails = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data: jobData, error: jobError } = await getJobStatus(jobId)
      
      if (jobError) {
        throw new Error('Failed to load order: ' + jobError.message)
      }
      
      if (!jobData) {
        throw new Error('Order not found')
      }
      
      setJob(jobData)
      
      // Load shop info
      const { data: shopData } = await getShopInfo(jobData.shop_id)
      if (shopData) {
        setShop(shopData)
      }
      
    } catch (error) {
      console.error('❌ Error loading job details:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentConfirmation = async () => {
    try {
      const { error } = await updatePaymentStatus(jobId, 'paid')
      
      if (error) {
        throw new Error('Failed to update payment status: ' + error.message)
      }
      
      setPaymentConfirmed(true)
      
      setTimeout(() => {
        navigate(`/status/${jobId}`)
      }, 2000)
      
    } catch (error) {
      console.error('❌ Payment confirmation error:', error)
      alert('Failed to confirm payment: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Order</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadJobDetails}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (paymentConfirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
          <div className="text-green-600 text-6xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-green-600 mb-2">Payment Confirmed!</h1>
          <p className="text-gray-600 mb-4">Thank you for your order.</p>
          <p className="text-gray-600 mb-6">Redirecting to order status...</p>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
          </div>
          <Link to={`/status/${jobId}`} className="text-blue-600 hover:underline">
            Click here if you're not redirected automatically
          </Link>
        </div>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Order Not Found</h1>
          <p className="text-gray-600">The order you're looking for doesn't exist.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-4 sm:py-8">
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Payment</h1>
          
          {/* Order Summary */}
          <div className="border-b pb-3 sm:pb-4 mb-3 sm:mb-4">
            <h2 className="text-sm sm:text-base font-semibold mb-2">Order Summary</h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Shop:</span>
                <span>{shop?.name || 'Loading...'}</span>
              </div>
              <div className="flex justify-between">
                <span>File:</span>
                <span>{job.filename}</span>
              </div>
              <div className="flex justify-between">
                <span>Copies:</span>
                <span>{job.copies}</span>
              </div>
              <div className="flex justify-between">
                <span>Paper:</span>
                <span>{job.paper_size} {job.color_mode} {job.print_type}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total:</span>
                <span>{formatCurrency(job.total_cost)}</span>
              </div>
            </div>
          </div>

          {/* Payment QR Code */}
          <div className="text-center mb-4 sm:mb-6">
            <div className="bg-gray-100 w-48 h-48 sm:w-64 sm:h-64 mx-auto rounded-lg flex items-center justify-center mb-3 sm:mb-4">
              <div className="text-center">
                <div className="text-4xl mb-2">📱</div>
                <p className="text-sm text-gray-600">UPI QR Code</p>
                <p className="text-xs text-gray-500">Scan to pay {formatCurrency(job.total_cost)}</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 px-4">
              Scan with UPI app to pay
            </p>
          </div>

          {/* Payment Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
            <h3 className="text-sm sm:text-base font-medium text-blue-800 mb-2">Instructions:</h3>
            <ol className="list-decimal list-inside text-xs sm:text-sm text-blue-700 space-y-1">
              <li>Open your UPI app (Google Pay, PhonePe, Paytm, etc.)</li>
              <li>Scan the QR code above</li>
              <li>Enter the exact amount: {formatCurrency(job.total_cost)}</li>
              <li>Complete the payment</li>
              <li>Click the button below after payment is complete</li>
            </ol>
          </div>

          {/* Payment Confirmation */}
          <div className="text-center">
            <button
              onClick={handlePaymentConfirmation}
              className="w-full sm:w-auto bg-green-600 text-white px-6 py-2.5 sm:py-3 rounded-lg font-medium hover:bg-green-700 text-sm sm:text-base"
            >
              Payment Complete
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Click after payment
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaymentPage