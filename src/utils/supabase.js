import { createClient } from '@supabase/supabase-js'
import * as tus from 'tus-js-client'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

const projectId = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]

export const supabaseStorageUrl = `https://${projectId}.storage.supabase.co`

console.log('🔧 Supabase Configuration:')
console.log('URL:', supabaseUrl)
console.log('Storage URL:', supabaseStorageUrl)
console.log('Key:', supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'NOT SET')

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// ============================================================================
// FILENAME SANITIZATION
// ============================================================================

// Sanitize filename to avoid special characters that Supabase storage rejects
const sanitizeFilename = (filename) => {
  // Extract extension
  const lastDotIndex = filename.lastIndexOf('.')
  const name = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename
  const ext = lastDotIndex > 0 ? filename.substring(lastDotIndex) : ''
  
  // Replace spaces with dashes, remove special characters, keep only alphanumeric, dash, underscore
  const sanitized = name
    .replace(/\s+/g, '-')  // Replace spaces with dashes
    .replace(/[^a-zA-Z0-9_-]/g, '')  // Remove special characters
    .replace(/_{2,}/g, '_')  // Replace multiple underscores with single
    .replace(/-{2,}/g, '-')  // Replace multiple dashes with single
    .substring(0, 100)  // Limit length
  
  return sanitized + ext
}

// ============================================================================
// CONNECTION TEST AND DIAGNOSTICS
// ============================================================================

export const testConnection = async () => {
  try {
    console.log('🔍 Testing Supabase connection...')
    console.log('🔧 URL:', supabaseUrl)
    console.log('🔧 Key length:', supabaseKey?.length || 0)
    
    // Test 1: Basic connection
    const { data: healthCheck, error: healthError } = await supabase
      .from('shops')
      .select('count')
      .limit(1)
    
    if (healthError) {
      console.error('❌ Health check failed:', healthError)
      return { 
        success: false, 
        error: `Health check failed: ${healthError.message}`,
        details: healthError
      }
    }
    
    console.log('✅ Basic connection successful')
    
    // Test 2: Check if shops table exists and has data
    const { data: shopsData, error: shopsError } = await supabase
      .from('shops')
      .select('id, name, is_active')
      .limit(5)
    
    if (shopsError) {
      console.error('❌ Shops query failed:', shopsError)
      return { 
        success: false, 
        error: `Shops table error: ${shopsError.message}`,
        details: shopsError
      }
    }
    
    console.log('✅ Shops table accessible')
    console.log('📊 Found shops:', shopsData?.length || 0)
    
    if (shopsData) {
      shopsData.forEach(shop => {
        console.log(`  - ${shop.name} (${shop.is_active ? 'active' : 'inactive'})`)
      })
    }
    
    // Test 3: Check RLS policies
    const { data: activeShops, error: rlsError } = await supabase
      .from('shops')
      .select('*')
      .eq('is_active', true)
    
    if (rlsError) {
      console.error('❌ RLS policy test failed:', rlsError)
      return { 
        success: false, 
        error: `RLS policy error: ${rlsError.message}`,
        details: rlsError
      }
    }
    
    console.log('✅ RLS policies working')
    console.log('📊 Active shops found:', activeShops?.length || 0)
    
    return { 
      success: true, 
      shopsCount: activeShops?.length || 0,
      shops: activeShops
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error)
    return { 
      success: false, 
      error: `Connection failed: ${error.message}`,
      details: error
    }
  }
}

// ============================================================================
// SHOP FUNCTIONS WITH ENHANCED ERROR HANDLING
// ============================================================================

export const getShopInfo = async (shopId) => {
  try {
    console.log('🔍 Fetching shop info for:', shopId)
    
    if (!shopId) {
      throw new Error('Shop ID is required')
    }
    
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .eq('is_active', true)
      .maybeSingle()
    
    if (error) {
      console.error('❌ Error fetching shop:', error)
      throw new Error(`Failed to fetch shop: ${error.message}`)
    }
    
    if (!data) {
      console.warn('⚠️ Shop not found or inactive:', shopId)
      return { data: null, error: { message: 'Shop not found or inactive' } }
    }
    
    console.log('✅ Shop info loaded:', data.name)
    return { data, error: null }
    
  } catch (error) {
    console.error('❌ Shop fetch error:', error)
    return { data: null, error: { message: error.message } }
  }
}

