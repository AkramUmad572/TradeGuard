import React, { useState, useEffect } from 'react';
import CandlestickTerrain from './CandlestickTerrain';
import './Landing.css';

export default function Landing({ onEnter, onSearch }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // Fade in content after mount
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      handleEnter(searchQuery.trim());
    }
  };

  const handleEnter = (query = '') => {
    setIsTransitioning(true);
    
    // Wait for transition animation
    setTimeout(() => {
      if (query) {
        onSearch(query);
      } else {
        onEnter();
      }
    }, 800);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch(e);
    }
  };

  const suggestions = [
    'Bitcoin',
    'Trump',
    'Elections',
    'Fed Rate',
    'AI',
    'Crypto'
  ];

  return (
    <div className={`landing-container ${isTransitioning ? 'transitioning' : ''}`}>
      {/* 3D Background */}
      <CandlestickTerrain />
      
      {/* Overlay gradient */}
      <div className="landing-overlay" />
      
      {/* Content */}
      <div className={`landing-content ${showContent ? 'visible' : ''}`}>
        {/* Logo/Title */}
        <div className="landing-header">
          <div className="landing-logo">
            <svg className="logo-icon-large" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="url(#landing-shield-gradient)" stroke="currentColor"/>
              <defs>
                <linearGradient id="landing-shield-gradient" x1="4" y1="2" x2="20" y2="22">
                  <stop offset="0%" stopColor="rgba(0,255,136,0.4)"/>
                  <stop offset="100%" stopColor="rgba(0,200,255,0.15)"/>
                </linearGradient>
              </defs>
            </svg>
            <h1 className="landing-title">TRADEGUARD</h1>
          </div>
          <p className="landing-subtitle">
            Uncover suspicious trading patterns in prediction markets using 
            <span className="highlight"> quantitative analysis</span>
          </p>
        </div>

        {/* Search Box */}
        <div className="landing-search-container">
          <form onSubmit={handleSearch} className="landing-search-form">
            <div className="landing-input-wrapper">
              <span className="landing-search-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search any market... bitcoin, trump, elections..."
                className="landing-search-input"
                autoFocus
              />
              <button type="submit" className="landing-search-btn">
                ANALYZE
              </button>
            </div>
          </form>

          {/* Quick suggestions */}
          <div className="landing-suggestions">
            <span className="suggestions-label">Popular:</span>
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                className="suggestion-pill"
                onClick={() => handleEnter(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="landing-features">
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18"/>
                <path d="M18 9l-5 5-4-4-3 3"/>
              </svg>
            </div>
            <div className="feature-text">
              <h3>14 Detection Signals</h3>
              <p>VPIN, Benford's Law, Kyle's Lambda & more</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div className="feature-text">
              <h3>Real-Time Analysis</h3>
              <p>Live Kalshi market data</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="6"/>
                <circle cx="12" cy="12" r="2"/>
              </svg>
            </div>
            <div className="feature-text">
              <h3>Risk Scoring</h3>
              <p>Quantitative suspicion rating</p>
            </div>
          </div>
        </div>

        {/* Enter without search */}
        <button className="enter-btn" onClick={() => handleEnter()}>
          Browse All Markets →
        </button>

        {/* Footer */}
        <div className="landing-footer">
          <span>Delta Hacks 12</span>
          <span className="separator">•</span>
          <span>Powered by Kalshi API</span>
        </div>
      </div>

      {/* Transition overlay */}
      <div className={`transition-overlay ${isTransitioning ? 'active' : ''}`}>
        <div className="transition-scanner">
          <div className="scanner-line" />
        </div>
        <span className="transition-text">Initializing Analysis...</span>
      </div>
    </div>
  );
}
