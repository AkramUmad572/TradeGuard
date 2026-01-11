import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import './App.css';

const API_BASE = '/api';

const CATEGORIES = [
  'All',
  'Politics',
  'Crypto',
  'Sports',
  'Economics',
  'Climate and Weather',
  'World',
  'Science and Technology',
  'Companies',
  'Entertainment',
  'Health',
  'Elections'
];

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [events, setEvents] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState(null);
  const [marketDetails, setMarketDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ total: 0, returned: 0 });
  const [showModal, setShowModal] = useState(false);
  const [insiderAnalysis, setInsiderAnalysis] = useState(null);
  const [analyzingInsider, setAnalyzingInsider] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'analysis', 'trades'
  
  // Autocomplete state
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const searchWrapperRef = useRef(null);
  const autocompleteTimeoutRef = useRef(null);
  const autocompleteItemRefs = useRef([]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const exportReport = (analysis, market) => {
    const report = {
      title: 'Insider Trading Detection Report',
      generatedAt: new Date().toISOString(),
      market: {
        ticker: market?.ticker,
        title: market?.title,
        status: market?.status,
        closeTime: market?.close_time
      },
      riskAssessment: {
        score: analysis.suspicionScore,
        riskLevel: analysis.riskLevel,
        confidence: analysis.confidence,
        summary: analysis.summary
      },
      metrics: analysis.metrics,
      triggeredSignals: analysis.signals?.map(s => ({
        signal: s.type,
        severity: s.severity,
        description: s.description,
        data: s.data
      })),
      allSignals: analysis.allSignals?.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        weight: s.weight,
        triggered: s.triggered,
        severity: s.severity,
        result: s.result
      })),
      methodology: 'Quantitative analysis using 14 signals based on market microstructure research'
    };

    // Generate readable text report
    let textReport = `
╔══════════════════════════════════════════════════════════════════╗
║           INSIDER TRADING DETECTION REPORT                       ║
╚══════════════════════════════════════════════════════════════════╝

Generated: ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MARKET INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ticker:     ${market?.ticker || 'N/A'}
Title:      ${market?.title || 'N/A'}
Status:     ${market?.status || 'N/A'}
Close Time: ${market?.close_time ? new Date(market.close_time).toLocaleString() : 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RISK ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Suspicion Score: ${analysis.suspicionScore}/100
Risk Level:      ${analysis.riskLevel}
Confidence:      ${analysis.confidence}%

Summary: ${analysis.summary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYSIS METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Trades:      ${analysis.metrics?.totalTrades || 0}
Avg Trade Size:    ${analysis.metrics?.avgTradeSize || 0}
Time Span:         ${analysis.metrics?.timeSpan || 'N/A'}
Signals Analyzed:  ${analysis.metrics?.signalsAnalyzed || 0}
Signals Triggered: ${analysis.metrics?.signalsTriggered || 0}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRIGGERED SIGNALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    if (analysis.signals && analysis.signals.length > 0) {
      analysis.signals.forEach((s, i) => {
        textReport += `
${i + 1}. ${s.type.replace(/_/g, ' ')}
   Severity: ${'●'.repeat(s.severity)}${'○'.repeat(5 - s.severity)} (${s.severity}/5)
   ${s.description}
