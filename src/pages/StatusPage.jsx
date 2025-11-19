import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getJobStatus, getShopInfo, subscribeToJobUpdates, startJobStatusPolling, formatCurrency } from '../utils/supabase'

const StatusPage = () => {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [connectionStatus, setConnectionStatus] = useState('connecting')

  useEffect(() => {
    loadJobStatus()
    
    // Set up real-time subscription
    console.log('🔄 Setting up real-time updates for job:', jobId)
    const subscription = subscribeToJobUpdates(jobId, (updatedJob) => {
      console.log('🔄 Real-time job update received:', updatedJob)
      setJob(updatedJob)
      setLastUpdated(new Date())
      setConnectionStatus('connected')
    })

    // Set up polling as backup (every 30 seconds)
    const stopPolling = startJobStatusPolling(jobId, (updatedJob) => {
      console.log('🔄 Polling update received:', updatedJob)
      setJob(prevJob => {
        // Only update if the job actually changed
        if (!prevJob || prevJob.updated_at !== updatedJob.updated_at) {
          setLastUpdated(new Date())
          return updatedJob
        }
        return prevJob
      })
    }, 30000)

    return () => {
      console.log('🔄 Cleaning up subscriptions and polling')
      if (subscription && subscription.unsubscribe) {
        subscription.unsubscribe()
      }
      stopPolling()
    }
  }, [jobId])

  const loadJobStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data: jobData, error: jobError } = await getJobStatus(jobId)
      
      if (jobError) {
        throw new Error('Failed to load order status: ' + jobError.message)
      }
      
      if (!jobData) {
        throw new Error('Order not found')
      }
      
      setJob(jobData)
      setLastUpdated(new Date())
      
      // Load shop info
      const { data: shopData } = await getShopInfo(jobData.shop_id)
      if (shopData) {
        setShop(shopData)
      }
      
    } catch (error) {
      console.error('❌ Error loading job status:', error)
      setError(error.message)
      setConnectionStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    console.log('🔄 Manual refresh requested')
    loadJobStatus()
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-100'
      case 'printing': return 'text-blue-600 bg-blue-100'
      case 'completed': return 'text-green-600 bg-green-100'
      case 'cancelled': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'printing': return '🖨️'
      case 'completed': return '✅'
      case 'cancelled': return '❌'
      default: return '📄'
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending'
      case 'printing': return 'Printing'
      case 'completed': return 'Completed'
      case 'cancelled': return 'Cancelled'
      default: return 'Unknown'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order status...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Status</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadJobStatus}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
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
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          {/* Header with refresh button */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
            <h1 className="text-xl sm:text-2xl font-bold">Order Status</h1>
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Connection status indicator */}
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500' :
                  connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  'bg-red-500'
                }`}></div>
                <span className="text-gray-600">
                  {connectionStatus === 'connected' ? 'Live' :
                   connectionStatus === 'connecting' ? 'Connecting' :
                   'Offline'}
                </span>
              </div>
              <button
                onClick={handleRefresh}
                className="bg-blue-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm hover:bg-blue-700 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Last updated info */}
          <div className="text-xs text-gray-500 mb-6">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
          
          {/* Shop Info */}
          {shop && (
            <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b">
              <h2 className="text-sm sm:text-base font-semibold mb-2">Shop Information</h2>
              <p className="font-medium">{shop.name}</p>
              <p className="text-sm text-gray-600">{shop.address}</p>
              <p className="text-sm text-gray-600">{shop.phone}</p>
            </div>
          )}
          
          {/* Status Timeline */}
          <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
            <div className="flex items-center">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3 sm:mr-4 text-sm sm:text-base">
                ✓
              </div>
              <div>
                <p className="text-sm sm:text-base font-medium">Order Received</p>
                <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Your order has been received</p>
                <p className="text-xs text-gray-400">{new Date(job.created_at).toLocaleString()}</p>
              </div>
            </div>
            
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
                job.payment_status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {job.payment_status === 'paid' ? '✓' : '💳'}
              </div>
              <div>
                <p className="font-medium">Payment</p>
                <p className="text-sm text-gray-500">
                  {job.payment_status === 'paid' ? 'Payment confirmed' : 'Waiting for payment'}
                </p>
                {job.payment_status === 'paid' && (
                  <p className="text-xs text-gray-400">{new Date(job.updated_at).toLocaleString()}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
                job.job_status === 'printing' || job.job_status === 'completed' 
                  ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {job.job_status === 'printing' || job.job_status === 'completed' ? '🖨️' : '⏳'}
              </div>
              <div>
                <p className="font-medium">Printing</p>
                <p className="text-sm text-gray-500">
                  {job.job_status === 'printing' ? 'Currently printing...' : 
                   job.job_status === 'completed' ? 'Printing completed' : 'Waiting to print'}
                </p>
                {job.job_status === 'printing' && job.estimated_completion && (
                  <p className="text-xs text-gray-400">
                    Est. completion: {new Date(job.estimated_completion).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${
                job.job_status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
              }`}>
                {job.job_status === 'completed' ? '✅' : '📦'}
              </div>
              <div>
                <p className="font-medium">Ready for Pickup</p>
                <p className="text-sm text-gray-500">
                  {job.job_status === 'completed' ? 'Ready for pickup!' : 'Will be ready soon'}
                </p>
                {job.job_status === 'completed' && (
                  <p className="text-xs text-gray-400">{new Date(job.updated_at).toLocaleString()}</p>
                )}
              </div>
            </div>
          </div>

          {/* Current Status */}
          <div className="border-t pt-4 sm:pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-4 gap-2">
              <span className="text-base sm:text-lg font-medium">Status:</span>
              <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getStatusColor(job.job_status)}`}>
                {getStatusIcon(job.job_status)} {getStatusText(job.job_status)}
              </span>
            </div>
            
            {job.job_status === 'completed' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 text-center animate-pulse-glow">
                <p className="text-green-800 font-medium text-base sm:text-lg">🎉 Ready for pickup!</p>
                <p className="text-green-600 text-xs sm:text-sm mt-1">Visit the shop to collect</p>
                {shop && (
                  <div className="mt-3 text-sm">
                    <p className="font-medium">{shop.name}</p>
                    <p>{shop.address}</p>
                    <p>{shop.phone}</p>
                  </div>
                )}
              </div>
            )}
            
            {job.job_status === 'printing' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-blue-800 font-medium">🖨️ Your order is being printed!</p>
                <p className="text-blue-600 text-sm mt-1">We'll update you when it's ready for pickup</p>
                {job.estimated_completion && (
                  <p className="text-blue-600 text-sm mt-2">
                    Estimated completion: {new Date(job.estimated_completion).toLocaleString()}
                  </p>
                )}
              </div>
            )}
            
            {job.job_status === 'pending' && job.payment_status === 'paid' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                <p className="text-yellow-800 font-medium">⏳ Your order is in queue</p>
                <p className="text-yellow-600 text-sm mt-1">We'll start printing it soon</p>
              </div>
            )}
            
            {job.job_status === 'cancelled' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-red-800 font-medium">❌ Your order has been cancelled</p>
                <p className="text-red-600 text-sm mt-1">Please contact the shop for more information</p>
              </div>
            )}
          </div>

          {/* Order Details */}
          <div className="border-t pt-4 sm:pt-6 mt-4 sm:mt-6">
            <h3 className="text-sm sm:text-base font-medium mb-3">Order Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Order ID:</span>
                <span className="font-mono">{job.id.slice(0, 8)}</span>
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
                <span>Specifications:</span>
                <span>{job.paper_size} {job.color_mode} {job.print_type}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <span>{job.customer_name}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Total Cost:</span>
                <span>{formatCurrency(job.total_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Status:</span>
                <span className={job.payment_status === 'paid' ? 'text-green-600' : 'text-yellow-600'}>
                  {job.payment_status === 'paid' ? 'Paid' : 'Pending'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Back to Shop */}
          <div className="border-t pt-4 sm:pt-6 mt-4 sm:mt-6 text-center">
            <Link 
              to={`/shop/${job.shop_id}`}
              className="text-blue-600 hover:underline"
            >
              Back to Shop
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatusPage