import React, { useState } from 'react'

const DesignMockup = () => {
  const [activeTab, setActiveTab] = useState('v1')
  const [cropActive, setCropActive] = useState(false)
  const [rotateActive, setRotateActive] = useState(false)
  
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f5', padding: '20px', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '10px', color: '#333' }}>📱 Single-Page Upload/Edit Design</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>Upload → Edit → Submit (All on ONE screen)</p>
        
        {/* Tab Navigation */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '30px', flexWrap: 'wrap' }}>
          {[
            { id: 'v1', label: 'Version 1: Your Design' },
            { id: 'v2', label: 'Version 2: Enhanced' },
            { id: 'v3', label: 'Version 3: Pro' },
            { id: 'comparison', label: 'Side-by-Side' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                background: activeTab === tab.id ? '#4F46E5' : 'white',
                color: activeTab === tab.id ? 'white' : '#666',
                border: `2px solid ${activeTab === tab.id ? '#4F46E5' : '#e5e7eb'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                fontSize: '14px'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Version 1: User's Original Design */}
        {activeTab === 'v1' && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#4F46E5', marginBottom: '15px' }}>Version 1: Your Design (Clean & Simple)</h2>
            <p style={{ color: '#666', marginBottom: '25px' }}>✅ Single screen • ✅ Live preview • ✅ Inline controls</p>
            
            <div style={{ maxWidth: '380px', margin: '0 auto', border: '3px solid #333', borderRadius: '30px', padding: '15px', background: 'white', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', color: 'white', padding: '15px', fontSize: '14px', fontWeight: '600' }}>
                  Home &gt; Place Order
                </div>
                
                {/* Content */}
                <div style={{ padding: '20px' }}>
                  {/* PDF Preview with Paper Frame */}
                  <div style={{ position: 'relative', marginBottom: '20px' }}>
                    <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '280px' }}>
                      {/* Paper Sheet */}
                      <div style={{ background: 'white', width: '180px', height: '254px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '4px', position: 'relative', display: 'flex', flexDirection: 'column', padding: '15px', gap: '8px' }}>
                        <div style={{ position: 'absolute', top: '8px', left: '8px', background: '#4F46E5', color: 'white', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>A4</div>
                        {/* Simulated PDF content */}
                        <div style={{ height: '8px', background: '#333', borderRadius: '2px' }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px', width: '80%' }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px' }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px', width: '90%' }}></div>
                        <div style={{ height: '60px', background: '#4F46E5', borderRadius: '4px', marginTop: '5px', opacity: 0.3 }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px', marginTop: '5px' }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px', width: '70%' }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px', width: '85%' }}></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Controls Row 1 */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Paper Size</div>
                      <select style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }}>
                        <option>A4 (210×297 mm)</option>
                      </select>
                    </div>
                    <div style={{ width: '80px' }}>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Fit</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', background: '#f9fafb' }}>
                        <span style={{ fontSize: '12px' }}>ON</span>
                        <div style={{ width: '36px', height: '20px', background: '#4F46E5', borderRadius: '10px', position: 'relative' }}>
                          <div style={{ position: 'absolute', right: '2px', top: '2px', width: '16px', height: '16px', background: 'white', borderRadius: '50%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Zoom */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>Zoom: 100%</div>
                    <input type="range" style={{ width: '100%' }} min="50" max="200" defaultValue="100" />
                  </div>
                  
                  {/* Action Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '15px' }}>
                    <button style={{ padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', background: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '16px' }}>✂️</span> Crop
                    </button>
                    <button style={{ padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', background: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '16px' }}>🔄</span> Rotate
                    </button>
                    <button style={{ padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', background: 'white', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', flexDirection: 'column', lineHeight: '1.2' }}>
                      <span style={{ fontSize: '14px' }}>📄📄</span>
                      <span>2 Pages</span>
                    </button>
                  </div>
                  
                  {/* Cost Display */}
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>Total: ₹1.00</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>1 page × ₹1.00 × 1 copy</div>
                  </div>
                  
                  {/* Ready Indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', padding: '8px', background: '#f0fdf4', borderRadius: '6px' }}>
                    <div style={{ width: '20px', height: '20px', background: '#10B981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: 'bold' }}>✓</div>
                    <div style={{ fontSize: '12px', color: '#10B981', fontWeight: '600' }}>Ready for instant submission!</div>
                  </div>
                  
                  {/* Submit Button */}
                  <button style={{ width: '100%', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}>
                    Submit Order
                  </button>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '30px', background: '#f0fdf4', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ color: '#10B981', marginBottom: '10px' }}>✅ Strengths</h3>
              <ul style={{ color: '#666', lineHeight: '2' }}>
                <li>Clean, uncluttered interface</li>
                <li>All controls visible at once</li>
                <li>Clear paper size and fit options</li>
                <li>Instant cost visibility</li>
              </ul>
            </div>
          </div>
        )}

        {/* Version 2: Enhanced Design */}
        {activeTab === 'v2' && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#4F46E5', marginBottom: '15px' }}>Version 2: Enhanced (Inline Editing)</h2>
            <p style={{ color: '#666', marginBottom: '25px' }}>✅ Live crop overlay • ✅ Page navigation • ✅ Color mode toggle</p>
            
            <div style={{ maxWidth: '380px', margin: '0 auto', border: '3px solid #333', borderRadius: '30px', padding: '15px', background: 'white', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', color: 'white', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>Place Order</span>
                  <span style={{ fontSize: '12px', opacity: 0.9 }}>document.pdf</span>
                </div>
                
                {/* Content */}
                <div style={{ padding: '20px' }}>
                  {/* PDF Preview with Interactive Overlay */}
                  <div style={{ position: 'relative', marginBottom: '15px' }}>
                    <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '280px', position: 'relative' }}>
                      {/* Paper Sheet */}
                      <div style={{ background: 'white', width: '180px', height: '254px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '4px', position: 'relative', display: 'flex', flexDirection: 'column', padding: '15px', gap: '8px' }}>
                        <div style={{ position: 'absolute', top: '8px', left: '8px', background: '#4F46E5', color: 'white', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>A4</div>
                        
                        {/* Simulated PDF content */}
                        <div style={{ height: '8px', background: '#333', borderRadius: '2px' }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px', width: '80%' }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px' }}></div>
                        <div style={{ height: '6px', background: '#999', borderRadius: '2px', width: '90%' }}></div>
                        <div style={{ height: '60px', background: '#4F46E5', borderRadius: '4px', marginTop: '5px', opacity: 0.3 }}></div>
                        
                        {/* Crop Overlay (if active) */}
                        {cropActive && (
                          <div style={{ position: 'absolute', inset: '30px 20px 60px 20px', border: '2px dashed #10B981', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px' }}>
                            <div style={{ position: 'absolute', top: '-8px', left: '-8px', width: '14px', height: '14px', background: '#10B981', border: '2px solid white', borderRadius: '50%' }}></div>
                            <div style={{ position: 'absolute', top: '-8px', right: '-8px', width: '14px', height: '14px', background: '#10B981', border: '2px solid white', borderRadius: '50%' }}></div>
                            <div style={{ position: 'absolute', bottom: '-8px', left: '-8px', width: '14px', height: '14px', background: '#10B981', border: '2px solid white', borderRadius: '50%' }}></div>
                            <div style={{ position: 'absolute', bottom: '-8px', right: '-8px', width: '14px', height: '14px', background: '#10B981', border: '2px solid white', borderRadius: '50%' }}></div>
                          </div>
                        )}
                      </div>
                      
                      {/* Page Navigation */}
                      <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px' }}>‹</button>
                        <span>1 of 5</span>
                        <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px' }}>›</button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Quick Settings Row */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ flex: 1, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 10px', fontSize: '11px' }}>
                      <div style={{ color: '#999', marginBottom: '2px' }}>Paper</div>
                      <select style={{ border: 'none', background: 'transparent', fontSize: '12px', fontWeight: '600', width: '100%', padding: 0 }}>
                        <option>A4</option>
                      </select>
                    </div>
                    <div style={{ flex: 1, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 10px', fontSize: '11px' }}>
                      <div style={{ color: '#999', marginBottom: '2px' }}>Color</div>
                      <select style={{ border: 'none', background: 'transparent', fontSize: '12px', fontWeight: '600', width: '100%', padding: 0 }}>
                        <option>🎨 Color</option>
                        <option>⚫ B&W</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Action Buttons with Active State */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '15px' }}>
                    <button 
                      onClick={() => setCropActive(!cropActive)}
                      style={{ 
                        padding: '10px', 
                        border: `2px solid ${cropActive ? '#10B981' : '#e5e7eb'}`, 
                        borderRadius: '8px', 
                        background: cropActive ? '#f0fdf4' : 'white', 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '5px',
                        color: cropActive ? '#10B981' : '#333'
                      }}
                    >
                      <span style={{ fontSize: '16px' }}>✂️</span> Crop
                    </button>
                    <button style={{ padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', background: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '16px' }}>🔄</span> Rotate
                    </button>
                    <button style={{ padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', background: 'white', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', flexDirection: 'column', lineHeight: '1.2' }}>
                      <span style={{ fontSize: '14px' }}>📄📄</span>
                      <span>N-up</span>
                    </button>
                  </div>
                  
                  {/* Collapsible Advanced Settings */}
                  <details style={{ marginBottom: '15px', background: '#f9fafb', borderRadius: '8px', padding: '10px' }}>
                    <summary style={{ fontSize: '12px', fontWeight: '600', color: '#666', cursor: 'pointer' }}>⚙️ Advanced Settings</summary>
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>Zoom: 100%</div>
                      <input type="range" style={{ width: '100%', marginBottom: '10px' }} min="50" max="200" defaultValue="100" />
                      
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#666' }}>
                        <input type="checkbox" defaultChecked />
                        <span>Fit to Page</span>
                      </label>
                    </div>
                  </details>
                  
                  {/* Cost Display */}
                  <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>Total: ₹5.00</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>5 pages × ₹1.00 × 1 copy</div>
                  </div>
                  
                  {/* Ready Indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', padding: '8px', background: '#f0fdf4', borderRadius: '6px' }}>
                    <div style={{ width: '20px', height: '20px', background: '#10B981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: 'bold' }}>✓</div>
                    <div style={{ fontSize: '12px', color: '#10B981', fontWeight: '600' }}>Ready to submit!</div>
                  </div>
                  
                  {/* Submit Button */}
                  <button style={{ width: '100%', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}>
                    Submit Order
                  </button>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '30px', background: '#f0fdf4', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ color: '#10B981', marginBottom: '10px' }}>✅ Improvements Over V1</h3>
              <ul style={{ color: '#666', lineHeight: '2' }}>
                <li>✂️ <strong>Live crop overlay</strong> - See crop area in real-time</li>
                <li>📄 <strong>Page navigation</strong> - Navigate multi-page PDFs (‹ 1 of 5 ›)</li>
                <li>🎨 <strong>Color mode dropdown</strong> - Quick B&W conversion</li>
                <li>⚙️ <strong>Collapsible advanced settings</strong> - Cleaner interface</li>
                <li>📱 <strong>Better mobile layout</strong> - Compact controls</li>
              </ul>
            </div>
          </div>
        )}

        {/* Version 3: Pro Design */}
        {activeTab === 'v3' && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#4F46E5', marginBottom: '15px' }}>Version 3: Pro (Maximum Features)</h2>
            <p style={{ color: '#666', marginBottom: '25px' }}>✅ Smart presets • ✅ Batch actions • ✅ Live cost updates</p>
            
            <div style={{ maxWidth: '380px', margin: '0 auto', border: '3px solid #333', borderRadius: '30px', padding: '15px', background: 'white', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', color: 'white', padding: '15px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '5px' }}>Place Order</div>
                  <div style={{ fontSize: '11px', opacity: 0.9 }}>document.pdf • 5 pages • 2.1 MB</div>
                </div>
                
                {/* Content */}
                <div style={{ padding: '20px' }}>
                  {/* Quick Presets */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '15px' }}>
                    <button style={{ padding: '12px', border: '2px solid #4F46E5', borderRadius: '8px', background: '#EEF2FF', fontSize: '12px', fontWeight: '600', cursor: 'pointer', color: '#4F46E5' }}>
                      ⚡ Quick Print
                    </button>
                    <button style={{ padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', background: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                      💰 Economy
                    </button>
                  </div>
                  
                  {/* PDF Preview with Interactive Overlay */}
                  <div style={{ position: 'relative', marginBottom: '15px' }}>
                    <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '240px', position: 'relative' }}>
                      {/* Paper Sheet */}
                      <div style={{ background: 'white', width: '160px', height: '226px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '4px', position: 'relative', display: 'flex', flexDirection: 'column', padding: '12px', gap: '6px' }}>
                        <div style={{ position: 'absolute', top: '6px', left: '6px', background: '#4F46E5', color: 'white', fontSize: '9px', padding: '2px 6px', borderRadius: '3px', fontWeight: 'bold' }}>A4</div>
                        
                        {/* Simulated PDF content */}
                        <div style={{ height: '6px', background: '#333', borderRadius: '2px' }}></div>
                        <div style={{ height: '5px', background: '#999', borderRadius: '2px', width: '80%' }}></div>
                        <div style={{ height: '5px', background: '#999', borderRadius: '2px' }}></div>
                        <div style={{ height: '50px', background: '#4F46E5', borderRadius: '3px', marginTop: '4px', opacity: 0.3 }}></div>
                      </div>
                      
                      {/* Page Navigation with Thumbnail Strip */}
                      <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '8px 12px', borderRadius: '20px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px' }}>‹</button>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <div style={{ width: '6px', height: '6px', background: '#4F46E5', borderRadius: '50%' }}></div>
                          <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.3)', borderRadius: '50%' }}></div>
                          <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.3)', borderRadius: '50%' }}></div>
                          <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.3)', borderRadius: '50%' }}></div>
                          <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.3)', borderRadius: '50%' }}></div>
                        </div>
                        <button style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px' }}>›</button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Tabbed Controls */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid #e5e7eb', marginBottom: '12px' }}>
                      <button style={{ padding: '8px 12px', border: 'none', background: 'transparent', fontSize: '12px', fontWeight: '600', color: '#4F46E5', borderBottom: '2px solid #4F46E5', marginBottom: '-2px', cursor: 'pointer' }}>Basic</button>
                      <button style={{ padding: '8px 12px', border: 'none', background: 'transparent', fontSize: '12px', color: '#999', cursor: 'pointer' }}>Layout</button>
                      <button style={{ padding: '8px 12px', border: 'none', background: 'transparent', fontSize: '12px', color: '#999', cursor: 'pointer' }}>Advanced</button>
                    </div>
                    
                    {/* Basic Tab Content */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#999', marginBottom: '4px' }}>Paper Size</div>
                        <select style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '11px' }}>
                          <option>A4</option>
                          <option>A5</option>
                          <option>Letter</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#999', marginBottom: '4px' }}>Color Mode</div>
                        <select style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '11px' }}>
                          <option>🎨 Color</option>
                          <option>⚫ B&W</option>
                          <option>🌫️ Grayscale</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      <button style={{ padding: '10px 6px', border: '2px solid #e5e7eb', borderRadius: '6px', background: 'white', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                        <span style={{ fontSize: '16px' }}>✂️</span>
                        <span>Crop</span>
                      </button>
                      <button style={{ padding: '10px 6px', border: '2px solid #e5e7eb', borderRadius: '6px', background: 'white', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                        <span style={{ fontSize: '16px' }}>🔄</span>
                        <span>Rotate</span>
                      </button>
                      <button style={{ padding: '10px 6px', border: '2px solid #e5e7eb', borderRadius: '6px', background: 'white', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                        <span style={{ fontSize: '16px' }}>📄</span>
                        <span>N-up</span>
                      </button>
                      <button style={{ padding: '10px 6px', border: '2px solid #e5e7eb', borderRadius: '6px', background: 'white', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                        <span style={{ fontSize: '16px' }}>⚙️</span>
                        <span>More</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* Batch Actions Bar */}
                  <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '10px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#92400E' }}>
                      <strong>Apply to all pages?</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={{ padding: '4px 10px', background: 'white', border: '1px solid #ddd', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>No</button>
                      <button style={{ padding: '4px 10px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>Yes</button>
                    </div>
                  </div>
                  
                  {/* Cost Display with Breakdown */}
                  <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', color: 'white', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', opacity: 0.9 }}>Base cost</span>
                      <span style={{ fontSize: '11px', opacity: 0.9 }}>₹5.00</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.3)' }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Total</span>
                      <span style={{ fontSize: '14px', fontWeight: 'bold' }}>₹5.00</span>
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '4px' }}>5 pages × ₹1.00 × 1 copy</div>
                  </div>
                  
                  {/* Submit Button with Icon */}
                  <button style={{ width: '100%', background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 8px rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span>Submit Order</span>
                    <span style={{ fontSize: '18px' }}>🚀</span>
                  </button>
                  
                  {/* Quick Link */}
                  <div style={{ textAlign: 'center', marginTop: '10px' }}>
                    <a href="#" style={{ fontSize: '11px', color: '#4F46E5', textDecoration: 'none' }}>or view all pages in grid →</a>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '30px', background: '#f0fdf4', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ color: '#10B981', marginBottom: '10px' }}>✅ Pro Features</h3>
              <ul style={{ color: '#666', lineHeight: '2' }}>
                <li>⚡ <strong>Smart presets</strong> - "Quick Print" vs "Economy" mode</li>
                <li>📑 <strong>Tabbed controls</strong> - Basic, Layout, Advanced</li>
                <li>🔄 <strong>Batch actions</strong> - "Apply to all pages?" prompt</li>
                <li>💰 <strong>Cost breakdown</strong> - Transparent pricing</li>
                <li>📊 <strong>Thumbnail dots</strong> - Visual page indicator</li>
                <li>🔗 <strong>Grid escape hatch</strong> - Link to full grid if needed</li>
              </ul>
            </div>
          </div>
        )}

        {/* Side-by-Side Comparison */}
        {activeTab === 'comparison' && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#4F46E5', marginBottom: '25px', textAlign: 'center' }}>Feature Comparison</h2>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: '600' }}>Feature</th>
                  <th style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: '600' }}>V1<br/>(Simple)</th>
                  <th style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: '600' }}>V2<br/>(Enhanced)</th>
                  <th style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb', fontWeight: '600' }}>V3<br/>(Pro)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>Live PDF preview</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>Crop/Rotate/N-up controls</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>Paper size selector</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>Total cost display</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr style={{ background: '#fffbeb' }}>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}><strong>Live crop overlay</strong></td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr style={{ background: '#fffbeb' }}>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}><strong>Page navigation</strong> (‹ 1 of 5 ›)</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr style={{ background: '#fffbeb' }}>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}><strong>Color mode dropdown</strong></td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr style={{ background: '#fffbeb' }}>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}><strong>Collapsible settings</strong></td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                </tr>
                <tr style={{ background: '#fef3c7' }}>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}><strong>Smart presets</strong> (Quick/Economy)</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr style={{ background: '#fef3c7' }}>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}><strong>Tabbed controls</strong></td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr style={{ background: '#fef3c7' }}>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}><strong>Batch actions</strong> (Apply to all)</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
                <tr style={{ background: '#fef3c7' }}>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}><strong>Cost breakdown</strong></td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center' }}>❌</td>
                  <td style={{ padding: '12px', border: '1px solid #e5e7eb', textAlign: 'center', background: '#f0fdf4' }}>✅</td>
                </tr>
              </tbody>
            </table>
            
            <div style={{ marginTop: '30px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '8px', border: '2px solid #10B981' }}>
                <h3 style={{ color: '#10B981', marginBottom: '10px' }}>✅ Version 1</h3>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}><strong>Best for:</strong> Quick implementation</p>
                <ul style={{ fontSize: '12px', color: '#666', lineHeight: '1.8', paddingLeft: '20px' }}>
                  <li>Clean & simple</li>
                  <li>Fastest to build</li>
                  <li>All essential features</li>
                </ul>
              </div>
              
              <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '8px', border: '3px solid #10B981' }}>
                <h3 style={{ color: '#10B981', marginBottom: '10px' }}>⭐ Version 2</h3>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}><strong>Best for:</strong> Mobile UX (RECOMMENDED)</p>
                <ul style={{ fontSize: '12px', color: '#666', lineHeight: '1.8', paddingLeft: '20px' }}>
                  <li><strong>Best balance</strong></li>
                  <li>Live interactions</li>
                  <li>Multi-page support</li>
                  <li>Clean interface</li>
                </ul>
              </div>
              
              <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '8px', border: '2px solid #10B981' }}>
                <h3 style={{ color: '#10B981', marginBottom: '10px' }}>🚀 Version 3</h3>
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}><strong>Best for:</strong> Power users</p>
                <ul style={{ fontSize: '12px', color: '#666', lineHeight: '1.8', paddingLeft: '20px' }}>
                  <li>Maximum features</li>
                  <li>Presets & batch ops</li>
                  <li>More complex UI</li>
                </ul>
              </div>
            </div>
          </div>
        )}
        
        {/* Recommendation */}
        <div style={{ marginTop: '30px', background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)', color: 'white', borderRadius: '12px', padding: '30px', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '15px' }}>💡 My Recommendation</h2>
          <p style={{ fontSize: '18px', marginBottom: '20px' }}><strong>Start with Version 2 (Enhanced)</strong></p>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px', padding: '20px', textAlign: 'left' }}>
            <p style={{ marginBottom: '15px', lineHeight: '1.8' }}>
              <strong>Why Version 2?</strong><br/>
              • Perfect balance of simplicity and functionality<br/>
              • Live crop overlay for visual feedback<br/>
              • Page navigation for multi-page PDFs<br/>
              • Quick color mode switching<br/>
              • Collapsible advanced settings keep it clean<br/>
              • 99% mobile users will love the inline editing
            </p>
            <p style={{ lineHeight: '1.8', opacity: 0.9 }}>
              <strong>Implementation:</strong> We can build V2 first, then add V3 features (presets, batch actions) later based on user feedback.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DesignMockup
