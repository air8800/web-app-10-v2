import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getAllActiveShops } from '../utils/supabase'
import { Printer, Search, Store, Clock, Star, MapPin, Phone, ArrowRight, Zap, Shield, Award, Globe, Upload, Settings, FileCheck, Package, Mail, Facebook, Twitter, Instagram, Linkedin, Sparkles } from 'lucide-react'

const HomePage = () => {
  const [shops, setShops] = useState([])
  const [recentShops, setRecentShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const howItWorksRef = useRef(null)

  useEffect(() => {
    loadShops()
    loadRecentShops()
  }, [])

  const loadShops = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await getAllActiveShops()

      if (error) {
        throw new Error(`Failed to load shops: ${error.message}`)
      }

      setShops(data || [])

    } catch (error) {
      console.error('Error loading shops:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const loadRecentShops = () => {
    try {
      const recent = JSON.parse(localStorage.getItem('recentShops') || '[]')
      setRecentShops(recent)
    } catch (error) {
      console.error('❌ Error loading recent shops:', error)
    }
  }

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const filteredShops = shops.filter(shop => 
    shop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    shop.address.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const features = [
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Get your documents printed in under 15 minutes"
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "Your files are encrypted and auto-deleted after printing"
    },
    {
      icon: Globe,
      title: "Wide Network",
      description: "Access hundreds of print shops across the city"
    },
    {
      icon: Award,
      title: "Quality Guaranteed",
      description: "Professional printing with satisfaction guarantee"
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10" />
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-20 sm:py-32">
          <div className="text-center animate-fadeInUp">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full border border-blue-200/50 mb-8">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">Trusted by 50,000+ users</span>
            </div>

            {/* Main Heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
              Print Anywhere,
              <span className="gradient-text block">Anytime</span>
            </h1>

            <p className="text-base sm:text-lg lg:text-xl text-gray-600 max-w-3xl mx-auto mb-8 sm:mb-12 leading-relaxed px-4">
              Connect with local print shops. Upload and collect your documents instantly.
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto mb-12">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-6 w-6 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search print shops by name or location..."
                  className="w-full pl-12 pr-6 py-4 text-lg bg-white/90 backdrop-blur-sm border border-gray-200/50 rounded-2xl shadow-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 placeholder-gray-400"
                />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none" />
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-4">
              <a href="#all-shops" className="btn-primary text-sm sm:text-base px-6 py-3 sm:px-8 sm:py-4 w-full sm:w-auto inline-flex items-center justify-center">
                Find Print Shops
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
              </a>
              <button onClick={scrollToHowItWorks} className="btn-secondary text-sm sm:text-base px-6 py-3 sm:px-8 sm:py-4 w-full sm:w-auto">
                How it Works
              </button>
            </div>
          </div>
        </div>

        {/* Floating Elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-blue-500/10 rounded-full animate-float" />
        <div className="absolute top-40 right-20 w-16 h-16 bg-purple-500/10 rounded-full animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-20 left-1/4 w-12 h-12 bg-indigo-500/10 rounded-full animate-float" style={{ animationDelay: '4s' }} />
      </div>


      <div className="max-w-7xl mx-auto px-4 py-16">

        {/* Loading State */}
        {loading && (
          <div className="text-center py-20 animate-fadeInUp">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mx-auto mb-6 flex items-center justify-center animate-pulse-glow">
              <Printer className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Loading Print Shops</h3>
            <p className="text-gray-600">Connecting to our network of trusted partners...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="text-center py-20 animate-fadeInUp">
            <div className="w-16 h-16 bg-red-100 rounded-2xl mx-auto mb-6 flex items-center justify-center">
              <Store className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Unable to Load Shops</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">{error}</p>
            <button
              onClick={loadShops}
              className="btn-primary"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Recent Shops */}
        {!loading && !error && recentShops.length > 0 && (
          <div className="mb-16 animate-fadeInUp">
            <div className="flex items-center gap-3 mb-8">
              <div className="feature-icon">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Recently Visited</h2>
                <p className="text-sm sm:text-base text-gray-600">Your recent visits</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentShops.map((shop, index) => (
                <Link
                  key={shop.id}
                  to={`/shop/${shop.id}`}
                  className="print-card card-hover animate-slideInRight"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Printer className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-gray-900 mb-1 truncate">{shop.name}</h3>
                      <div className="flex items-center gap-1 text-gray-600 mb-2">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm truncate">{shop.address}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span className="text-gray-700">4.8</span>
                        </div>
                        <span className="text-green-600 font-medium">Open</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Shops */}
        {!loading && !error && (
          <div className="animate-fadeInUp" id="all-shops">
            <div className="flex items-center gap-3 mb-8">
              <div className="feature-icon">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">All Print Shops</h2>
                <p className="text-sm sm:text-base text-gray-600">Trusted printing partners</p>
              </div>
            </div>
            
            {filteredShops.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredShops.map((shop, index) => (
                  <Link
                    key={shop.id}
                    to={`/shop/${shop.id}`}
                    className="print-card card-hover animate-slideInRight"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Printer className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-lg text-gray-900 mb-1">{shop.name}</h3>
                        <div className="flex items-center gap-1 text-gray-600 mb-2">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm">{shop.address}</span>
                        </div>
                        <div className="flex items-center gap-1 text-blue-600 mb-3">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm font-medium">{shop.phone}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm font-medium text-gray-700">4.8</span>
                        </div>
                        <span className="status-badge bg-green-100 text-green-800">Open</span>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 print-card">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl mx-auto mb-6 flex items-center justify-center">
                  <Store className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">No Shops Found</h3>
                <p className="text-gray-600 mb-8">
                  {searchTerm ? `No shops matching "${searchTerm}"` : 'No shops available at the moment'}
                </p>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="btn-secondary"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* How to Use Section */}
        <div ref={howItWorksRef} className="py-20 animate-fadeInUp" id="how-it-works">
          <div className="text-center mb-12 sm:mb-16 px-4">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">How It Works</h2>
            <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-3xl mx-auto">
              Get your documents printed in just a few simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8 mb-16">
            <div className="text-center print-card card-hover">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <Store className="w-8 h-8 text-white" />
              </div>
              <div className="w-8 h-8 bg-blue-600 text-white rounded-full mx-auto mb-4 flex items-center justify-center font-bold text-sm">1</div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Choose Shop</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Browse and select from our network of trusted print shops near you</p>
            </div>

            <div className="text-center print-card card-hover">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <Upload className="w-8 h-8 text-white" />
              </div>
              <div className="w-8 h-8 bg-green-600 text-white rounded-full mx-auto mb-4 flex items-center justify-center font-bold text-sm">2</div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Upload Files</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Upload your PDF or image files. Multiple files and formats supported</p>
            </div>

            <div className="text-center print-card card-hover">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <Settings className="w-8 h-8 text-white" />
              </div>
              <div className="w-8 h-8 bg-purple-600 text-white rounded-full mx-auto mb-4 flex items-center justify-center font-bold text-sm">3</div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Configure</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Choose page size, color mode, copies, and other print options</p>
            </div>

            <div className="text-center print-card card-hover">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <FileCheck className="w-8 h-8 text-white" />
              </div>
              <div className="w-8 h-8 bg-orange-600 text-white rounded-full mx-auto mb-4 flex items-center justify-center font-bold text-sm">4</div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Submit Order</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Review your order details and submit with your contact information</p>
            </div>

            <div className="text-center print-card card-hover">
              <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div className="w-8 h-8 bg-red-600 text-white rounded-full mx-auto mb-4 flex items-center justify-center font-bold text-sm">5</div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Collect Prints</h3>
              <p className="text-gray-600 text-sm leading-relaxed">Visit the shop and collect your professionally printed documents</p>
            </div>
          </div>

          <div className="glass-card bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-8 sm:p-12 rounded-2xl">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">Powerful Features</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                    <Printer className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-2">PDF & Image Support</h4>
                  <p className="text-gray-600 text-sm">Upload PDFs, JPG, PNG files with built-in editor for adjustments</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center">
                    <Settings className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Flexible Page Sizes</h4>
                  <p className="text-gray-600 text-sm">A3, A4, A5, Letter, Legal and more international paper sizes</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Color & Black/White</h4>
                  <p className="text-gray-600 text-sm">Choose between color or B&W printing with instant preview</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Advanced Options</h4>
                  <p className="text-gray-600 text-sm">Page selection, N-up printing, single/double-sided options</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="py-20 animate-fadeInUp">
          <div className="text-center mb-12 sm:mb-16 px-4">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Why Choose Us?</h2>
            <p className="text-sm sm:text-base lg:text-lg text-gray-600 max-w-3xl mx-auto">
              Innovative platform designed for modern needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="text-center print-card card-hover animate-slideInRight"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="feature-icon mx-auto mb-6">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 mt-20">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {/* Company Info */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Printer className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-white font-bold text-lg">PrintFlow Pro</h3>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Your trusted platform for convenient printing services. Connect with local print shops and get your documents printed quickly.
              </p>
              <div className="flex gap-3">
                <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
                  <Facebook className="w-4 h-4" />
                </a>
                <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
                  <Twitter className="w-4 h-4" />
                </a>
                <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
                  <Instagram className="w-4 h-4" />
                </a>
                <a href="#" className="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
                  <Linkedin className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-white font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#all-shops" className="hover:text-blue-400 transition-colors">Find Shops</a>
                </li>
                <li>
                  <button onClick={scrollToHowItWorks} className="hover:text-blue-400 transition-colors">How It Works</button>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">Features</a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">Pricing</a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">About Us</a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">Terms of Service</a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">Privacy Policy</a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">Cookie Policy</a>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white font-semibold mb-4">Contact Us</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <a href="mailto:support@printflowpro.com" className="hover:text-blue-400 transition-colors">
                    support@printflowpro.com
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <a href="tel:+1234567890" className="hover:text-blue-400 transition-colors">
                    +1 (234) 567-890
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>123 Print Street, City, Country</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Design Preview Button */}
          <div className="mb-8">
            <Link
              to="/design-mockup"
              className="block w-full sm:w-auto mx-auto text-center bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-4 rounded-xl font-semibold text-sm shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            >
              🎨 View New Design Mockups
            </Link>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-gray-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-400">
                © {new Date().getFullYear()} PrintFlow Pro. All rights reserved.
              </p>
              <div className="flex gap-6 text-sm">
                <a href="#" className="hover:text-blue-400 transition-colors">Terms</a>
                <a href="#" className="hover:text-blue-400 transition-colors">Privacy</a>
                <a href="#" className="hover:text-blue-400 transition-colors">Cookies</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default HomePage