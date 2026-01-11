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

function App({ initialSearch = '', onGoHome }) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
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
  const [expandedCards, setExpandedCards] = useState({});
  const [sortBy, setSortBy] = useState('volume'); // 'default', 'volume', 'newest', 'closing'
  const [filterFrequency, setFilterFrequency] = useState('all'); // 'all', 'daily', 'weekly'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'closed'
  const [hideSports, setHideSports] = useState(false);
  const [hideCrypto, setHideCrypto] = useState(false);
  const [hideEarnings, setHideEarnings] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef(null);
  const [watchlist, setWatchlist] = useState(() => {
    const saved = localStorage.getItem('tradeguard_watchlist');
    return saved ? JSON.parse(saved) : [];
  });
  const [showWatchlist, setShowWatchlist] = useState(false);
  
  // Autocomplete state
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchWrapperRef = useRef(null);
  const autocompleteTimeoutRef = useRef(null);
  const autocompleteItemRefs = useRef([]);
  const suggestionsScrollRef = useRef(null);
  const scrollIntervalRef = useRef(null);
  const scrollPositionRef = useRef(0);
  const isScrollingPausedRef = useRef(false);
  const isProgrammaticSearchRef = useRef(false);
  const [isScrollingPaused, setIsScrollingPaused] = useState(false);
  
  // Sync pause state to ref so scroll function can access it
  useEffect(() => {
    isScrollingPausedRef.current = isScrollingPaused;
  }, [isScrollingPaused]);

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const toggleCardExpanded = (eventTicker) => {
    setExpandedCards(prev => ({
      ...prev,
      [eventTicker]: !prev[eventTicker]
    }));
  };

  const getSortedAndFilteredEvents = () => {
    let filtered = [...events];
    
    // Filter by status - only filter if explicitly set to non-all
    if (filterStatus === 'closed') {
      filtered = filtered.filter(event => {
        // Check if ANY market is closed/finalized
        return (event.markets || []).some(m => {
          const status = (m.status || '').toLowerCase();
          return status === 'closed' || status === 'finalized';
        });
      });
    }
    // Note: 'active' and 'all' show everything - most markets don't have explicit status
    
    // Filter by category (hide options)
    if (hideSports) {
      filtered = filtered.filter(event => 
        event.category?.toLowerCase() !== 'sports'
      );
    }
    if (hideCrypto) {
      filtered = filtered.filter(event => 
        event.category?.toLowerCase() !== 'crypto'
      );
    }
    if (hideEarnings) {
      filtered = filtered.filter(event => 
        event.category?.toLowerCase() !== 'economics' && 
        event.category?.toLowerCase() !== 'companies'
      );
    }
    
    // Filter by frequency (based on close time) - find earliest closing market
    if (filterFrequency !== 'all') {
      const now = new Date();
      filtered = filtered.filter(event => {
        // Find the earliest close time among all markets
        const closeTimes = (event.markets || [])
          .map(m => m.close_time ? new Date(m.close_time) : null)
          .filter(t => t !== null && t > now); // Only future close times
        
        if (closeTimes.length === 0) return true; // No close time = include it
        
        const earliestClose = new Date(Math.min(...closeTimes));
        const daysUntilClose = (earliestClose - now) / (1000 * 60 * 60 * 24);
        
        if (filterFrequency === 'daily') return daysUntilClose <= 1 && daysUntilClose >= 0;
        if (filterFrequency === 'weekly') return daysUntilClose <= 7 && daysUntilClose >= 0;
        return true;
      });
    }
    
    // Sort
    if (sortBy === 'volume') {
      filtered.sort((a, b) => {
        const volA = (a.markets || []).reduce((sum, m) => sum + (m.volume_24h || m.volume || 0), 0);
        const volB = (b.markets || []).reduce((sum, m) => sum + (m.volume_24h || m.volume || 0), 0);
        return volB - volA;
      });
    } else if (sortBy === 'newest') {
      filtered.sort((a, b) => {
        // Use event creation or earliest market open time
        const getDate = (event) => {
          const times = (event.markets || [])
            .map(m => m.open_time ? new Date(m.open_time) : null)
            .filter(t => t !== null);
          return times.length > 0 ? Math.max(...times) : 0;
        };
        return getDate(b) - getDate(a);
      });
    } else if (sortBy === 'closing') {
      filtered.sort((a, b) => {
        // Sort by earliest closing market
        const getEarliestClose = (event) => {
          const now = new Date();
          const times = (event.markets || [])
            .map(m => m.close_time ? new Date(m.close_time) : null)
            .filter(t => t !== null && t > now);
          return times.length > 0 ? Math.min(...times) : new Date('2099-01-01').getTime();
        };
        return getEarliestClose(a) - getEarliestClose(b);
      });
    }
    
    return filtered;
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
    // If we have an initial search from landing page, trigger search
    if (initialSearch) {
      handleSearch();
    } else {
      loadEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autocomplete: fetch suggestions as user types
  useEffect(() => {
    // Don't show autocomplete if search query was set programmatically (from trending click)
    if (isProgrammaticSearchRef.current) {
      isProgrammaticSearchRef.current = false;
      return;
    }

    // Only show autocomplete when search input is focused
    if (!isSearchFocused) {
      setShowAutocomplete(false);
      return;
    }

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
          // Only show if still focused
          setShowAutocomplete(isSearchFocused && uniqueSuggestions.length > 0);
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
  }, [searchQuery, isSearchFocused]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setShowAutocomplete(false);
        setSelectedIndex(-1);
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setShowFilterDropdown(false);
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

  // Auto-scroll trending suggestions
  useEffect(() => {
    // Clear any existing interval first
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (!suggestionsScrollRef.current || suggestions.length === 0 || searchQuery) {
      // Reset position when suggestions change or search is active
      if (suggestionsScrollRef.current) {
        suggestionsScrollRef.current.scrollTo({ left: 0, behavior: 'auto' });
      }
      scrollPositionRef.current = 0;
      return;
    }

    // Small delay to ensure DOM is ready
    const initTimeout = setTimeout(() => {
      const scrollContainer = suggestionsScrollRef.current;
      if (!scrollContainer) return;

      // Only reset if we don't have a saved position (first time or after search cleared)
      if (scrollPositionRef.current === 0) {
        scrollContainer.scrollTo({ left: 0, behavior: 'auto' });
      } else {
        // Restore saved position
        scrollContainer.scrollTo({ left: scrollPositionRef.current, behavior: 'auto' });
      }

      const scrollSpeed = 0.5; // pixels per frame
      
      const scroll = () => {
        if (!scrollContainer) return;
        
        // Read pause state from ref to avoid dependency issues
        if (isScrollingPausedRef.current) {
          // When paused, save current position and don't scroll
          scrollPositionRef.current = scrollContainer.scrollLeft;
          return;
        }

        // Continue from current position (read from ref to get latest)
        const currentPos = scrollContainer.scrollLeft;
        scrollPositionRef.current = currentPos + scrollSpeed;
        const contentWidth = scrollContainer.scrollWidth;
        const halfWidth = contentWidth / 2;
        
        // If we've scrolled past the first set, reset to start seamlessly
        if (scrollPositionRef.current >= halfWidth) {
          scrollPositionRef.current = 0;
          scrollContainer.scrollTo({ left: 0, behavior: 'auto' });
        } else {
          scrollContainer.scrollTo({ left: scrollPositionRef.current, behavior: 'auto' });
        }
      };

      scrollIntervalRef.current = setInterval(scroll, 16); // ~60fps
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };
  }, [suggestions, searchQuery]); // Removed isScrollingPaused from dependencies

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

  const loadEvents = async (category = null) => {
    setLoading(true);
    setError(null);
    
    const cat = category !== null ? category : activeCategory;
    
    try {
      const url = cat === 'All' 
        ? `${API_BASE}/search?limit=100`
        : `${API_BASE}/search?category=${encodeURIComponent(cat)}&limit=100`;
      
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
    
    // Hide autocomplete when search is performed
    setShowAutocomplete(false);
    setIsSearchFocused(false);
    
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
    // Mark this as a programmatic search to prevent autocomplete from showing
    isProgrammaticSearchRef.current = true;
    
    // Close autocomplete immediately
    setShowAutocomplete(false);
    setSelectedIndex(-1);
    setAutocompleteResults([]);
    
    // Set search query and category
    setSearchQuery(suggestion.title);
    setActiveCategory('All');
    
    // Trigger search after state updates
    setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        // If we have an event_ticker, fetch that specific event directly
        if (suggestion.event_ticker) {
          const response = await fetch(`${API_BASE}/events/${encodeURIComponent(suggestion.event_ticker)}`);
          const data = await response.json();
          
          if (!response.ok) throw new Error(data.error || 'Event not found');
          
          // Wrap single event in array for display
          const event = data.event;
          setEvents(event ? [event] : []);
          setStats({ total: event ? 1 : 0, returned: event ? 1 : 0 });
        } else {
          // Fallback to regular search
          const params = new URLSearchParams();
          params.set('query', suggestion.title.trim());
          params.set('limit', '100');

          const response = await fetch(`${API_BASE}/search?${params}`);
          const data = await response.json();
          
          if (!response.ok) throw new Error(data.error || 'Search failed');
          
          setEvents(data.events || []);
          setStats({ total: data.total, returned: data.returned });
        }
      } catch (err) {
        setError(err.message);
        setEvents([]);
      } finally {
        setLoading(false);
      }
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
          setIsSearchFocused(false);
          setSelectedIndex(-1);
          // Don't prevent default - let form submit with current query
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowAutocomplete(false);
        setIsSearchFocused(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleCategoryClick = (category) => {
    setSearchQuery('');
    setActiveCategory(category);
    loadEvents(category);
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
    setIsSearchFocused(false);
    setSelectedIndex(-1);
    loadEvents();
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Watchlist functions - now saves entire events instead of individual markets
  const toggleWatchlist = (event) => {
    setWatchlist(prev => {
      const eventTicker = event.event_ticker;
      const isInWatchlist = prev.some(e => e.event_ticker === eventTicker);
      let newList;
      
      if (isInWatchlist) {
        newList = prev.filter(e => e.event_ticker !== eventTicker);
      } else {
        newList = [...prev, { 
          event_ticker: eventTicker, 
          title: event.title,
          category: event.category
        }];
      }
      
      localStorage.setItem('tradeguard_watchlist', JSON.stringify(newList));
      return newList;
    });
  };

  const isInWatchlist = (eventTicker) => {
    return watchlist.some(e => e.event_ticker === eventTicker);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Focus search on '/' key
      if (e.key === '/' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        const searchInput = document.querySelector('.header-search-input');
        if (searchInput) {
          searchInput.focus();
        }
      }
      
      // Close modals/watchlist on Escape
      if (e.key === 'Escape') {
        if (showWatchlist) setShowWatchlist(false);
        if (showModal) closeModal();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [showWatchlist, showModal]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-background"></div>
        <div className="header-content">
          <div className="logo" onClick={onGoHome}>
            <div className="logo-container">
              <svg className="logo-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="url(#shield-gradient)" stroke="currentColor"/>
                <defs>
                  <linearGradient id="shield-gradient" x1="4" y1="2" x2="20" y2="22">
                    <stop offset="0%" stopColor="rgba(0,255,136,0.3)"/>
                    <stop offset="100%" stopColor="rgba(0,200,255,0.1)"/>
                  </linearGradient>
                </defs>
              </svg>
              <div className="logo-glow"></div>
            </div>
            <h1>TRADEGUARD</h1>
          </div>
          
          <div className="header-right-group">
            {/* Search Bar in Header */}
            <div className="header-search">
              <form onSubmit={handleSearch} className="header-search-form">
                <div className="search-input-wrapper" ref={searchWrapperRef}>
                  <div className="search-icon-wrapper">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      setIsSearchFocused(true);
                      if (autocompleteResults.length > 0 && searchQuery.trim().length >= 2) {
                        setShowAutocomplete(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on autocomplete items
                      setTimeout(() => {
                        setIsSearchFocused(false);
                        setShowAutocomplete(false);
                      }, 200);
                    }}
                    placeholder="Search markets... (Press / to focus)"
                    className="header-search-input"
                  />
                  {searchQuery && (
                    <button type="button" className="clear-btn" onClick={() => {
                      clearSearch();
                      setShowAutocomplete(false);
                      setSelectedIndex(-1);
                    }}>✕</button>
                  )}
                  
                  {/* Autocomplete Dropdown - Only show when focused and not after search */}
                  {showAutocomplete && isSearchFocused && autocompleteResults.length > 0 && (
                    <div className="autocomplete-dropdown">
                      {autocompleteResults.map((result, index) => (
                        <button
                          key={`${result.event_ticker || index}-${result.title}`}
                          ref={(el) => (autocompleteItemRefs.current[index] = el)}
                          type="button"
                          className={`autocomplete-item ${selectedIndex === index ? 'selected' : ''}`}
                          onClick={() => {
                            handleAutocompleteSelect(result);
                            setIsSearchFocused(false);
                          }}
                          onMouseEnter={() => setSelectedIndex(index)}
                        >
                          <span className="autocomplete-title">{result.title}</span>
                          <span className="autocomplete-category">{result.category}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="header-actions">
              <button 
                className="watchlist-btn"
                onClick={() => setShowWatchlist(!showWatchlist)}
                title={`Watchlist (${watchlist.length})`}
              >
                <svg className="watchlist-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" opacity="0.3"></polygon>
                </svg>
                {watchlist.length > 0 && <span className="watchlist-count">{watchlist.length}</span>}
              </button>
              <a href="#" className="header-link" onClick={(e) => { e.preventDefault(); }}>
                <svg className="link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 16v-4"></path>
                  <path d="M12 8h.01"></path>
                </svg>
                How it works
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Trending Ticker */}
        {suggestions.length > 0 && !searchQuery && (
          <div className="trending-ticker">
            <div className="ticker-label">
              <svg className="ticker-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="rgba(0,255,136,0.2)"></path>
              </svg>
              <span>TRENDING</span>
            </div>
            <div 
              className="ticker-track"
              ref={suggestionsScrollRef}
              onMouseEnter={() => setIsScrollingPaused(true)}
              onMouseLeave={() => setIsScrollingPaused(false)}
            >
              {[...suggestions.slice(0, 8), ...suggestions.slice(0, 8)].map((suggestion, idx) => (
                <button
                  key={`${idx}-${suggestion.title}`}
                  className="ticker-item"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSuggestionClick(suggestion);
                  }}
                  type="button"
                >
                  {suggestion.title.length > 45 
                    ? suggestion.title.substring(0, 45) + '...' 
                    : suggestion.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category Tabs & Filter Button */}
        <div className="controls-row">
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
          
          <div className="filter-controls" ref={filterDropdownRef}>
            <button 
              className="filter-icon-btn"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              title="Filter options"
            >
              <svg className="filter-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6"></line>
                <circle cx="8" cy="6" r="2" fill="currentColor"></circle>
                <line x1="4" y1="12" x2="20" y2="12"></line>
                <circle cx="16" cy="12" r="2" fill="currentColor"></circle>
                <line x1="4" y1="18" x2="20" y2="18"></line>
                <circle cx="12" cy="18" r="2" fill="currentColor"></circle>
              </svg>
              {(sortBy !== 'default' || filterFrequency !== 'all' || filterStatus !== 'active' || hideSports || hideCrypto || hideEarnings) && (
                <span className="filter-badge"></span>
              )}
            </button>
            
            {showFilterDropdown && (
              <div className="filter-dropdown">
                {/* Filter Bar */}
                <div className="filter-bar">
                  {/* Sort By Dropdown */}
                  <div className="filter-item dropdown">
                    <span className="filter-item-label">Sort by:</span>
                    <select 
                      value={sortBy} 
                      onChange={(e) => setSortBy(e.target.value)}
                      className="filter-select"
                    >
                      <option value="volume">24hr Volume</option>
                      <option value="newest">Newest</option>
                      <option value="closing">Closing Soon</option>
                      <option value="default">Default</option>
                    </select>
                  </div>

                  {/* Frequency Dropdown */}
                  <div className="filter-item dropdown">
                    <span className="filter-item-label">Frequency:</span>
                    <select 
                      value={filterFrequency} 
                      onChange={(e) => setFilterFrequency(e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  {/* Status Dropdown */}
                  <div className="filter-item dropdown">
                    <span className="filter-item-label">Status:</span>
                    <select 
                      value={filterStatus} 
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="filter-select"
                    >
                      <option value="active">Active</option>
                      <option value="all">All</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  {/* Checkbox Filters */}
                  <label className="filter-checkbox">
                    <input 
                      type="checkbox" 
                      checked={hideSports}
                      onChange={(e) => setHideSports(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">Hide sports?</span>
                  </label>

                  <label className="filter-checkbox">
                    <input 
                      type="checkbox" 
                      checked={hideCrypto}
                      onChange={(e) => setHideCrypto(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">Hide crypto?</span>
                  </label>

                  <label className="filter-checkbox">
                    <input 
                      type="checkbox" 
                      checked={hideEarnings}
                      onChange={(e) => setHideEarnings(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">Hide earnings?</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results Info */}
        <div className="results-info">
          <span className="results-count">
            {stats.total > 0 ? `${getSortedAndFilteredEvents().length} markets` : 'Loading...'}
          </span>
          {searchQuery && <span className="results-query">for "{searchQuery}"</span>}
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
            {getSortedAndFilteredEvents().map((event, eventIdx) => {
              const firstMarket = event.markets?.[0];
              const totalVolume = (event.markets || []).reduce((sum, m) => sum + (m.volume || 0), 0);
              const isExpanded = expandedCards[event.event_ticker];
              const marketsToShow = isExpanded ? event.markets : (event.markets || []).slice(0, 3);
              const hasMoreMarkets = (event.markets?.length || 0) > 3;
              const getCategoryIcon = (cat) => {
                const iconPaths = {
                  'Politics': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>,
                  'Crypto': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 8h6m-6 4h6m-3-8v2m0 12v2M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0z"/></svg>,
                  'Sports': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>,
                  'Economics': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18M7 16l4-4 4 4 5-6"/></svg>,
                  'Climate and Weather': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h4m12 0h4M12 2v4m0 12v4"/></svg>,
                  'World': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
                  'Science and Technology': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6v11a3 3 0 1 1-6 0V3zM4 21h16M12 17v4"/></svg>,
                  'Companies': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
                  'Entertainment': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3V9z"/></svg>,
                  'Health': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19.5 12.572l-7.5 7.428-7.5-7.428a5 5 0 1 1 7.5-6.566 5 5 0 1 1 7.5 6.566z"/></svg>,
                  'Elections': <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>
                };
                return iconPaths[cat] || <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18M7 16l4-4 4 4 5-6"/></svg>;
              };
              return (
              <div 
                key={event.event_ticker || eventIdx} 
                className={`event-card ${isExpanded ? 'expanded' : ''}`}
                onClick={() => {
                  if (firstMarket) {
                    handleSelectMarket(firstMarket);
                  }
                }}
              >
                <div className="event-header">
                  <div className="event-category-wrapper">
                    <span className="category-icon">{getCategoryIcon(event.category)}</span>
                    <span className="event-category">{event.category}</span>
                  </div>
                  <div className="event-meta">
                    {totalVolume > 0 && (
                      <span className="event-volume" title="Total Volume">
                        <svg className="volume-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 3v18h18M7 16l4-4 4 4 5-6"/>
                        </svg>
                        {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}K` : totalVolume}
                      </span>
                    )}
                    {event.markets?.length > 1 && (
                      <span className="market-count">{event.markets.length} markets</span>
                    )}
                    <button
                      className={`event-watchlist-star ${isInWatchlist(event.event_ticker) ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWatchlist(event);
                      }}
                      title={isInWatchlist(event.event_ticker) ? 'Remove event from watchlist' : 'Add event to watchlist'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <h3 className="event-title">{event.title}</h3>
                {event.sub_title && (
                  <p className="event-subtitle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '0.4rem', verticalAlign: 'middle'}}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {event.sub_title}
                  </p>
                )}
                
                <div className="markets-list">
                  {(marketsToShow || []).map((market) => {
                    // Get actual bid prices like Kalshi displays
                    const yesBid = Math.round((market.yes_bid || market.last_price || 0) * 100);
                    const noBid = Math.round((market.no_bid || (1 - (market.last_price || 0))) * 100);
                    const probClass = yesBid >= 70 ? 'high' : yesBid >= 40 ? 'medium' : 'low';
                    return (
                    <div
                      key={market.ticker}
                      className="market-row"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectMarket(market);
                      }}
                    >
                      <div className="market-info">
                        <span className="market-subtitle">
                          {market.yes_sub_title || market.subtitle || market.title}
                        </span>
                        {market.volume > 0 && (
                          <span className="market-volume-small">
                            Vol: {market.volume >= 1000 ? `${(market.volume / 1000).toFixed(1)}K` : market.volume}
                          </span>
                        )}
                      </div>
                      <div className="market-prices">
                        <div className="probability-wrapper">
                          <span className={`probability-value ${probClass}`}>
                            {yesBid}%
                          </span>
                          <div className="probability-bar">
                            <div 
                              className={`probability-fill ${probClass}`} 
                              style={{ width: `${yesBid}%` }}
                            ></div>
                          </div>
                        </div>
                        <div className="price-buttons">
                          <span className="yes-btn">Yes</span>
                          <span className="no-btn">No</span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {hasMoreMarkets && (
                    <button 
                      className="more-markets"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCardExpanded(event.event_ticker);
                      }}
                    >
                      {isExpanded 
                        ? '▲ Show less' 
                        : `▼ +${event.markets.length - 3} more markets`
                      }
                    </button>
                  )}
                </div>
              </div>
              );
            })}
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

                {/* Price Cards - Show actual bid prices like Kalshi */}
                {(() => {
                  const market = marketDetails.market;
                  const isFinalized = market?.status?.toLowerCase() === 'finalized' || market?.status?.toLowerCase() === 'closed';
                  
                  // Show actual bid prices (what you can sell at)
                  // These may not sum to 100 due to the bid-ask spread
                  let yesBid, noBid;
                  
                  if (market?.result === 'yes') {
                    yesBid = 100;
                    noBid = 0;
                  } else if (market?.result === 'no') {
                    yesBid = 0;
                    noBid = 100;
                  } else {
                    // Active markets - use actual bid prices from API
                    yesBid = Math.round((market?.yes_bid || market?.last_price || 0) * 100);
                    noBid = Math.round((market?.no_bid || (1 - (market?.last_price || 0))) * 100);
                  }
                  
                  return (
                    <div className="price-cards">
                      <div className="price-card yes">
                        <div className="price-main">{yesBid}¢</div>
                        <div className="price-label-clean">Yes {isFinalized && market?.result === 'yes' && '✓ WON'}</div>
                      </div>
                      <div className="price-card no">
                        <div className="price-main">{noBid}¢</div>
                        <div className="price-label-clean">No {isFinalized && market?.result === 'no' && '✓ WON'}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Tab Navigation */}
                <div className="modal-tabs">
                  <button 
                    className={`modal-tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18M7 16l4-4 4 4 5-6"/></svg>
                    Overview
                  </button>
                  <button 
                    className={`modal-tab ${activeTab === 'analysis' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analysis')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    Insider Detection
                  </button>
                  <button 
                    className={`modal-tab ${activeTab === 'trades' ? 'active' : ''}`}
                    onClick={() => setActiveTab('trades')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M6 20V4M18 20v-6"/></svg>
                    Market Data
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
                        <div className="quick-stat">
                          <span className="qs-value">
                            {marketDetails.market?.last_price 
                              ? `${Math.round(marketDetails.market.last_price * 100)}¢` 
                              : 'N/A'}
                          </span>
                          <span className="qs-label">Last Trade</span>
                        </div>
                        {marketDetails.market?.yes_bid > 0 && marketDetails.market?.yes_ask > 0 && (
                          <div className="quick-stat">
                            <span className="qs-value">
                              {Math.round(marketDetails.market.yes_bid * 100)}¢ / {Math.round(marketDetails.market.yes_ask * 100)}¢
                            </span>
                            <span className="qs-label">Bid / Ask</span>
                          </div>
                        )}
                        {marketDetails.market?.close_time && (
                          <div className="quick-stat">
                            <span className="qs-value">
                              {new Date(marketDetails.market.close_time).toLocaleDateString()}
                            </span>
                            <span className="qs-label">
                              {new Date(marketDetails.market.close_time) > new Date() ? 'Closes' : 'Closed'}
                            </span>
                          </div>
                        )}
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
                          <div className="prompt-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                            </svg>
                          </div>
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

      {/* Watchlist Sidebar */}
      {showWatchlist && (
        <div className="watchlist-overlay" onClick={() => setShowWatchlist(false)}>
          <div className="watchlist-sidebar" onClick={(e) => e.stopPropagation()}>
            <div className="watchlist-header">
              <h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" style={{marginRight: '0.5rem', verticalAlign: 'middle'}}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                Watchlist
              </h3>
              <button className="watchlist-close" onClick={() => setShowWatchlist(false)}>✕</button>
            </div>
            <div className="watchlist-content">
              {watchlist.length === 0 ? (
                <div className="watchlist-empty">
                  <p>No events in watchlist</p>
                  <p className="watchlist-hint">Click the star on any market to add the event</p>
                </div>
              ) : (
                <div className="watchlist-items">
                  {watchlist.map((item) => {
                    const event = events.find(e => e.event_ticker === item.event_ticker);
                    
                    if (!event) return null;
                    
                    const firstMarket = event.markets?.[0];
                    const totalVolume = (event.markets || []).reduce((sum, m) => sum + (m.volume || 0), 0);
                    // Use yes_bid (actual bid price) like Kalshi
                    const yesBid = Math.round((firstMarket?.yes_bid || firstMarket?.last_price || 0) * 100);
                    
                    return (
                      <div
                        key={item.event_ticker}
                        className="watchlist-item"
                        onClick={() => {
                          if (firstMarket) {
                            handleSelectMarket(firstMarket);
                          }
                          setShowWatchlist(false);
                        }}
                      >
                        <div className="watchlist-item-info">
                          <span className="watchlist-item-title">{item.title}</span>
                          <span className="watchlist-item-ticker">{item.event_ticker}</span>
                          {event.markets?.length > 1 && (
                            <span className="watchlist-item-meta">{event.markets.length} markets</span>
                          )}
                        </div>
                        <div className="watchlist-item-price">
                          {firstMarket && <span className="watchlist-probability">{yesBid}¢</span>}
                          <button
                            className="watchlist-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWatchlist(event);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