`;
      });
    } else {
      textReport += '\nNo suspicious signals detected.\n';
    }

    textReport += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALL SIGNALS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    const categories = ['Timing', 'Order Flow', 'Price', 'Size', 'Statistical'];
    categories.forEach(cat => {
      const catSignals = analysis.allSignals?.filter(s => s.category === cat) || [];
      if (catSignals.length > 0) {
        textReport += `\n[${cat.toUpperCase()}]\n`;
        catSignals.forEach(s => {
          const status = s.triggered ? `⚠ TRIGGERED (${s.severity}/5)` : '✓ Normal';
          textReport += `  ${s.name}: ${status}\n`;
        });
      }
    });

    textReport += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
METHODOLOGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This analysis uses 14 quantitative signals based on market microstructure
research, including:
- VPIN (Volume-Synchronized Probability of Informed Trading)
- Shannon entropy for timing analysis  
- Benford's Law for trade size distribution
- Kyle's Lambda for price impact measurement
- Run-length analysis for directional pressure

Risk Thresholds:
  0-17:  LOW      - Normal trading patterns
  18-34: MEDIUM   - Minor irregularities
  35-54: HIGH     - Significant anomalies  
  55+:   CRITICAL - Strong evidence of insider trading

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     Delta Hacks 12 - Insider Trading Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    // Create download
    const blob = new Blob([textReport], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insider-trading-report-${market?.ticker || 'analysis'}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    loadSuggestions();
    loadEvents();
  }, []);

  useEffect(() => {
    loadEvents();
  }, [activeCategory]);

  // Autocomplete: fetch suggestions as user types
  useEffect(() => {
    if (autocompleteTimeoutRef.current) {
      clearTimeout(autocompleteTimeoutRef.current);
    }

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setAutocompleteResults([]);
      setShowAutocomplete(false);
      setSelectedIndex(-1);
      autocompleteItemRefs.current = [];
      return;
    }

    autocompleteTimeoutRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set('query', trimmedQuery);
        params.set('limit', '8'); // Limit to top 8 results

        const response = await fetch(`${API_BASE}/search?${params}`);
        const data = await response.json();

        if (response.ok && data.events) {
          // Extract unique suggestions with title and category
          const uniqueSuggestions = [];
          const seenTitles = new Set();

          for (const event of data.events) {
            if (!seenTitles.has(event.title)) {
              seenTitles.add(event.title);
              uniqueSuggestions.push({
                title: event.title,
                category: event.category || 'Uncategorized',
                event_ticker: event.event_ticker
              });
              if (uniqueSuggestions.length >= 8) break;
            }
          }

          setAutocompleteResults(uniqueSuggestions);
          setShowAutocomplete(uniqueSuggestions.length > 0);
          setSelectedIndex(-1);
        }
      } catch (err) {
        console.error('Autocomplete error:', err);
        setAutocompleteResults([]);
        setShowAutocomplete(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (autocompleteTimeoutRef.current) {
        clearTimeout(autocompleteTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setShowAutocomplete(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && autocompleteItemRefs.current[selectedIndex]) {
      autocompleteItemRefs.current[selectedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedIndex]);

  const loadSuggestions = async () => {
    try {
      const response = await fetch(`${API_BASE}/suggestions`);
      const data = await response.json();
      if (response.ok) {
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    }
  };

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = activeCategory === 'All' 
        ? `${API_BASE}/search?limit=100`
        : `${API_BASE}/search?category=${encodeURIComponent(activeCategory)}&limit=100`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok) {
        setEvents(data.events || []);
        setStats({ total: data.total, returned: data.returned });
      } else {
        throw new Error(data.error || 'Failed to load events');
      }
    } catch (err) {
      setError(err.message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('query', searchQuery.trim());
      if (activeCategory !== 'All') params.set('category', activeCategory);
      params.set('limit', '100');

      const response = await fetch(`${API_BASE}/search?${params}`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Search failed');
      
      setEvents(data.events || []);
      setStats({ total: data.total, returned: data.returned });
    } catch (err) {
      setError(err.message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion.title);
    setActiveCategory('All');
    setShowAutocomplete(false);
    setSelectedIndex(-1);
    setTimeout(() => {
      document.querySelector('.search-form')?.dispatchEvent(new Event('submit', { bubbles: true }));
    }, 100);
  };

  const handleAutocompleteSelect = (suggestion) => {
    if (suggestion) {
      handleSuggestionClick(suggestion);
    }
  };

  const handleKeyDown = (e) => {
    if (!showAutocomplete || autocompleteResults.length === 0) {
      return; // Allow normal form submission
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < autocompleteResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        // Only intercept if user navigated with arrow keys
        if (selectedIndex >= 0 && selectedIndex < autocompleteResults.length) {
          e.preventDefault();
          handleAutocompleteSelect(autocompleteResults[selectedIndex]);
        } else {
          // Close autocomplete but allow normal form submission
          setShowAutocomplete(false);
          setSelectedIndex(-1);
          // Don't prevent default - let form submit with current query
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowAutocomplete(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleCategoryClick = (category) => {
    setActiveCategory(category);
    setSearchQuery('');
  };

  const fetchMarketDetails = async (ticker) => {
    setDetailsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/markets/${ticker}/full`);
      const data = await response.json();
      
      if (response.ok) {
        setMarketDetails(data);
      }
    } catch (err) {
      console.error('Error fetching market details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSelectMarket = (market) => {
    setSelectedMarket(market);
    setShowModal(true);
    fetchMarketDetails(market.ticker);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedMarket(null);
    setMarketDetails(null);
    setInsiderAnalysis(null);
    setActiveTab('overview');
    setExpandedCategories({});
  };

  const analyzeForInsiderTrading = async (ticker) => {
    setAnalyzingInsider(true);
    setInsiderAnalysis(null);
    
    try {
      const response = await fetch(`${API_BASE}/markets/${ticker}/analyze`);
      const data = await response.json();
      
      if (response.ok) {
        setInsiderAnalysis(data.analysis);
      }
    } catch (err) {
      console.error('Error analyzing market:', err);
    } finally {
      setAnalyzingInsider(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setActiveCategory('All');
    setShowAutocomplete(false);
    setSelectedIndex(-1);
    loadEvents();
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <h1>INSIDER DETECTOR</h1>
          </div>
          <p className="tagline">Kalshi Market Explorer • DeltaHacks 12</p>
        </div>
      </header>

      <main className="main">
        {/* Category Tabs */}
        <nav className="category-tabs">
          {CATEGORIES.map(category => (
            <button
              key={category}
              className={`category-tab ${activeCategory === category ? 'active' : ''}`}
              onClick={() => handleCategoryClick(category)}
            >
              {category}
            </button>
          ))}
        </nav>

        {/* Search Section */}
        <section className="search-section">
          <form onSubmit={handleSearch} className="search-form">
            <div className="search-input-wrapper" ref={searchWrapperRef}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowAutocomplete(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (autocompleteResults.length > 0 && searchQuery.trim().length >= 2) {
                    setShowAutocomplete(true);
                  }
                }}
                placeholder="Search any market... bitcoin, trump, earthquake, AI..."
                className="search-input"
              />
              {searchQuery && (
                <button type="button" className="clear-btn" onClick={() => {
                  clearSearch();
                  setShowAutocomplete(false);
                  setSelectedIndex(-1);
                }}>✕</button>
              )}
              
              {/* Autocomplete Dropdown */}
              {showAutocomplete && autocompleteResults.length > 0 && (
                <div className="autocomplete-dropdown">
                  {autocompleteResults.map((result, index) => (
                    <button
                      key={`${result.event_ticker || index}-${result.title}`}
                      ref={(el) => (autocompleteItemRefs.current[index] = el)}
                      type="button"
                      className={`autocomplete-item ${selectedIndex === index ? 'selected' : ''}`}
                      onClick={() => handleAutocompleteSelect(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <span className="autocomplete-title">{result.title}</span>
                      <span className="autocomplete-category">{result.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" className="search-button" disabled={loading}>
              {loading ? 'SEARCHING...' : 'SEARCH'}
            </button>
          </form>
        </section>

        {/* Suggestion Chips */}
        {suggestions.length > 0 && !searchQuery && (
          <section className="suggestions-section">
            <div className="suggestions-label">Trending:</div>
            <div className="suggestions-chips">
              {suggestions.slice(0, 8).map((suggestion, idx) => (
                <button
                  key={idx}
                  className="suggestion-chip"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion.title.length > 35 
                    ? suggestion.title.substring(0, 35) + '...' 
                    : suggestion.title}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Stats Bar */}
        <div className="stats-bar">
          <span className="stats-category">{activeCategory}</span>
          <span className="stats-count">
            {stats.total > 0 && `Showing ${stats.returned} of ${stats.total} events`}
            {searchQuery && ` matching "${searchQuery}"`}
          </span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="error-banner">
            <span className="error-icon">⚠</span>
            {error}
          </div>
        )}

        {/* Events Grid */}
        <section className="events-section">
          {loading && events.length === 0 && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading markets...</p>
            </div>
          )}

          {!loading && events.length === 0 && (
            <div className="empty-state">
              <p>No markets found</p>
              <p className="hint">Try a different search term or category</p>
            </div>
          )}

          <div className="events-grid">
            {events.map((event, eventIdx) => (
              <div key={event.event_ticker || eventIdx} className="event-card">
                <div className="event-header">
                  <span className="event-category">{event.category}</span>
                  {event.markets?.length > 1 && (
                    <span className="market-count">{event.markets.length} markets</span>
                  )}
                </div>
                <h3 className="event-title">{event.title}</h3>
                {event.sub_title && <p className="event-subtitle">{event.sub_title}</p>}
                
                <div className="markets-list">
                  {(event.markets || []).slice(0, 5).map((market) => (
                    <div
                      key={market.ticker}
                      className="market-row"
                      onClick={() => handleSelectMarket(market)}
                    >
                      <div className="market-info">
                        <span className="market-subtitle">
                          {market.yes_sub_title || market.subtitle || market.title}
                        </span>
                      </div>
                      <div className="market-prices">
                        <span className="price-display">
                          <span className="price-value">
                            {Math.round((market.yes_bid || market.last_price || 0) * 100)}%
                          </span>
                        </span>
                        <div className="price-buttons">
                          <span className="yes-btn">Yes</span>
                          <span className="no-btn">No</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(event.markets?.length || 0) > 5 && (
                    <div className="more-markets">
                      +{event.markets.length - 5} more markets
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Market Detail Modal */}
      {showModal && selectedMarket && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>✕</button>
            
            {detailsLoading ? (
              <div className="modal-loading">
                <div className="spinner"></div>
                <p>Loading market data...</p>
              </div>
            ) : marketDetails ? (
              <>
                {/* Clean Header */}
                <div className="modal-header-clean">
                  <div className="header-top">
                    <span className={`status-badge ${marketDetails.market?.status}`}>
                      {marketDetails.market?.status}
                    </span>
                    <span className="market-ticker">{marketDetails.market?.ticker}</span>
                  </div>
                  <h2 className="modal-title-clean">{marketDetails.market?.title}</h2>
                </div>

                {/* Price Cards */}
                <div className="price-cards">
                  <div className="price-card yes">
                    <div className="price-main">{Math.round((marketDetails.market?.yes_bid || 0) * 100)}¢</div>
                    <div className="price-label-clean">YES</div>
                  </div>
                  <div className="price-card no">
                    <div className="price-main">{Math.round((marketDetails.market?.no_bid || 0) * 100)}¢</div>
                    <div className="price-label-clean">NO</div>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="modal-tabs">
                  <button 
                    className={`modal-tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                  >
                    📊 Overview
                  </button>
                  <button 
                    className={`modal-tab ${activeTab === 'analysis' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analysis')}
                  >
                    🔍 Insider Detection
                  </button>
                  <button 
                    className={`modal-tab ${activeTab === 'trades' ? 'active' : ''}`}
                    onClick={() => setActiveTab('trades')}
                  >
                    📈 Market Data
                  </button>
                </div>

                {/* Tab Content */}
                <div className="tab-content">
                  {/* Overview Tab */}
                  {activeTab === 'overview' && (
                    <div className="tab-pane">
                      {/* Quick Stats */}
                      <div className="quick-stats">
                        <div className="quick-stat">
                          <span className="qs-value">{marketDetails.market?.volume?.toLocaleString() || '0'}</span>
                          <span className="qs-label">Total Volume</span>
                        </div>
                        <div className="quick-stat">
                          <span className="qs-value">{marketDetails.market?.open_interest?.toLocaleString() || '0'}</span>
                          <span className="qs-label">Open Interest</span>
                        </div>
                        <div className="quick-stat">
                          <span className="qs-value">{marketDetails.market?.volume_24h?.toLocaleString() || '0'}</span>
                          <span className="qs-label">24h Volume</span>
                        </div>
                      </div>

                      {/* Price Chart */}
                      {marketDetails.priceHistory && marketDetails.priceHistory.length > 0 && (
                        <div className="chart-section">
                          <ResponsiveContainer width="100%" height={180}>
                            <AreaChart data={marketDetails.priceHistory}>
                              <defs>
                                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#00ff88" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <XAxis 
                                dataKey="time" 
                                tickFormatter={formatTime}
                                stroke="#404050"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis 
                                domain={[0, 100]}
                                tickFormatter={(v) => `${v}%`}
                                stroke="#404050"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                width={35}
                              />
                              <Tooltip 
                                contentStyle={{ 
                                  background: '#1a1a25', 
                                  border: '1px solid #2a2a3a',
                                  borderRadius: '8px',
                                  color: '#fff'
                                }}
                                formatter={(value) => [`${value}%`, 'Price']}
                                labelFormatter={(label) => new Date(label).toLocaleString()}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="price" 
                                stroke="#00ff88" 
                                fill="url(#priceGradient)"
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Rules */}
                      <div className="rules-section">
                        <h4>Resolution Criteria</h4>
                        <p>{marketDetails.market?.rules_primary}</p>
                      </div>
                    </div>
                  )}

                  {/* Analysis Tab */}
                  {activeTab === 'analysis' && (
                    <div className="tab-pane">
                      {!insiderAnalysis && !analyzingInsider && (
                        <div className="analysis-prompt">
                          <div className="prompt-icon">🔍</div>
                          <h3>Insider Trading Detection</h3>
                          <p>Run our quantitative analysis to detect suspicious trading patterns in this market.</p>
                          <button 
                            className="analyze-btn-large"
                            onClick={() => analyzeForInsiderTrading(marketDetails.market?.ticker)}
                          >
                            Run Analysis
                          </button>
                        </div>
                      )}

                      {analyzingInsider && (
                        <div className="analysis-running">
                          <div className="spinner"></div>
                          <p>Analyzing {marketDetails.market?.ticker}...</p>
                          <span className="analysis-sub">Running 14 detection algorithms</span>
                        </div>
                      )}

                      {insiderAnalysis && (
                        <div className="analysis-results-clean">
                          {/* Risk Score Card with Export */}
                          <div className={`risk-card ${insiderAnalysis.riskLevel.toLowerCase()}`}>
                            <div className="risk-score-display">
                              <div className="score-circle-clean">
                                <span className="score-value">{insiderAnalysis.suspicionScore}</span>
                              </div>
                              <div className="risk-info">
                                <span className={`risk-badge ${insiderAnalysis.riskLevel.toLowerCase()}`}>
                                  {insiderAnalysis.riskLevel} RISK
                                </span>
                                <p className="risk-summary">{insiderAnalysis.summary}</p>
                              </div>
                            </div>
                            <div className="risk-actions">
                              <div className="risk-meta">
                                <span>{insiderAnalysis.metrics?.signalsTriggered}/{insiderAnalysis.metrics?.signalsAnalyzed} signals</span>
                                <span>{insiderAnalysis.metrics?.totalTrades} trades</span>
                                <span>{insiderAnalysis.confidence}% confidence</span>
                              </div>
                              <button 
                                className="export-btn"
                                onClick={() => exportReport(insiderAnalysis, marketDetails?.market)}
                              >
                                Export Report
                              </button>
                            </div>
                          </div>

                          {/* Signal Overview */}
                          <div className="signal-overview">
                            <h4>Signal Analysis</h4>
                            <div className="signal-grid">
                              {['Timing', 'Order Flow', 'Price', 'Size', 'Statistical'].map((cat, idx) => {
                                const signals = insiderAnalysis.allSignals?.filter(s => s.category === cat) || [];
                                const triggered = signals.filter(s => s.triggered);
                                const maxSeverity = triggered.length > 0 
                                  ? Math.max(...triggered.map(s => s.severity)) 
                                  : 0;
                                const status = maxSeverity === 0 ? 'clean' 
                                  : maxSeverity <= 2 ? 'low' 
                                  : maxSeverity <= 3 ? 'medium' 
                                  : 'high';
                                
                                return (
                                  <div key={idx} className={`signal-row ${status}`}>
                                    <span className="signal-cat">{cat}</span>
                                    <span className={`signal-status ${status}`}>
                                      {status === 'clean' ? 'Normal' : 
                                       status === 'low' ? 'Low' :
                                       status === 'medium' ? 'Medium' : 'High'}
                                    </span>
                                    <span className="signal-count">{triggered.length}/{signals.length}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Risk Score Explanation */}
                          <div className="score-explanation">
                            <h4>Score Breakdown</h4>
                            <p className="explanation-intro">
                              Your score of <strong>{insiderAnalysis.suspicionScore}</strong> is rated <strong className={insiderAnalysis.riskLevel.toLowerCase()}>{insiderAnalysis.riskLevel}</strong> because:
                            </p>
                            
                            {insiderAnalysis.signals && insiderAnalysis.signals.length > 0 ? (
                              <>
                                <div className="contribution-list">
                                  {insiderAnalysis.signals
                                    .sort((a, b) => b.severity - a.severity)
                                    .map((signal, idx) => {
                                      const signalDef = insiderAnalysis.allSignals?.find(s => s.id === signal.type);
                                      const contribution = signalDef ? ((signal.severity / 5) * signalDef.weight).toFixed(1) : '?';
                                      return (
                                        <div key={idx} className="contribution-row">
                                          <div className="contrib-signal">
                                            <span className={`contrib-dot severity-${signal.severity}`}></span>
                                            <span className="contrib-name">{signal.type.replace(/_/g, ' ')}</span>
                                          </div>
                                          <div className="contrib-details">
                                            <span className="contrib-severity">Severity {signal.severity}/5</span>
                                            <span className="contrib-value">+{contribution} pts</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                                <div className="strongest-signal">
                                  <span className="strongest-label">Most Suspicious:</span>
                                  <span className="strongest-name">
                                    {insiderAnalysis.signals[0]?.type.replace(/_/g, ' ')} 
                                    ({insiderAnalysis.signals[0]?.severity}/5 severity)
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="no-signals-explanation">
                                <span className="checkmark-large">✓</span>
                                <p>No suspicious signals were triggered. Trading patterns appear normal.</p>
                              </div>
                            )}
                            
                            <div className="threshold-reference">
                              <span className="threshold-label">Risk Thresholds:</span>
                              <div className="threshold-scale">
                                <span className={`threshold-mark ${insiderAnalysis.suspicionScore < 18 ? 'active' : ''}`}>
                                  0-17 Low
                                </span>
                                <span className={`threshold-mark ${insiderAnalysis.suspicionScore >= 18 && insiderAnalysis.suspicionScore < 35 ? 'active' : ''}`}>
                                  18-34 Medium
                                </span>
                                <span className={`threshold-mark ${insiderAnalysis.suspicionScore >= 35 && insiderAnalysis.suspicionScore < 55 ? 'active' : ''}`}>
                                  35-54 High
                                </span>
                                <span className={`threshold-mark ${insiderAnalysis.suspicionScore >= 55 ? 'active' : ''}`}>
                                  55+ Critical
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Collapsible Signal Details */}
                          <div className="signal-details-section">
                            <h4>Detailed Signal Analysis</h4>
                            {['Timing', 'Order Flow', 'Price', 'Size', 'Statistical'].map(category => {
                              const categorySignals = insiderAnalysis.allSignals?.filter(s => s.category === category) || [];
                              if (categorySignals.length === 0) return null;
                              const triggeredCount = categorySignals.filter(s => s.triggered).length;
                              
                              return (
                                <div key={category} className="collapsible-category">
                                  <button 
                                    className="category-header-btn"
                                    onClick={() => toggleCategory(category)}
                                  >
                                    <span className="cat-name">{category}</span>
                                    <span className="cat-count">
                                      {triggeredCount > 0 && <span className="triggered-count">{triggeredCount} triggered</span>}
                                      <span className="total-count">{categorySignals.length} signals</span>
                                    </span>
                                    <span className={`chevron ${expandedCategories[category] ? 'open' : ''}`}>▼</span>
                                  </button>
                                  {expandedCategories[category] && (
                                    <div className="category-content">
                                      {categorySignals.map((signal, idx) => (
                                        <div key={idx} className={`signal-item-clean ${signal.triggered ? 'triggered' : ''}`}>
                                          <div className="signal-item-header">
                                            <span className={`signal-status-dot ${signal.triggered ? 'triggered' : 'normal'}`}></span>
                                            <span className="signal-item-name">{signal.name}</span>
                                          </div>
                                          <p className="signal-item-result">{signal.result}</p>
                                          {signal.triggered && signal.data && (
                                            <div className="signal-item-data">
                                              {Object.entries(signal.data).slice(0, 4).map(([k, v]) => (
                                                <span key={k} className="data-tag">{k}: {v}</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Market Data Tab */}
                  {activeTab === 'trades' && (
                    <div className="tab-pane">
                      {/* Order Book */}
                      <div className="data-section">
                        <h4>Order Book</h4>
                        <div className="orderbook-clean">
                          <div className="ob-column">
                            <div className="ob-title yes">YES Bids</div>
                            {(marketDetails.orderbook?.yes || []).slice(0, 5).map((level, idx) => (
                              <div key={idx} className="ob-row">
                                <span className="ob-price-clean">{level[0]}¢</span>
                                <span className="ob-size-clean">{level[1].toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                          <div className="ob-column">
                            <div className="ob-title no">NO Bids</div>
                            {(marketDetails.orderbook?.no || []).slice(0, 5).map((level, idx) => (
                              <div key={idx} className="ob-row">
                                <span className="ob-price-clean">{level[0]}¢</span>
                                <span className="ob-size-clean">{level[1].toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Recent Trades */}
                      <div className="data-section">
                        <h4>Recent Trades</h4>
                        <div className="trades-list-clean">
                          {(marketDetails.trades || []).slice(0, 8).map((trade, idx) => (
                            <div key={idx} className="trade-item-clean">
                              <span className={`trade-direction ${trade.taker_side}`}>
                                {trade.taker_side?.toUpperCase()}
                              </span>
                              <span className="trade-details">
                                {trade.count} @ {Math.round(trade.yes_price * 100)}¢
                              </span>
                              <span className="trade-time">
                                {new Date(trade.created_time).toLocaleTimeString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Market Details */}
                      <div className="data-section">
                        <h4>Market Details</h4>
                        <div className="details-grid">
                          <div className="detail-item">
                            <span className="detail-label">Close Time</span>
                            <span className="detail-value">{new Date(marketDetails.market?.close_time).toLocaleDateString()}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Liquidity</span>
                            <span className="detail-value">${(marketDetails.market?.liquidity / 100 || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="modal-error">
                <p>Failed to load market details</p>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="footer">
        <p>DeltaHacks 12 • Powered by Kalshi API</p>
      </footer>
    </div>
  );
}

export default App;
