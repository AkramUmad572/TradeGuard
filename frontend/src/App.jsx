import React, { useState, useEffect, useRef } from 'react';
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
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ total: 0, returned: 0 });
  
  // Autocomplete state
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const searchWrapperRef = useRef(null);
  const autocompleteTimeoutRef = useRef(null);
  const autocompleteItemRefs = useRef([]);

  // Load initial data and suggestions on mount
  useEffect(() => {
    loadSuggestions();
    loadEvents();
  }, []);

  // Reload when category changes
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
    setSelectedMarket(null);
    setMarketDetails(null);

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
    // Trigger search
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
    setLoading(true);
    try {
      const [marketRes, tradesRes, orderbookRes] = await Promise.all([
        fetch(`${API_BASE}/markets/${ticker}`),
        fetch(`${API_BASE}/markets/${ticker}/trades?limit=20`),
        fetch(`${API_BASE}/markets/${ticker}/orderbook?depth=5`)
      ]);

      const [marketData, tradesData, orderbookData] = await Promise.all([
        marketRes.json(),
        tradesRes.json(),
        orderbookRes.json()
      ]);

      setMarketDetails({
        market: marketData.market,
        trades: tradesData.trades || [],
        orderbook: orderbookData.orderbook || {}
      });
    } catch (err) {
      console.error('Error fetching market details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMarket = (market) => {
    setSelectedMarket(market);
    fetchMarketDetails(market.ticker);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setActiveCategory('All');
    loadEvents();
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
              {suggestions.slice(0, 10).map((suggestion, idx) => (
                <button
                  key={idx}
                  className="suggestion-chip"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion.title.length > 40 
                    ? suggestion.title.substring(0, 40) + '...' 
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

        {/* Results Layout */}
        <div className="content-layout">
          {/* Events/Markets List */}
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
                  
                  {/* Markets within event */}
                  <div className="markets-list">
                    {(event.markets || []).slice(0, 5).map((market, idx) => (
                      <div
                        key={market.ticker}
                        className={`market-row ${selectedMarket?.ticker === market.ticker ? 'selected' : ''}`}
                        onClick={() => handleSelectMarket(market)}
                      >
                        <div className="market-info">
                          <span className="market-subtitle">
                            {market.yes_sub_title || market.subtitle || market.title}
                          </span>
                        </div>
                        <div className="market-prices">
                          <span className="price-display">
                            <span className="price-value">{Math.round(market.yes_bid * 100 || market.last_price * 100)}%</span>
                          </span>
                          <div className="price-buttons">
                            <button className="yes-btn">Yes</button>
                            <button className="no-btn">No</button>
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

          {/* Market Details Panel */}
          {selectedMarket && (
            <section className="details-panel">
              <div className="details-header">
                <h2>Market Details</h2>
                <button className="close-btn" onClick={() => setSelectedMarket(null)}>✕</button>
              </div>

              {marketDetails && (
                <div className="market-details">
                  <div className="detail-card">
                    <h3>{marketDetails.market?.title}</h3>
                    <p className="description">{marketDetails.market?.rules_primary}</p>
                    
                    <div className="price-display-large">
                      <div className="price-col yes">
                        <span className="price-label">YES</span>
                        <span className="price-big">{Math.round((marketDetails.market?.yes_bid || 0) * 100)}¢</span>
                      </div>
                      <div className="price-col no">
                        <span className="price-label">NO</span>
                        <span className="price-big">{Math.round((marketDetails.market?.no_bid || 0) * 100)}¢</span>
                      </div>
                    </div>
                    
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="label">Volume</span>
                        <span className="value">{marketDetails.market?.volume?.toLocaleString() || '0'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Open Interest</span>
                        <span className="value">{marketDetails.market?.open_interest?.toLocaleString() || '0'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Status</span>
                        <span className="value status">{marketDetails.market?.status}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Close Time</span>
                        <span className="value">{new Date(marketDetails.market?.close_time).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Trades */}
                  <div className="trades-card">
                    <h4>Recent Trades</h4>
                    <div className="trades-list">
                      {marketDetails.trades?.slice(0, 8).map((trade, idx) => (
                        <div key={idx} className="trade-row">
                          <span className={`trade-side ${trade.taker_side}`}>
                            {trade.taker_side?.toUpperCase()}
                          </span>
                          <span className="trade-count">{trade.count}</span>
                          <span className="trade-price">{Math.round(trade.yes_price * 100)}¢</span>
                          <span className="trade-time">
                            {new Date(trade.created_time).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                      {(!marketDetails.trades || marketDetails.trades.length === 0) && (
                        <p className="no-data">No recent trades</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      <footer className="footer">
        <p>DeltaHacks 12 • Powered by Kalshi API</p>
      </footer>
    </div>
  );
}

export default App;