export const getAllActiveShops = async () => {
  try {
    console.log('🔍 Fetching all active shops...')
    
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('❌ Error fetching shops:', error)
      throw new Error(`Failed to fetch shops: ${error.message}`)
    }
    
    console.log('✅ Active shops loaded:', data?.length || 0)
    return { data: data || [], error: null }
    
  } catch (error) {
    console.error('❌ Shops fetch error:', error)
    return { data: [], error: { message: error.message } }
  }
}

// ============================================================================
// PRICING FUNCTIONS
// ============================================================================

export const getShopPricing = async (shopId) => {
  try {
    console.log('💰 Fetching pricing for shop:', shopId)
    
    if (!shopId) {
      throw new Error('Shop ID is required')
    }
    
    const { data, error } = await supabase
      .from('cost_configs')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
    
    if (error) {
      console.error('❌ Error fetching pricing:', error)
      throw new Error(`Failed to fetch pricing: ${error.message}`)
    }
    
    console.log('✅ Pricing loaded:', data?.length || 0, 'configurations')
    return { data: data || [], error: null }
    
  } catch (error) {
    console.error('❌ Pricing fetch error:', error)
    return { data: [], error: { message: error.message } }
  }
}

export const calculateOrderCost = async (shopId, orderData) => {
  try {
    const { data: configs, error } = await getShopPricing(shopId)
    
    if (error || !configs || configs.length === 0) {
      console.warn('⚠️ No pricing configs found for shop:', shopId)
      return { 
        cost: 0, 
        error: 'No pricing available for this shop',
        pricePerPage: 0,
        appliedTier: null,
        savings: 0
      }
    }
    
    const matchingConfig = configs.find(config => 
      config.paper_size === orderData.paperSize &&
      config.color_mode === orderData.colorMode &&
      config.print_type === orderData.printType
    )
    
    if (!matchingConfig) {
      console.warn('⚠️ No matching config found for:', orderData)
      return { 
        cost: 0, 
        error: `No pricing found for ${orderData.paperSize} ${orderData.colorMode} ${orderData.printType}`,
        pricePerPage: 0,
        appliedTier: null,
        savings: 0
      }
    }
    
    let pricePerPage = matchingConfig.base_price
    let appliedTier = null
    
    // Check for bulk pricing
    if (matchingConfig.bulk_tiers && matchingConfig.bulk_tiers.length > 0) {
      const tier = matchingConfig.bulk_tiers
        .filter(t => orderData.copies >= t.min_copies)
        .filter(t => !t.max_copies || orderData.copies <= t.max_copies)
        .sort((a, b) => b.min_copies - a.min_copies)[0]
      
      if (tier) {
        pricePerPage = matchingConfig.base_price * (1 - tier.discount)
        appliedTier = tier
      }
    }
    
    const totalCost = pricePerPage * orderData.copies
    const savings = appliedTier ? (matchingConfig.base_price - pricePerPage) * orderData.copies : 0
    
    console.log('💰 Cost calculated:', {
      totalCost,
      pricePerPage,
      appliedTier: appliedTier?.name,
      savings
    })
    
    return { 
      cost: totalCost, 
      pricePerPage, 
      appliedTier,
      savings,
      basePrice: matchingConfig.base_price,
      error: null
    }
  } catch (error) {
    console.error('❌ Cost calculation error:', error)
    return { 
      cost: 0, 
      error: 'Error calculating cost',
      pricePerPage: 0,
      appliedTier: null,
      savings: 0
    }
  }
}

// ============================================================================
// FILE UPLOAD FUNCTIONS
// ============================================================================

