import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ShopPage from './pages/ShopPage'
import OrderPage from './pages/OrderPage'
import PaymentPage from './pages/PaymentPage'
import StatusPage from './pages/StatusPage'
import DesignMockup from './pages/DesignMockup'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/design-mockup" element={<DesignMockup />} />
        <Route path="/shop/:shopId" element={<OrderPage />} />
        <Route path="/shop/:shopId/order" element={<OrderPage />} />
        <Route path="/payment/:jobId" element={<PaymentPage />} />
        <Route path="/status/:jobId" element={<StatusPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