export const uploadFileChunked = async (file, shopId, onProgress = null, getUploadRef = null) => {
  return new Promise((resolve, reject) => {
    try {
      if (!file) {
        reject(new Error('No file provided'))
        return
      }
      
      if (!shopId) {
        reject(new Error('Shop ID is required'))
        return
      }
      
      const sanitizedName = sanitizeFilename(file.name)
      const fileName = `${shopId}/${Date.now()}_${sanitizedName}`
      const bucketName = 'print-files'
      
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(2)
      console.log(`🚀 Starting CHUNKED upload for ${fileSizeMB} MB file...`)
      console.log('📁 Using direct storage endpoint:', supabaseStorageUrl)
      
      const upload = new tus.Upload(file, {
        endpoint: `${supabaseStorageUrl}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: {
          authorization: `Bearer ${supabaseKey}`,
          'x-upsert': 'false',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: bucketName,
          objectName: fileName,
          contentType: file.type || 'application/pdf',
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024,
        onError: (error) => {
          console.error('❌ Chunked upload failed:', error)
          reject(new Error(`Upload failed: ${error.message}`))
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(1)
          console.log(`📤 Upload progress: ${percentage}% (${(bytesUploaded / 1024 / 1024).toFixed(2)} MB / ${fileSizeMB} MB)`)
          
          if (onProgress) {
            onProgress(bytesUploaded, bytesTotal, percentage)
          }
        },
        onSuccess: () => {
          const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName)
          
          console.log('✅ Chunked upload complete!')
          console.log('📎 File URL:', publicUrl)
          
          resolve({ 
            data: { 
              path: fileName, 
              publicUrl 
            }, 
            error: null 
          })
        }
      })
      
      if (getUploadRef) {
        getUploadRef(upload)
      }
      
      upload.start()
      
    } catch (error) {
      console.error('❌ Chunked upload error:', error)
      reject(error)
    }
  })
}

export const uploadFile = async (file, shopId) => {
  try {
    if (!file) {
      throw new Error('No file provided')
    }
    
    if (!shopId) {
      throw new Error('Shop ID is required')
    }
    
    const sanitizedName = sanitizeFilename(file.name)
    const fileName = `${shopId}/${Date.now()}_${sanitizedName}`
    
    console.log('📁 Uploading file:', fileName)
    
    const { data, error } = await supabase.storage
      .from('print-files')
      .upload(fileName, file)
    
    if (error) {
      console.error('❌ File upload error:', error)
      throw new Error(`File upload failed: ${error.message}`)
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('print-files')
      .getPublicUrl(fileName)
    
    console.log('✅ File uploaded successfully:', publicUrl)
    return { data: { path: data.path, publicUrl }, error: null }
    
  } catch (error) {
    console.error('❌ Upload error:', error)
    return { data: null, error: { message: error.message } }
  }
}

// ============================================================================
// ORDER FUNCTIONS
// ============================================================================

export const submitPrintJob = async (jobData) => {
  try {
    console.log('📝 Submitting print job:', jobData)
    
    if (!jobData.shop_id) {
      throw new Error('Shop ID is required')
    }
    
    if (!jobData.filename) {
      throw new Error('Filename is required')
    }
    
    const { data, error } = await supabase
      .from('print_jobs')
      .insert({
        ...jobData,
        payment_status: 'paid', // Auto-mark as paid
        job_status: 'pending'
      })
      .select()
      .single()
    
    if (error) {
      console.error('❌ Job submission error:', error)
      throw new Error(`Failed to submit job: ${error.message}`)
    }
    
    console.log('✅ Print job submitted successfully:', data.id)
    return { data, error: null }
    
  } catch (error) {
    console.error('❌ Submit error:', error)
    return { data: null, error: { message: error.message } }
  }
}

export const getJobStatus = async (jobId) => {
  try {
    if (!jobId) {
      throw new Error('Job ID is required')
    }
    
    const { data, error } = await supabase
      .from('print_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle()
    
    if (error) {
      console.error('❌ Job status error:', error)
      throw new Error(`Failed to get job status: ${error.message}`)
    }
    
    return { data, error: null }
    
  } catch (error) {
    console.error('❌ Job status error:', error)
    return { data: null, error: { message: error.message } }
  }
}

export const updatePrintJob = async (jobId, updates) => {
  try {
    if (!jobId) {
      throw new Error('Job ID is required')
    }

    const { data, error } = await supabase
      .from('print_jobs')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select()
      .single()

    if (error) {
      console.error('❌ Job update error:', error)
      throw new Error(`Failed to update job: ${error.message}`)
    }

    console.log('✅ Job updated successfully:', jobId)
    return { data, error: null }

  } catch (error) {
    console.error('❌ Job update error:', error)
    return { data: null, error: { message: error.message } }
  }
}

export const updatePaymentStatus = async (jobId, status) => {
  try {
    if (!jobId) {
      throw new Error('Job ID is required')
    }

    const { data, error } = await supabase
      .from('print_jobs')
      .update({
        payment_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select()
      .single()

    if (error) {
      console.error('❌ Payment update error:', error)
      throw new Error(`Failed to update payment: ${error.message}`)
    }

    return { data, error: null }

  } catch (error) {
    console.error('❌ Payment update error:', error)
    return { data: null, error: { message: error.message } }
  }
}

// ============================================================================
// JOB STATUS UPDATE FUNCTIONS (For Desktop App Integration)
// ============================================================================

export const updateJobStatus = async (jobId, status, estimatedCompletion = null) => {
  try {
    console.log(`🔄 Updating job ${jobId} status to: ${status}`)
    
    if (!jobId) {
      throw new Error('Job ID is required')
    }
    
    const updateData = { 
      job_status: status,
      updated_at: new Date().toISOString()
    }
    
    if (estimatedCompletion) {
      updateData.estimated_completion = estimatedCompletion
    }
    
    const { data, error } = await supabase
      .from('print_jobs')
      .update(updateData)
      .eq('id', jobId)
      .select()
      .single()
    
    if (error) {
      console.error('❌ Job status update error:', error)
      throw new Error(`Failed to update job status: ${error.message}`)
    }
    
    console.log('✅ Job status updated successfully:', data)
    return { data, error: null }
    
  } catch (error) {
    console.error('❌ Status update error:', error)
    return { data: null, error: { message: error.message } }
  }
}

export const markJobAsCompleted = async (jobId) => {
  return await updateJobStatus(jobId, 'completed')
}

export const markJobAsPrinting = async (jobId, estimatedCompletion = null) => {
  return await updateJobStatus(jobId, 'printing', estimatedCompletion)
}

export const markJobAsCancelled = async (jobId) => {
  return await updateJobStatus(jobId, 'cancelled')
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

export const subscribeToJobUpdates = (jobId, callback) => {
  console.log('🔄 Setting up real-time subscription for job:', jobId)
  
  return supabase
    .channel(`job_updates_${jobId}`)
    .on('postgres_changes', 
      { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'print_jobs',
        filter: `id=eq.${jobId}`
      }, 
      (payload) => {
        console.log('🔄 Real-time job update received:', payload.new)
        callback(payload.new)
      }
    )
    .subscribe((status) => {
      console.log('🔄 Subscription status:', status)
    })
}

export const subscribeToAllJobUpdates = (shopId, callback) => {
  console.log('🔄 Setting up real-time subscription for shop jobs:', shopId)
  
  return supabase
    .channel(`shop_jobs_${shopId}`)
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'print_jobs',
        filter: `shop_id=eq.${shopId}`
      }, 
      (payload) => {
        console.log('🔄 Real-time shop job update:', payload)
        callback(payload)
      }
    )
    .subscribe()
}

// ============================================================================
// POLLING FUNCTIONS (Backup for real-time)
// ============================================================================

export const startJobStatusPolling = (jobId, callback, intervalMs = 30000) => {
  console.log(`🔄 Starting polling for job ${jobId} every ${intervalMs}ms`)
  
  const pollInterval = setInterval(async () => {
    try {
      const { data, error } = await getJobStatus(jobId)
      if (!error && data) {
        callback(data)
      }
    } catch (error) {
      console.error('❌ Polling error:', error)
    }
  }, intervalMs)
  
  // Return cleanup function
  return () => {
    console.log('🔄 Stopping job status polling')
    clearInterval(pollInterval)
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount)
}

export const getFileExtension = (filename) => {
  return filename.split('.').pop().toLowerCase()
}

export const isValidFileType = (filename) => {
  const validTypes = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt']
  return validTypes.includes(getFileExtension(filename))
}

// ============================================================================
// DATABASE DIAGNOSTICS
// ============================================================================

export const runDatabaseDiagnostics = async () => {
  console.log('🔧 Running comprehensive database diagnostics...')
  
  const results = {
    connection: null,
    shops: null,
    costConfigs: null,
    printJobs: null,
    storage: null
  }
  
  try {
    // Test 1: Basic connection
    results.connection = await testConnection()
    
    // Test 2: Shops table
    try {
      const { data: shops, error } = await supabase.from('shops').select('count')
      results.shops = { success: !error, data: shops, error }
    } catch (error) {
      results.shops = { success: false, error: error.message }
    }
    
    // Test 3: Cost configs table
    try {
      const { data: configs, error } = await supabase.from('cost_configs').select('count')
      results.costConfigs = { success: !error, data: configs, error }
    } catch (error) {
      results.costConfigs = { success: false, error: error.message }
    }
    
    // Test 4: Print jobs table
    try {
      const { data: jobs, error } = await supabase.from('print_jobs').select('count')
      results.printJobs = { success: !error, data: jobs, error }
    } catch (error) {
      results.printJobs = { success: false, error: error.message }
    }
    
    // Test 5: Storage bucket
    try {
      const { data: buckets, error } = await supabase.storage.listBuckets()
      results.storage = { success: !error, data: buckets, error }
    } catch (error) {
      results.storage = { success: false, error: error.message }
    }
    
    console.log('🔧 Diagnostics complete:', results)
    return results
    
  } catch (error) {
    console.error('❌ Diagnostics failed:', error)
    return { error: error.message, results }
  }
}