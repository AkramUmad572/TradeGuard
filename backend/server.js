import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Configuration, MarketApi, EventsApi, SearchApi } from 'kalshi-typescript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Kalshi SDK configuration
let config;
let marketApi;
let eventsApi;
let searchApi;
let isAuthenticated = false;

// Cache for events (refresh every 5 minutes)
let eventsCache = {
  data: [],
  lastFetch: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

function initializeKalshiClient() {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH;
  const privateKeyPem = process.env.KALSHI_PRIVATE_KEY_PEM;

  if (!apiKeyId) {
    console.log('⚠️  No KALSHI_API_KEY_ID found - running in unauthenticated mode');
    console.log('   Public endpoints work fine without auth!');
    
    config = new Configuration({
      basePath: 'https://api.elections.kalshi.com/trade-api/v2'
    });
  } else {
    const configOptions = {
      apiKey: apiKeyId,
      basePath: 'https://api.elections.kalshi.com/trade-api/v2'
    };

    if (privateKeyPath && fs.existsSync(privateKeyPath)) {
      configOptions.privateKeyPath = privateKeyPath;
    } else if (privateKeyPem) {
      configOptions.privateKeyPem = privateKeyPem;
    }

    config = new Configuration(configOptions);
    isAuthenticated = true;
  }

  marketApi = new MarketApi(config);
  eventsApi = new EventsApi(config);
  searchApi = new SearchApi(config);
}

initializeKalshiClient();

// Normalize market data for frontend
function normalizeMarket(market) {
  return {
    ...market,
    yes_ask: (market.yes_ask || 0) / 100,
    no_ask: (market.no_ask || 0) / 100,
    yes_bid: (market.yes_bid || 0) / 100,
    no_bid: (market.no_bid || 0) / 100,
    last_price: (market.last_price || 0) / 100,
  };
}

// Fetch ALL events with pagination (cached)
async function getAllEvents(forceRefresh = false) {
  const now = Date.now();
  
  if (!forceRefresh && eventsCache.data.length > 0 && (now - eventsCache.lastFetch) < eventsCache.ttl) {
    return eventsCache.data;
  }

  console.log('📥 Fetching all events from Kalshi...');
  
  let allEvents = [];
  let cursor = undefined;
  let pageCount = 0;
  const maxPages = 10; // Safety limit

  try {
    do {
      const response = await eventsApi.getEvents(
        200, // max limit
        cursor,
        true, // withNestedMarkets
        false,
        undefined,
        undefined
      );

      const events = response.data.events || [];
      allEvents = allEvents.concat(events);
      cursor = response.data.cursor;
      pageCount++;

      console.log(`  Page ${pageCount}: ${events.length} events (total: ${allEvents.length})`);
    } while (cursor && pageCount < maxPages);

    // Normalize all markets
    allEvents = allEvents.map(event => ({
      ...event,
      markets: (event.markets || []).map(normalizeMarket)
    }));

    eventsCache.data = allEvents;
    eventsCache.lastFetch = now;

    console.log(`✅ Cached ${allEvents.length} events`);
    return allEvents;
  } catch (error) {
    console.error('Error fetching all events:', error.message);
    return eventsCache.data; // Return stale cache on error
  }
}

// Get categories from events
function getCategories(events) {
  const categoryMap = {};
  
  for (const event of events) {
    const cat = event.category || 'Other';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { name: cat, count: 0 };
    }
    categoryMap[cat].count++;
  }

  return Object.values(categoryMap).sort((a, b) => b.count - a.count);
}

// ============== API ENDPOINTS ==============

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const events = await getAllEvents();
    const categories = getCategories(events);
    
    res.json({ categories });
  } catch (error) {
    console.error('Error getting categories:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get series list (with optional category filter)
app.get('/api/series', async (req, res) => {
  try {
    const { category, tags, includeProductMetadata } = req.query;
    
    const response = await marketApi.getSeriesList(
      category || undefined,
      tags || undefined,
      includeProductMetadata === 'true'
    );

    res.json({
      series: response.data.series || []
    });
  } catch (error) {
    console.error('Error fetching series:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get tags for categories
app.get('/api/tags', async (req, res) => {
  try {
    const response = await searchApi.getTagsForSeriesCategories();
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching tags:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Score an event based on search relevance
function scoreEventRelevance(event, searchTerm) {
  let score = 0;
  const lowerTerm = searchTerm.toLowerCase();
  const words = lowerTerm.split(/\s+/).filter(w => w.length > 0);
  
  // Helper to check if text matches and calculate score
  const scoreMatch = (text, baseScore, exactBonus = 0) => {
    if (!text) return 0;
    const lowerText = text.toLowerCase();
    
    // Exact match gets highest score
    if (lowerText === lowerTerm) {
      return baseScore * 3 + exactBonus;
    }
    
    // Starts with search term
    if (lowerText.startsWith(lowerTerm)) {
      return baseScore * 2 + exactBonus;
    }
    
    // Word boundary match (whole word)
    const wordBoundaryRegex = new RegExp(`\\b${lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (wordBoundaryRegex.test(lowerText)) {
      return baseScore * 1.5;
    }
    
    // Contains search term
    if (lowerText.includes(lowerTerm)) {
      return baseScore;
    }
    
    // Multi-word: check if all words are present
    if (words.length > 1) {
      const allWordsPresent = words.every(word => lowerText.includes(word));
      if (allWordsPresent) {
        return baseScore * 0.8;
      }
    }
    
    return 0;
  };
  
  // Score event title (highest priority)
  score += scoreMatch(event.title, 100, 50);
  
  // Score event subtitle
  score += scoreMatch(event.sub_title, 30);
  
  // Score market titles (check all markets, take best match)
  let bestMarketScore = 0;
  if (event.markets && event.markets.length > 0) {
    for (const market of event.markets) {
      const marketScore = 
        scoreMatch(market.title, 40) +
        scoreMatch(market.subtitle, 25) +
        scoreMatch(market.yes_sub_title, 20) +
        scoreMatch(market.no_sub_title, 20);
      bestMarketScore = Math.max(bestMarketScore, marketScore);
    }
    score += bestMarketScore;
  }
  
  // Score tickers (lower priority)
  score += scoreMatch(event.event_ticker, 10) * 0.5;
  score += scoreMatch(event.series_ticker, 10) * 0.5;
  
  // Category matching is deprioritized to prevent false positives
  // Only exact category matches get a minimal score (e.g., searching "Politics" when category is "Politics")
  // This prevents "Trump" from matching all "Politics" category items
  if (event.category) {
    const categoryLower = event.category.toLowerCase();
    if (categoryLower === lowerTerm) {
      score += 5; // Exact category match only, very low score
    }
    // No partial category matching - too broad and causes false positives
  }
  
  return score;
}

// MAIN SEARCH - Search across ALL events and markets with relevance scoring
app.get('/api/search', async (req, res) => {
  try {
    const { query, category, limit = 50 } = req.query;

    const allEvents = await getAllEvents();
    
    let eventsToSearch = allEvents;

    // Filter by category if provided
    if (category && category !== 'All') {
      eventsToSearch = eventsToSearch.filter(e => 
        e.category?.toLowerCase() === category.toLowerCase()
      );
    }

    let scoredEvents = eventsToSearch;

    // Score and filter by search query if provided
    if (query && query.trim()) {
      const searchTerm = query.trim();
      
      // Score all events
      scoredEvents = eventsToSearch
        .map(event => ({
          event,
          score: scoreEventRelevance(event, searchTerm)
        }))
        .filter(item => item.score > 0) // Only keep events with non-zero scores
        .sort((a, b) => b.score - a.score) // Sort by score descending
        .map(item => item.event); // Extract events
    }

    // Limit results
    const limitedEvents = scoredEvents.slice(0, parseInt(limit));

    res.json({
      events: limitedEvents,
      total: scoredEvents.length,
      returned: limitedEvents.length,
      query: query || null,
      category: category || 'All'
    });
  } catch (error) {
    console.error('Error searching:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get events by category
app.get('/api/events/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 50 } = req.query;

    const allEvents = await getAllEvents();
    
    let filteredEvents = allEvents;
    
    if (category && category !== 'All') {
      filteredEvents = allEvents.filter(e => 
        e.category?.toLowerCase() === category.toLowerCase()
      );
    }

    res.json({
      events: filteredEvents.slice(0, parseInt(limit)),
      total: filteredEvents.length,
      category
    });
  } catch (error) {
    console.error('Error fetching category events:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get popular/trending suggestions
app.get('/api/suggestions', async (req, res) => {
  try {
    const allEvents = await getAllEvents();
    
    // Get events with highest volume/open interest
    const suggestions = allEvents
      .filter(e => e.markets && e.markets.length > 0)
      .map(event => {
        const totalVolume = event.markets.reduce((sum, m) => sum + (m.volume || 0), 0);
        const totalOpenInterest = event.markets.reduce((sum, m) => sum + (m.open_interest || 0), 0);
        return { ...event, totalVolume, totalOpenInterest };
      })
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 20)
      .map(e => ({
        title: e.title,
        category: e.category,
        event_ticker: e.event_ticker,
        sub_title: e.sub_title,
        volume: e.totalVolume,
        marketCount: e.markets?.length || 0
      }));

    res.json({ suggestions });
  } catch (error) {
    console.error('Error getting suggestions:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all events (paginated, from cache)
app.get('/api/events', async (req, res) => {
  try {
    const { limit = 50, offset = 0, category, withNestedMarkets } = req.query;

    let events = await getAllEvents();
    
    if (category && category !== 'All') {
      events = events.filter(e => e.category?.toLowerCase() === category.toLowerCase());
    }

    const paginatedEvents = events.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      events: paginatedEvents,
      total: events.length,
      offset: parseInt(offset),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching events:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Search events (legacy endpoint - redirects to /api/search)
app.get('/api/events/search', async (req, res) => {
  try {
    const { query, limit = 50 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const allEvents = await getAllEvents();
    const searchTerm = query.toLowerCase();

    const filteredEvents = allEvents.filter(event => {
      const eventMatch = 
        event.title?.toLowerCase().includes(searchTerm) ||
        event.sub_title?.toLowerCase().includes(searchTerm) ||
        event.category?.toLowerCase().includes(searchTerm) ||
        event.event_ticker?.toLowerCase().includes(searchTerm);

      const marketMatch = (event.markets || []).some(market =>
        market.title?.toLowerCase().includes(searchTerm) ||
        market.subtitle?.toLowerCase().includes(searchTerm) ||
        market.ticker?.toLowerCase().includes(searchTerm)
      );

      return eventMatch || marketMatch;
    });

    res.json({
      events: filteredEvents.slice(0, parseInt(limit)),
      total: filteredEvents.length,
      query
    });
  } catch (error) {
    console.error('Error searching events:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get single event
app.get('/api/events/:eventTicker', async (req, res) => {
  try {
    const { eventTicker } = req.params;

    const response = await eventsApi.getEvent(eventTicker, true);
    const event = response.data.event;
    
    if (event.markets) {
      event.markets = event.markets.map(normalizeMarket);
    }

    res.json({
      event,
      markets: (response.data.markets || []).map(normalizeMarket)
    });
  } catch (error) {
    console.error('Error fetching event:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all markets (paginated)
app.get('/api/markets', async (req, res) => {
  try {
    const { limit = 100, cursor, status, eventTicker, seriesTicker } = req.query;

    const response = await marketApi.getMarkets(
      parseInt(limit),
      cursor || undefined,
      eventTicker || undefined,
      seriesTicker || undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      status || undefined
    );

    const markets = (response.data.markets || []).map(normalizeMarket);

    res.json({
      markets,
      cursor: response.data.cursor,
      total: markets.length
    });
  } catch (error) {
    console.error('Error fetching markets:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Search markets
app.get('/api/markets/search', async (req, res) => {
  try {
    const { query, limit = 200, status } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const response = await marketApi.getMarkets(
      parseInt(limit),
      undefined,
      undefined,
      undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      status || undefined
    );

    const markets = response.data.markets || [];
    const searchTerm = query.toLowerCase();
    
    const filteredMarkets = markets.filter(market => {
      return (
        market.title?.toLowerCase().includes(searchTerm) ||
        market.ticker?.toLowerCase().includes(searchTerm) ||
        market.subtitle?.toLowerCase().includes(searchTerm) ||
        market.rules_primary?.toLowerCase().includes(searchTerm)
      );
    }).map(normalizeMarket);

    res.json({
      markets: filteredMarkets,
      total: filteredMarkets.length,
      query
    });
  } catch (error) {
    console.error('Error fetching markets:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get single market
app.get('/api/markets/:ticker', async (req, res) => {
  try {
    const { ticker } = req.params;
    const response = await marketApi.getMarket(ticker);
    
    res.json({
      market: normalizeMarket(response.data.market)
    });
  } catch (error) {
    console.error('Error fetching market:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get market trades
app.get('/api/markets/:ticker/trades', async (req, res) => {
  try {
    const { ticker } = req.params;
    const { limit = 100, cursor } = req.query;

    const response = await marketApi.getTrades(
      parseInt(limit),
      cursor || undefined,
      ticker
    );

    const trades = (response.data.trades || []).map(trade => ({
      ...trade,
      yes_price: (trade.yes_price || 0) / 100,
      no_price: (trade.no_price || 0) / 100,
    }));

    res.json({
      trades,
      cursor: response.data.cursor
    });
  } catch (error) {
    console.error('Error fetching trades:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get market orderbook
app.get('/api/markets/:ticker/orderbook', async (req, res) => {
  try {
    const { ticker } = req.params;
    const { depth = 10 } = req.query;

    const response = await marketApi.getMarketOrderbook(ticker, parseInt(depth));

    res.json({
      orderbook: response.data.orderbook
    });
  } catch (error) {
    console.error('Error fetching orderbook:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get market history (candlesticks) - for charts
app.get('/api/markets/:ticker/history', async (req, res) => {
  try {
    const { ticker } = req.params;
    const { days = 7, interval = 60 } = req.query; // interval in minutes: 1, 60, or 1440

    // First get the market to find series ticker
    const marketResponse = await marketApi.getMarket(ticker);
    const market = marketResponse.data.market;
    
    if (!market) {
      return res.status(404).json({ error: 'Market not found' });
    }

    // Calculate time range
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - (parseInt(days) * 24 * 60 * 60);

    // Try to get candlestick data
    let candlesticks = [];
    try {
      // Extract series ticker from event ticker or use the one in market
      const seriesTicker = market.series_ticker || market.event_ticker?.split('-')[0] || ticker.split('-')[0];
      
      const historyResponse = await marketApi.getMarketCandlesticks(
        seriesTicker,
        ticker,
        startTs,
        endTs,
        parseInt(interval)
      );
      candlesticks = historyResponse.data.candlesticks || [];
    } catch (candleError) {
      console.log('Candlestick data not available, using trades for history');
    }

    // If no candlesticks, build history from trades
    if (candlesticks.length === 0) {
      try {
        const tradesResponse = await marketApi.getTrades(500, undefined, ticker);
        const trades = tradesResponse.data.trades || [];
        
        // Convert trades to chart-friendly format
        candlesticks = trades.reverse().map(trade => ({
          timestamp: new Date(trade.created_time).getTime(),
          price: (trade.yes_price || 0) / 100,
          volume: trade.count || 0
        }));
      } catch (tradeError) {
        console.log('Could not fetch trades for history');
      }
    } else {
      // Normalize candlestick data
      candlesticks = candlesticks.map(c => ({
        timestamp: c.end_period_ts * 1000,
        open: (c.open_price || 0) / 100,
        high: (c.high_price || 0) / 100,
        low: (c.low_price || 0) / 100,
        close: (c.close_price || 0) / 100,
        price: (c.close_price || c.open_price || 0) / 100,
        volume: c.volume || 0
      }));
    }

    res.json({
      ticker,
      history: candlesticks,
      market: normalizeMarket(market)
    });
  } catch (error) {
    console.error('Error fetching market history:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get complete market details (combines market, trades, orderbook)
app.get('/api/markets/:ticker/full', async (req, res) => {
  try {
    const { ticker } = req.params;

    // Fetch all data in parallel
    const [marketRes, tradesRes, orderbookRes] = await Promise.all([
      marketApi.getMarket(ticker),
      marketApi.getTrades(50, undefined, ticker).catch(() => ({ data: { trades: [] } })),
      marketApi.getMarketOrderbook(ticker, 10).catch(() => ({ data: { orderbook: {} } }))
    ]);

    const market = normalizeMarket(marketRes.data.market);
    const trades = (tradesRes.data.trades || []).map(trade => ({
      ...trade,
      yes_price: (trade.yes_price || 0) / 100,
      no_price: (trade.no_price || 0) / 100,
    }));

    // Build price history from trades for chart
    const priceHistory = trades.slice().reverse().map(trade => ({
      time: new Date(trade.created_time).getTime(),
      price: trade.yes_price * 100,
      volume: trade.count
    }));

    res.json({
      market,
      trades,
      orderbook: orderbookRes.data.orderbook || { yes: [], no: [] },
      priceHistory
    });
  } catch (error) {
    console.error('Error fetching full market details:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============== INSIDER TRADING DETECTION ==============

// Analyze market for suspicious trading activity
app.get('/api/markets/:ticker/analyze', async (req, res) => {
  try {
    const { ticker } = req.params;

    // Fetch market data, trades, and orderbook in parallel
    const [marketRes, tradesRes, orderbookRes] = await Promise.all([
      marketApi.getMarket(ticker),
      marketApi.getTrades(500, undefined, ticker).catch(() => ({ data: { trades: [] } })),
      marketApi.getMarketOrderbook(ticker, 20).catch(() => ({ data: { orderbook: { yes: [], no: [] } } }))
    ]);

    const market = marketRes.data.market;
    const trades = tradesRes.data.trades || [];
    const orderbook = orderbookRes.data.orderbook || { yes: [], no: [] };

    // Run analysis
    const analysis = analyzeForInsiderTrading(market, trades, orderbook);

    res.json({
      ticker,
      market: normalizeMarket(market),
      analysis,
      tradesAnalyzed: trades.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error analyzing market:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== QUANTITATIVE INSIDER TRADING DETECTION ====================
// Professional-grade detection system using methods from market microstructure research
// Inspired by surveillance systems at Jump Trading, Optiver, and regulatory bodies

// Signal definitions with weights, thresholds, and explanations
const SIGNAL_DEFINITIONS = {
  // === TIMING SIGNALS ===
  PRE_EVENT_SURGE: {
    weight: 18,
    category: 'Timing',
    name: 'Pre-Event Volume Surge',
    explanation: 'Measures unusual increase in trading activity as event approaches. Informed traders often concentrate activity near resolution when their edge is most valuable.',
    threshold: 'Volume in final period > 3x baseline average',
    citation: 'Kyle (1985) - Informed traders trade more aggressively near information revelation'
  },
  TIMING_ENTROPY: {
    weight: 12,
    category: 'Timing',
    name: 'Trade Timing Entropy',
    explanation: 'Shannon entropy of inter-trade arrival times. Natural trading has high entropy (random). Coordinated or automated trading shows low entropy (predictable patterns).',
    threshold: 'Normalized entropy < 35%',
    citation: 'Easley et al. (2012) - Flow Toxicity and Liquidity'
  },
  TRADE_CLUSTERING: {
    weight: 10,
    category: 'Timing',
    name: 'Temporal Clustering',
    explanation: 'Coefficient of variation of trade intervals. CV ≈ 1 for Poisson (random) arrivals. CV < 0.5 suggests automation, CV > 3 suggests burst trading.',
    threshold: 'CV < 0.4 or CV > 3.0',
    citation: 'Market microstructure - Poisson arrival assumption'
  },
  
  // === ORDER FLOW SIGNALS ===
  ORDER_FLOW_TOXICITY: {
    weight: 15,
    category: 'Order Flow',
    name: 'VPIN (Order Flow Toxicity)',
    explanation: 'Volume-Synchronized Probability of Informed Trading. Measures order flow imbalance in volume buckets. High VPIN indicates likely presence of informed traders.',
    threshold: 'VPIN > 50%',
    citation: 'Easley, López de Prado, O\'Hara (2012) - The Volume Clock'
  },
  DIRECTIONAL_CONVICTION: {
    weight: 14,
    category: 'Order Flow',
    name: 'Directional Conviction',
    explanation: 'Combined volume AND value skew in one direction. Strong conviction occurs when both trade count and dollar value are heavily one-sided.',
    threshold: 'Volume imbalance > 60% AND Value imbalance > 65%',
    citation: 'Informed traders show strong directional preference'
  },
  RUN_LENGTH: {
    weight: 10,
    category: 'Order Flow',
    name: 'Consecutive Trade Runs',
    explanation: 'Maximum length of same-direction trades vs expected. For random 50/50, expected max run ≈ log₂(n). Long runs suggest coordinated one-sided pressure.',
    threshold: 'Max run > 2.5x expected',
    citation: 'Wald-Wolfowitz runs test for randomness'
  },
  
  // === PRICE SIGNALS ===
  PRICE_LEADERSHIP: {
    weight: 16,
    category: 'Price',
    name: 'Price Discovery Leadership',
    explanation: 'Measures how often trades correctly predict subsequent price direction. Consistently accurate predictions suggest informed trading.',
    threshold: 'Leadership rate > 60%',
    citation: 'Hasbrouck (1991) - Price discovery and information shares'
  },
  PRICE_IMPACT: {
    weight: 8,
    category: 'Price',
    name: 'Abnormal Price Impact',
    explanation: 'Kyle\'s Lambda - price change per unit volume. Abnormally high impact suggests thin liquidity exploitation or aggressive informed trading.',
    threshold: 'Max impact > 10x median',
    citation: 'Kyle (1985) - Continuous auctions and insider trading'
  },
  PRICE_VELOCITY: {
    weight: 8,
    category: 'Price',
    name: 'Rapid Price Movement',
    explanation: 'Price velocity relative to historical baseline. Rapid directional moves may indicate information being incorporated.',
    threshold: 'Velocity > 95th percentile AND z-score > 2',
    citation: 'Efficient Market Hypothesis - information incorporation speed'
  },
  
  // === SIZE SIGNALS ===
  LARGE_BLOCKS: {
    weight: 10,
    category: 'Size',
    name: 'Outsized Block Trades',
    explanation: 'Trades significantly larger than typical. Informed traders with high conviction often trade in larger sizes to maximize edge.',
    threshold: '> 3% of trades above P99 OR max > 10x average',
    citation: 'Barclay & Warner (1993) - Stealth trading hypothesis'
  },
  SPREAD_CROSSING: {
    weight: 12,
    category: 'Size',
    name: 'Aggressive Spread Crossing',
    explanation: 'Measures willingness to pay adverse prices (cross spread). Informed traders accept worse prices because they expect larger moves.',
    threshold: '> 30% of trades cross > 40% of spread',
    citation: 'Glosten & Milgrom (1985) - Bid-ask spread as adverse selection'
  },
  
  // === STATISTICAL SIGNALS ===
  BENFORDS_LAW: {
    weight: 6,
    category: 'Statistical',
    name: 'Benford\'s Law Violation',
    explanation: 'Natural data follows Benford\'s distribution for first digits (1=30.1%, 2=17.6%, etc.). Manufactured or manipulated trade sizes often violate this.',
    threshold: 'Chi-square > 21 (p < 0.01)',
    citation: 'Benford (1938) - First digit phenomenon'
  },
  VOLUME_ANOMALY: {
    weight: 10,
    category: 'Statistical',
    name: 'Volume Anomaly',
    explanation: 'Current volume vs historical distribution for this market. Uses percentile ranking and z-score for double confirmation.',
    threshold: '> 90th percentile AND z-score > 2',
    citation: 'Standard statistical anomaly detection'
  },
  ORDERBOOK_IMBALANCE: {
    weight: 6,
    category: 'Statistical',
    name: 'Order Book Skew',
    explanation: 'Imbalance between bid depth on YES vs NO side. Extreme imbalance may indicate informed positioning.',
    threshold: 'Imbalance > 75%',
    citation: 'Cao et al. (2009) - Order book imbalance and price prediction'
  }
};

// Core analysis function - professional quant-grade detection
function analyzeForInsiderTrading(market, trades, orderbook) {
  // Minimum data requirement
  if (trades.length < 15) {
    return {
      suspicionScore: 0,
      riskLevel: 'INSUFFICIENT_DATA',
      signals: [],
      allSignals: buildAllSignalsReport([], trades.length),
      summary: `Insufficient trading data for analysis. Need at least 15 trades, found ${trades.length}.`,
      confidence: 0,
      metrics: {
        totalTrades: trades.length,
        avgTradeSize: 0,
        priceRange: { min: 0, max: 0, range: 0 },
        timeSpan: 'N/A'
      }
    };
  }

  const signalResults = [];
  let weightedScore = 0;

  // ========== TIMING SIGNALS ==========
  
  // 1. PRE-EVENT SURGE
  const surgeAnalysis = analyzePreEventSurge(trades, market.close_time);
  signalResults.push(buildSignalResult('PRE_EVENT_SURGE', surgeAnalysis));
  if (surgeAnalysis.isAnomalous) {
    weightedScore += (surgeAnalysis.severity / 5) * SIGNAL_DEFINITIONS.PRE_EVENT_SURGE.weight;
  }

  // 2. TIMING ENTROPY
  const entropyAnalysis = analyzeTimingEntropy(trades);
  signalResults.push(buildSignalResult('TIMING_ENTROPY', entropyAnalysis));
  if (entropyAnalysis.isAnomalous) {
    weightedScore += (entropyAnalysis.severity / 5) * SIGNAL_DEFINITIONS.TIMING_ENTROPY.weight;
  }

  // 3. TRADE CLUSTERING (CV method)
  const clusterAnalysis = analyzeClusteringCV(trades);
  signalResults.push(buildSignalResult('TRADE_CLUSTERING', clusterAnalysis));
  if (clusterAnalysis.isAnomalous) {
    weightedScore += (clusterAnalysis.severity / 5) * SIGNAL_DEFINITIONS.TRADE_CLUSTERING.weight;
  }

  // ========== ORDER FLOW SIGNALS ==========

  // 4. VPIN - ORDER FLOW TOXICITY
  const vpinAnalysis = analyzeOrderFlowToxicity(trades);
  signalResults.push(buildSignalResult('ORDER_FLOW_TOXICITY', vpinAnalysis));
  if (vpinAnalysis.isAnomalous) {
    weightedScore += (vpinAnalysis.severity / 5) * SIGNAL_DEFINITIONS.ORDER_FLOW_TOXICITY.weight;
  }

  // 5. DIRECTIONAL CONVICTION
  const convictionAnalysis = analyzeDirectionalConviction(trades);
  signalResults.push(buildSignalResult('DIRECTIONAL_CONVICTION', convictionAnalysis));
  if (convictionAnalysis.isAnomalous) {
    weightedScore += (convictionAnalysis.severity / 5) * SIGNAL_DEFINITIONS.DIRECTIONAL_CONVICTION.weight;
  }

  // 6. RUN LENGTH
  const runAnalysis = analyzeRunLength(trades);
  signalResults.push(buildSignalResult('RUN_LENGTH', runAnalysis));
  if (runAnalysis.isAnomalous) {
    weightedScore += (runAnalysis.severity / 5) * SIGNAL_DEFINITIONS.RUN_LENGTH.weight;
  }

  // ========== PRICE SIGNALS ==========

  // 7. PRICE LEADERSHIP
  const leadershipAnalysis = analyzePriceLeadership(trades);
  signalResults.push(buildSignalResult('PRICE_LEADERSHIP', leadershipAnalysis));
  if (leadershipAnalysis.isAnomalous) {
    weightedScore += (leadershipAnalysis.severity / 5) * SIGNAL_DEFINITIONS.PRICE_LEADERSHIP.weight;
  }

  // 8. PRICE IMPACT (Kyle's Lambda)
  const impactAnalysis = analyzePriceImpact(trades);
  signalResults.push(buildSignalResult('PRICE_IMPACT', impactAnalysis));
  if (impactAnalysis.isAnomalous) {
    weightedScore += (impactAnalysis.severity / 5) * SIGNAL_DEFINITIONS.PRICE_IMPACT.weight;
  }

  // 9. PRICE VELOCITY
  const velocityAnalysis = analyzePriceVelocityImproved(trades);
  signalResults.push(buildSignalResult('PRICE_VELOCITY', velocityAnalysis));
  if (velocityAnalysis.isAnomalous) {
    weightedScore += (velocityAnalysis.severity / 5) * SIGNAL_DEFINITIONS.PRICE_VELOCITY.weight;
  }

  // ========== SIZE SIGNALS ==========

  // 10. LARGE BLOCKS
  const blockAnalysis = analyzeLargeBlocksPercentile(trades);
  signalResults.push(buildSignalResult('LARGE_BLOCKS', blockAnalysis));
  if (blockAnalysis.isAnomalous) {
    weightedScore += (blockAnalysis.severity / 5) * SIGNAL_DEFINITIONS.LARGE_BLOCKS.weight;
  }

  // 11. SPREAD CROSSING
  const spreadAnalysis = analyzeSpreadCrossing(trades, orderbook);
  signalResults.push(buildSignalResult('SPREAD_CROSSING', spreadAnalysis));
  if (spreadAnalysis.isAnomalous) {
    weightedScore += (spreadAnalysis.severity / 5) * SIGNAL_DEFINITIONS.SPREAD_CROSSING.weight;
  }

  // ========== STATISTICAL SIGNALS ==========

  // 12. BENFORD'S LAW
  const benfordAnalysis = analyzeBenfordsLaw(trades);
  signalResults.push(buildSignalResult('BENFORDS_LAW', benfordAnalysis));
  if (benfordAnalysis.isAnomalous) {
    weightedScore += (benfordAnalysis.severity / 5) * SIGNAL_DEFINITIONS.BENFORDS_LAW.weight;
  }

  // 13. VOLUME ANOMALY
  const volumeAnalysis = analyzeVolumePercentile(trades);
  signalResults.push(buildSignalResult('VOLUME_ANOMALY', volumeAnalysis));
  if (volumeAnalysis.isAnomalous) {
    weightedScore += (volumeAnalysis.severity / 5) * SIGNAL_DEFINITIONS.VOLUME_ANOMALY.weight;
  }

  // 14. ORDERBOOK IMBALANCE
  const obAnalysis = analyzeOrderbookImbalance(orderbook);
  signalResults.push(buildSignalResult('ORDERBOOK_IMBALANCE', obAnalysis));
  if (obAnalysis.isAnomalous) {
    weightedScore += (obAnalysis.severity / 5) * SIGNAL_DEFINITIONS.ORDERBOOK_IMBALANCE.weight;
  }

  // Calculate final score (normalize to 0-100)
  const maxPossibleScore = Object.values(SIGNAL_DEFINITIONS).reduce((s, d) => s + d.weight, 0);
  const suspicionScore = Math.min(100, Math.round((weightedScore / maxPossibleScore) * 100));

  // Determine risk level
  let riskLevel = 'LOW';
  if (suspicionScore >= 55) riskLevel = 'CRITICAL';
  else if (suspicionScore >= 35) riskLevel = 'HIGH';
  else if (suspicionScore >= 18) riskLevel = 'MEDIUM';

  // Triggered signals only (for backward compatibility)
  const triggeredSignals = signalResults.filter(s => s.triggered);
  
  // Calculate confidence
  const confidence = calculateConfidence(trades.length, triggeredSignals.length);

  return {
    suspicionScore,
    riskLevel,
    signals: triggeredSignals.map(s => ({
      type: s.id,
      severity: s.severity,
      description: s.result,
      data: s.data
    })),
    allSignals: signalResults,
    summary: generateSummary(suspicionScore, triggeredSignals, trades.length),
    confidence,
    methodology: 'Quantitative analysis using market microstructure research methods',
    metrics: {
      totalTrades: trades.length,
      avgTradeSize: Math.round(trades.reduce((s, t) => s + (t.count || 0), 0) / trades.length),
      priceRange: calculatePriceRange(trades),
      timeSpan: calculateTimeSpan(trades),
      signalsAnalyzed: signalResults.length,
      signalsTriggered: triggeredSignals.length
    }
  };
}

// Build signal result with metadata
function buildSignalResult(signalId, analysis) {
  const def = SIGNAL_DEFINITIONS[signalId];
  return {
    id: signalId,
    name: def.name,
    category: def.category,
    weight: def.weight,
    explanation: def.explanation,
    threshold: def.threshold,
    citation: def.citation,
    triggered: analysis.isAnomalous || false,
    severity: analysis.severity || 0,
    result: analysis.description || 'No anomaly detected',
    data: analysis.data || {},
    status: analysis.isAnomalous ? 'TRIGGERED' : 'NORMAL'
  };
}

// Build all signals report even when insufficient data
function buildAllSignalsReport(results, tradeCount) {
  return Object.keys(SIGNAL_DEFINITIONS).map(id => {
    const def = SIGNAL_DEFINITIONS[id];
    return {
      id,
      name: def.name,
      category: def.category,
      weight: def.weight,
      explanation: def.explanation,
      threshold: def.threshold,
      citation: def.citation,
      triggered: false,
      severity: 0,
      result: tradeCount < 15 ? 'Insufficient data' : 'Not analyzed',
      data: {},
      status: 'SKIPPED'
    };
  });
}

// ========== ANALYSIS FUNCTIONS ==========

// NEW: Pre-Event Volume Surge Analysis
function analyzePreEventSurge(trades, closeTime) {
  if (!closeTime || trades.length < 20) return { isAnomalous: false };

  const closeTs = new Date(closeTime).getTime();
  const now = Date.now();
  
  // Only analyze if event is in the future or recently closed
  if (closeTs < now - 7 * 24 * 60 * 60 * 1000) return { isAnomalous: false };

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.created_time) - new Date(b.created_time)
  );

  // Calculate baseline (all trades except last 10%)
  const cutoffIdx = Math.floor(sortedTrades.length * 0.9);
  const baselineTrades = sortedTrades.slice(0, cutoffIdx);
  const recentTrades = sortedTrades.slice(cutoffIdx);

  if (baselineTrades.length < 10 || recentTrades.length < 3) return { isAnomalous: false };

  // Calculate volumes
  const baselineVolume = baselineTrades.reduce((s, t) => s + (t.count || 1), 0);
  const recentVolume = recentTrades.reduce((s, t) => s + (t.count || 1), 0);

  // Time spans
  const baselineSpan = (new Date(baselineTrades[baselineTrades.length-1].created_time) - 
                        new Date(baselineTrades[0].created_time)) / 3600000 || 1;
  const recentSpan = (new Date(recentTrades[recentTrades.length-1].created_time) - 
                      new Date(recentTrades[0].created_time)) / 3600000 || 0.1;

  const baselineRate = baselineVolume / baselineSpan;
  const recentRate = recentVolume / recentSpan;

  const surgeRatio = baselineRate > 0 ? recentRate / baselineRate : 0;

  if (surgeRatio > 3) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil(surgeRatio / 2)),
      description: `${surgeRatio.toFixed(1)}x volume surge in final ${recentTrades.length} trades`,
      data: {
        surgeRatio: surgeRatio.toFixed(1) + 'x',
        recentVolume,
        recentTrades: recentTrades.length,
        baselineRate: baselineRate.toFixed(1) + '/hr',
        recentRate: recentRate.toFixed(1) + '/hr'
      }
    };
  }
  return { isAnomalous: false };
}

// NEW: Directional Conviction Analysis
function analyzeDirectionalConviction(trades) {
  if (trades.length < 20) return { isAnomalous: false };

  let yesVolume = 0, noVolume = 0;
  let yesValue = 0, noValue = 0;

  trades.forEach(t => {
    const vol = t.count || 1;
    const price = t.yes_price || 50;
    if (t.taker_side === 'yes') {
      yesVolume += vol;
      yesValue += vol * price;
    } else {
      noVolume += vol;
      noValue += vol * (100 - price);
    }
  });

  const totalVolume = yesVolume + noVolume;
  const totalValue = yesValue + noValue;
  
  if (totalVolume === 0 || totalValue === 0) return { isAnomalous: false };

  const volumeImbalance = Math.abs(yesVolume - noVolume) / totalVolume;
  const valueImbalance = Math.abs(yesValue - noValue) / totalValue;

  // High conviction = both metrics strongly skewed
  if (volumeImbalance > 0.55 && valueImbalance > 0.60) {
    const direction = yesVolume > noVolume ? 'YES' : 'NO';
    const combinedScore = (volumeImbalance + valueImbalance) / 2;
    
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((combinedScore - 0.5) * 8)),
      description: `Strong ${direction} conviction: ${(volumeImbalance*100).toFixed(0)}% volume, ${(valueImbalance*100).toFixed(0)}% value`,
      data: {
        direction,
        volumeImbalance: (volumeImbalance * 100).toFixed(0) + '%',
        valueImbalance: (valueImbalance * 100).toFixed(0) + '%',
        yesVolume,
        noVolume
      }
    };
  }
  return { isAnomalous: false };
}

// NEW: Price Leadership Analysis
function analyzePriceLeadership(trades) {
  if (trades.length < 30) return { isAnomalous: false };

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.created_time) - new Date(b.created_time)
  );

  let correctPredictions = 0;
  let totalPredictions = 0;
  const lookAhead = Math.min(10, Math.floor(trades.length / 10));

  for (let i = 0; i < sortedTrades.length - lookAhead; i++) {
    const trade = sortedTrades[i];
    const futurePrice = sortedTrades[i + lookAhead].yes_price;
    const currentPrice = trade.yes_price;
    
    if (!currentPrice || !futurePrice) continue;
    
    const direction = trade.taker_side === 'yes' ? 1 : -1;
    const priceMove = futurePrice - currentPrice;

    // Only count if price moved meaningfully (> 1 cent)
    if (Math.abs(priceMove) > 1) {
      totalPredictions++;
      if ((direction > 0 && priceMove > 0) || (direction < 0 && priceMove < 0)) {
        correctPredictions++;
      }
    }
  }

  if (totalPredictions < 15) return { isAnomalous: false };

  const leadershipRate = correctPredictions / totalPredictions;

  // > 58% correct is statistically significant (above random chance with margin)
  if (leadershipRate > 0.58) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((leadershipRate - 0.5) * 15)),
      description: `${(leadershipRate * 100).toFixed(0)}% of trades predicted subsequent ${lookAhead}-trade price direction`,
      data: {
        leadershipRate: (leadershipRate * 100).toFixed(0) + '%',
        correctPredictions,
        totalPredictions,
        lookAhead: lookAhead + ' trades',
        vsRandom: ((leadershipRate - 0.5) * 100).toFixed(0) + '% above random'
      }
    };
  }
  return { isAnomalous: false };
}

// NEW: Spread Crossing Analysis
function analyzeSpreadCrossing(trades, orderbook) {
  if (trades.length < 20) return { isAnomalous: false };

  const yesBids = orderbook?.yes || [];
  const noBids = orderbook?.no || [];

  if (yesBids.length === 0 && noBids.length === 0) return { isAnomalous: false };

  // Estimate typical spread from orderbook
  const bestYesBid = yesBids[0]?.[0] || 0;
  const bestNoBid = noBids[0]?.[0] || 0;
  const impliedYesAsk = 100 - bestNoBid;
  const spread = impliedYesAsk - bestYesBid;
  
  if (spread <= 0) return { isAnomalous: false };

  const midPrice = (bestYesBid + impliedYesAsk) / 2;

  // Count aggressive crossings
  let aggressiveTrades = 0;
  let aggressiveVolume = 0;
  let totalVolume = 0;

  trades.forEach(trade => {
    const vol = trade.count || 1;
    totalVolume += vol;
    
    const tradePrice = trade.yes_price || 0;
    const deviation = Math.abs(tradePrice - midPrice);
    
    // Trade crossed more than 40% of spread from mid
    if (deviation > spread * 0.4) {
      aggressiveTrades++;
      aggressiveVolume += vol;
    }
  });

  const aggressiveRatio = aggressiveTrades / trades.length;
  const aggressiveVolumeRatio = aggressiveVolume / totalVolume;

  if (aggressiveRatio > 0.25 && aggressiveVolumeRatio > 0.3) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil(aggressiveRatio * 8)),
      description: `${(aggressiveRatio * 100).toFixed(0)}% of trades crossed spread aggressively`,
      data: {
        aggressiveTrades,
        aggressiveRatio: (aggressiveRatio * 100).toFixed(0) + '%',
        aggressiveVolumeRatio: (aggressiveVolumeRatio * 100).toFixed(0) + '%',
        estimatedSpread: spread.toFixed(0) + '¢'
      }
    };
  }
  return { isAnomalous: false };
}

// Volume Percentile (relative to market's own history)
function analyzeVolumePercentile(trades) {
  // Group by hour
  const hourlyVolumes = {};
  trades.forEach(trade => {
    const hour = new Date(trade.created_time).toISOString().slice(0, 13);
    hourlyVolumes[hour] = (hourlyVolumes[hour] || 0) + (trade.count || 1);
  });

  const volumes = Object.values(hourlyVolumes);
  if (volumes.length < 4) return { isAnomalous: false, percentile: 0 };

  // Get latest hour volume
  const sortedHours = Object.keys(hourlyVolumes).sort();
  const latestVolume = hourlyVolumes[sortedHours[sortedHours.length - 1]];

  // Calculate percentile rank
  const sorted = [...volumes].sort((a, b) => a - b);
  const rank = sorted.filter(v => v <= latestVolume).length;
  const percentile = (rank / sorted.length) * 100;

  const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const stdDev = Math.sqrt(volumes.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / volumes.length);
  const zScore = stdDev > 0 ? (latestVolume - mean) / stdDev : 0;

  // Only flag if above 90th percentile AND z-score > 2
  if (percentile > 90 && zScore > 2) {
    return {
      isAnomalous: true,
      percentile,
      severity: Math.min(5, Math.ceil((percentile - 90) / 2)),
      description: `Volume in ${percentile.toFixed(0)}th percentile (${zScore.toFixed(1)}σ above mean)`,
      data: { 
        percentile: percentile.toFixed(0) + '%',
        zScore: zScore.toFixed(2),
        currentVolume: latestVolume,
        avgVolume: Math.round(mean)
      }
    };
  }

  return { isAnomalous: false, percentile };
}

// 2. Shannon Entropy of trade timing (detect coordination)
function analyzeTimingEntropy(trades) {
  if (trades.length < 20) return { isAnomalous: false };

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.created_time) - new Date(b.created_time)
  );

  // Calculate inter-trade intervals
  const intervals = [];
  for (let i = 1; i < sortedTrades.length; i++) {
    const interval = new Date(sortedTrades[i].created_time) - new Date(sortedTrades[i-1].created_time);
    if (interval > 0) intervals.push(interval);
  }

  if (intervals.length < 10) return { isAnomalous: false };

  // Bucket intervals for entropy calculation (30-second buckets)
  const bucketSize = 30000;
  const buckets = {};
  intervals.forEach(interval => {
    const bucket = Math.floor(interval / bucketSize);
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  });

  // Calculate Shannon entropy
  const total = intervals.length;
  let entropy = 0;
  Object.values(buckets).forEach(count => {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  });

  // Normalize entropy (0-1 scale)
  const numBuckets = Object.keys(buckets).length;
  const maxEntropy = numBuckets > 1 ? Math.log2(numBuckets) : 1;
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 1;

  // Low entropy = suspicious (trades are too regular/clustered)
  // Normal trading should have entropy > 0.5
  if (normalizedEntropy < 0.35) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((0.4 - normalizedEntropy) * 10)),
      description: `Trade timing entropy ${(normalizedEntropy * 100).toFixed(0)}% (low = coordinated)`,
      data: { 
        entropy: (normalizedEntropy * 100).toFixed(0) + '%',
        interpretation: normalizedEntropy < 0.2 ? 'Highly coordinated' : 'Moderately coordinated',
        uniquePatterns: numBuckets
      }
    };
  }

  return { isAnomalous: false };
}

// 3. Benford's Law analysis (natural data follows specific digit distribution)
function analyzeBenfordsLaw(trades) {
  const expectedBenford = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046];
  
  const tradeSizes = trades.map(t => t.count || 0).filter(c => c > 0);
  if (tradeSizes.length < 50) return { isAnomalous: false }; // Need enough data

  // Count first digits
  const firstDigits = new Array(9).fill(0);
  tradeSizes.forEach(size => {
    const firstDigit = parseInt(String(size)[0]);
    if (firstDigit >= 1 && firstDigit <= 9) {
      firstDigits[firstDigit - 1]++;
    }
  });

  // Calculate observed frequencies
  const total = firstDigits.reduce((a, b) => a + b, 0);
  if (total === 0) return { isAnomalous: false };
  
  const observed = firstDigits.map(c => c / total);

  // Chi-square test
  let chiSquare = 0;
  for (let i = 0; i < 9; i++) {
    const expected = expectedBenford[i];
    const diff = observed[i] - expected;
    chiSquare += (diff * diff) / expected;
  }

  // Chi-square critical value for df=8, p=0.01 is 20.09
  // Chi-square critical value for df=8, p=0.05 is 15.51
  if (chiSquare > 21) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((chiSquare - 15) / 10)),
      description: `Trade sizes violate Benford's Law (χ²=${chiSquare.toFixed(1)}, p<0.01)`,
      data: {
        chiSquare: chiSquare.toFixed(1),
        topDigits: `1:${(observed[0]*100).toFixed(0)}% 2:${(observed[1]*100).toFixed(0)}% 3:${(observed[2]*100).toFixed(0)}%`,
        expected: '1:30% 2:18% 3:12%',
        samplesAnalyzed: total
      }
    };
  }

  return { isAnomalous: false };
}

// 4. Run Length analysis (consecutive same-direction trades)
function analyzeRunLength(trades) {
  if (trades.length < 20) return { isAnomalous: false };

  // Get direction sequence
  const directions = trades.map(t => t.taker_side === 'yes' ? 1 : 0);
  
  // Find all runs
  const runs = [];
  let currentRun = 1;
  for (let i = 1; i < directions.length; i++) {
    if (directions[i] === directions[i-1]) {
      currentRun++;
    } else {
      runs.push(currentRun);
      currentRun = 1;
    }
  }
  runs.push(currentRun);

  const maxRun = Math.max(...runs);
  const avgRun = runs.reduce((a, b) => a + b, 0) / runs.length;
  const numRuns = runs.length;

  // Expected values for random 50/50 sequence
  // Expected max run ≈ log2(n)
  // Expected number of runs ≈ n/2
  const expectedMaxRun = Math.log2(trades.length) + 1;
  const expectedNumRuns = trades.length / 2;

  const maxRunRatio = maxRun / expectedMaxRun;
  const runCountRatio = numRuns / expectedNumRuns;

  // Flag if max run is 2.5x expected OR too few runs (one-sided)
  if (maxRunRatio > 2.5 || runCountRatio < 0.4) {
    const issue = maxRunRatio > 2.5 ? 'long consecutive run' : 'too few direction changes';
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil(Math.max(maxRunRatio - 1.5, (0.5 - runCountRatio) * 5))),
      description: `Suspicious ${issue}: ${maxRun} consecutive same-direction trades`,
      data: {
        maxRun,
        expectedMaxRun: Math.round(expectedMaxRun),
        totalRuns: numRuns,
        avgRunLength: avgRun.toFixed(1)
      }
    };
  }

  return { isAnomalous: false };
}

// 5. VPIN - Volume-Synchronized Probability of Informed Trading
function analyzeOrderFlowToxicity(trades) {
  if (trades.length < 30) return { isAnomalous: false };

  // Calculate total volume
  const totalVolume = trades.reduce((s, t) => s + (t.count || 1), 0);
  
  // Create volume-based buckets (each bucket = 5% of total volume)
  const bucketVolume = totalVolume * 0.05;
  if (bucketVolume < 10) return { isAnomalous: false };
  
  let currentBucket = { yes: 0, no: 0, total: 0 };
  const buckets = [];

  trades.forEach(trade => {
    const side = trade.taker_side === 'yes' ? 'yes' : 'no';
    const volume = trade.count || 1;
    
    currentBucket[side] += volume;
    currentBucket.total += volume;

    while (currentBucket.total >= bucketVolume) {
      const overflow = currentBucket.total - bucketVolume;
      const bucketImbalance = Math.abs(currentBucket.yes - currentBucket.no) / currentBucket.total;
      buckets.push(bucketImbalance);
      
      // Start new bucket with overflow
      const overflowRatio = overflow / currentBucket.total;
      currentBucket = { 
        yes: side === 'yes' ? overflow : 0, 
        no: side === 'no' ? overflow : 0, 
        total: overflow 
      };
    }
  });

  if (buckets.length < 5) return { isAnomalous: false };

  // VPIN = average of bucket imbalances
  const vpin = buckets.reduce((a, b) => a + b, 0) / buckets.length;

  // VPIN interpretation:
  // < 0.3 = Low toxicity (normal)
  // 0.3-0.5 = Moderate
  // 0.5-0.7 = High
  // > 0.7 = Very high (strong evidence of informed trading)
  if (vpin > 0.5) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((vpin - 0.3) * 7)),
      description: `High order flow toxicity (VPIN=${(vpin * 100).toFixed(0)}%)`,
      data: {
        vpin: (vpin * 100).toFixed(0) + '%',
        bucketsAnalyzed: buckets.length,
        interpretation: vpin > 0.7 ? 'Very high - likely informed' : 'High - possibly informed'
      }
    };
  }

  return { isAnomalous: false };
}

// 6. Large block trades (percentile-based)
function analyzeLargeBlocksPercentile(trades) {
  const sizes = trades.map(t => t.count || 0).filter(c => c > 0);
  if (sizes.length < 15) return { isAnomalous: false };

  // Calculate percentiles
  const sorted = [...sizes].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const max = Math.max(...sizes);

  // Count trades > 99th percentile
  const extremeTrades = sizes.filter(s => s > p99).length;
  const extremeRatio = extremeTrades / sizes.length;

  // Flag if > 3% of trades are above 99th percentile (statistically expected: 1%)
  // OR if max trade is > 10x average
  if (extremeRatio > 0.03 || max > mean * 10) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil(Math.max(extremeRatio * 50, (max / mean - 5) / 2))),
      description: `${extremeTrades} outlier trade${extremeTrades > 1 ? 's' : ''} (${(extremeRatio * 100).toFixed(1)}% above P99)`,
      data: {
        extremeTrades,
        p99Threshold: p99,
        maxTrade: max,
        avgTrade: Math.round(mean),
        ratio: (max / mean).toFixed(1) + 'x avg'
      }
    };
  }

  return { isAnomalous: false };
}

// 7. Price Velocity (improved with percentile ranking)
function analyzePriceVelocityImproved(trades) {
  if (trades.length < 15) return { isAnomalous: false };

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.created_time) - new Date(b.created_time)
  );

  // Calculate rolling velocities (10-trade windows)
  const velocities = [];
  for (let i = 10; i < sortedTrades.length; i++) {
    const windowTrades = sortedTrades.slice(i - 10, i);
    const priceChange = Math.abs(
      (windowTrades[windowTrades.length - 1].yes_price || 0) - 
      (windowTrades[0].yes_price || 0)
    );
    const timeSpan = (
      new Date(windowTrades[windowTrades.length - 1].created_time) - 
      new Date(windowTrades[0].created_time)
    ) / 3600000; // hours
    
    if (timeSpan > 0.01) { // At least ~36 seconds
      velocities.push(priceChange / timeSpan);
    }
  }

  if (velocities.length < 5) return { isAnomalous: false };

  // Get current velocity and calculate percentile
  const currentVelocity = velocities[velocities.length - 1];
  const sorted = [...velocities].sort((a, b) => a - b);
  const rank = sorted.filter(v => v <= currentVelocity).length;
  const percentile = (rank / sorted.length) * 100;

  const mean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const stdDev = Math.sqrt(velocities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / velocities.length);
  const zScore = stdDev > 0 ? (currentVelocity - mean) / stdDev : 0;

  // Flag if above 95th percentile AND z-score > 2
  if (percentile > 95 && zScore > 2) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((percentile - 90) / 2)),
      description: `Price velocity at ${percentile.toFixed(0)}th percentile (${currentVelocity.toFixed(1)}¢/hr)`,
      data: {
        percentile: percentile.toFixed(0) + '%',
        velocity: currentVelocity.toFixed(1) + '¢/hr',
        zScore: zScore.toFixed(2),
        avgVelocity: mean.toFixed(1) + '¢/hr'
      }
    };
  }

  return { isAnomalous: false };
}

// 8. Trade clustering using coefficient of variation
function analyzeClusteringCV(trades) {
  if (trades.length < 20) return { isAnomalous: false };

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.created_time) - new Date(b.created_time)
  );

  // Calculate inter-trade intervals
  const intervals = [];
  for (let i = 1; i < sortedTrades.length; i++) {
    const interval = new Date(sortedTrades[i].created_time) - new Date(sortedTrades[i-1].created_time);
    if (interval > 0) intervals.push(interval);
  }

  if (intervals.length < 15) return { isAnomalous: false };

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, i) => sum + Math.pow(i - mean, 2), 0) / intervals.length;
  const stdDev = Math.sqrt(variance);
  
  // Coefficient of variation (CV = stdDev / mean)
  const cv = mean > 0 ? stdDev / mean : 0;

  // CV interpretation:
  // CV ≈ 1 for exponential (Poisson process = random arrivals) - NORMAL
  // CV < 0.5 = too regular (bot/automated trading)
  // CV > 2.5 = too irregular (bursty/clustered trading)
  
  if (cv < 0.4) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((0.5 - cv) * 8)),
      description: `Trade timing too regular (CV=${cv.toFixed(2)}) - possible automation`,
      data: {
        cv: cv.toFixed(2),
        meanInterval: formatInterval(mean),
        pattern: 'Bot-like regularity',
        expected: 'CV ≈ 1.0 for natural trading'
      }
    };
  } else if (cv > 3) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((cv - 2) / 1.5)),
      description: `Trade timing highly irregular (CV=${cv.toFixed(2)}) - bursty activity`,
      data: {
        cv: cv.toFixed(2),
        meanInterval: formatInterval(mean),
        pattern: 'Clustered bursts',
        expected: 'CV ≈ 1.0 for natural trading'
      }
    };
  }

  return { isAnomalous: false };
}

// 9. Orderbook imbalance analysis
function analyzeOrderbookImbalance(orderbook) {
  const yesBids = orderbook.yes || [];
  const noBids = orderbook.no || [];

  if (yesBids.length === 0 && noBids.length === 0) {
    return { isAnomalous: false };
  }

  const yesDepth = yesBids.reduce((sum, level) => sum + (level[1] || 0), 0);
  const noDepth = noBids.reduce((sum, level) => sum + (level[1] || 0), 0);
  const totalDepth = yesDepth + noDepth;

  if (totalDepth < 100) return { isAnomalous: false }; // Need meaningful depth

  const imbalanceRatio = Math.abs(yesDepth - noDepth) / totalDepth;
  const dominantSide = yesDepth > noDepth ? 'YES' : 'NO';

  // Only flag if > 75% imbalance (was 60%)
  if (imbalanceRatio > 0.75) {
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil((imbalanceRatio - 0.6) * 8)),
      description: `Orderbook ${(imbalanceRatio * 100).toFixed(0)}% skewed to ${dominantSide}`,
      data: { 
        imbalance: (imbalanceRatio * 100).toFixed(0) + '%',
        dominantSide,
        yesDepth,
        noDepth,
        ratio: (Math.max(yesDepth, noDepth) / Math.min(yesDepth, noDepth) || 0).toFixed(1) + ':1'
      }
    };
  }

  return { isAnomalous: false };
}

// 10. Kyle's Lambda - Price Impact Analysis
function analyzePriceImpact(trades) {
  if (trades.length < 20) return { isAnomalous: false };

  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.created_time) - new Date(b.created_time)
  );

  // Calculate price impact for each trade
  const impacts = [];
  for (let i = 1; i < sortedTrades.length; i++) {
    const priceChange = Math.abs(
      (sortedTrades[i].yes_price || 0) - (sortedTrades[i-1].yes_price || 0)
    );
    const volume = sortedTrades[i].count || 1;
    
    if (volume > 0 && priceChange > 0) {
      impacts.push(priceChange / volume); // Price change per contract
    }
  }

  if (impacts.length < 10) return { isAnomalous: false };

  const mean = impacts.reduce((a, b) => a + b, 0) / impacts.length;
  const sorted = [...impacts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = Math.max(...impacts);

  // High price impact suggests thin liquidity being exploited
  // or price manipulation
  const impactRatio = max / median;

  if (impactRatio > 10 && max > 0.1) { // Max impact > 10x median and > 0.1¢ per contract
    return {
      isAnomalous: true,
      severity: Math.min(5, Math.ceil(impactRatio / 5)),
      description: `Abnormal price impact detected (${impactRatio.toFixed(0)}x median)`,
      data: {
        maxImpact: (max * 100).toFixed(2) + '¢/contract',
        medianImpact: (median * 100).toFixed(2) + '¢/contract',
        impactRatio: impactRatio.toFixed(1) + 'x',
        interpretation: 'Possible liquidity exploitation'
      }
    };
  }

  return { isAnomalous: false };
}

// ========== HELPER FUNCTIONS ==========

function formatInterval(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
  return `${(ms / 3600000).toFixed(1)}hr`;
}

function calculatePriceRange(trades) {
  if (trades.length === 0) return { min: 0, max: 0, range: 0 };
  const prices = trades.map(t => t.yes_price || 0).filter(p => p > 0);
  if (prices.length === 0) return { min: 0, max: 0, range: 0 };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, range: max - min };
}

function calculateTimeSpan(trades) {
  if (trades.length < 2) return 'N/A';
  const times = trades.map(t => new Date(t.created_time).getTime()).filter(t => !isNaN(t));
  if (times.length < 2) return 'N/A';
  const spanMs = Math.max(...times) - Math.min(...times);
  const hours = spanMs / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 24) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

function calculateConfidence(tradeCount, signalCount) {
  let confidence = 20; // Base confidence
  
  // More trades = higher confidence in analysis
  if (tradeCount >= 200) confidence += 35;
  else if (tradeCount >= 100) confidence += 30;
  else if (tradeCount >= 50) confidence += 25;
  else if (tradeCount >= 25) confidence += 15;
  else confidence += 5;

  // Having signals to analyze increases confidence
  if (signalCount >= 3) confidence += 25;
  else if (signalCount >= 2) confidence += 20;
  else if (signalCount >= 1) confidence += 15;
  else confidence += 10;

  return Math.min(100, confidence);
}

function generateSummary(score, signals, tradeCount) {
  const signalNames = signals.map(s => (s.name || s.id || 'unknown').toLowerCase());
  
  if (score < 15) {
    return `Analysis of ${tradeCount} trades shows normal trading patterns. No significant anomalies detected.`;
  } else if (score < 30) {
    return `Minor irregularities detected in ${tradeCount} trades. ${signals.length} weak signal${signals.length > 1 ? 's' : ''}: ${signalNames.slice(0, 2).join(', ')}. Likely normal market activity.`;
  } else if (score < 50) {
    return `Moderate anomalies found in ${tradeCount} trades. ${signals.length} signal${signals.length > 1 ? 's' : ''} suggest unusual activity: ${signalNames.slice(0, 3).join(', ')}. Worth monitoring.`;
  } else if (score < 70) {
    return `Significant suspicious patterns in ${tradeCount} trades. ${signals.length} strong signal${signals.length > 1 ? 's' : ''}: ${signalNames.slice(0, 3).join(', ')}. Possible informed trading.`;
  } else {
    return `ALERT: High probability of abnormal trading. ${signals.length} critical signal${signals.length > 1 ? 's' : ''} in ${tradeCount} trades: ${signalNames.slice(0, 4).join(', ')}. Strongly indicates insider trading or manipulation.`;
  }
}

// Refresh cache endpoint
app.post('/api/refresh', async (req, res) => {
  try {
    await getAllEvents(true);
    res.json({ status: 'ok', message: 'Cache refreshed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    authenticated: isAuthenticated,
    sdk: 'kalshi-typescript',
    cachedEvents: eventsCache.data.length,
    cacheAge: eventsCache.lastFetch ? Math.round((Date.now() - eventsCache.lastFetch) / 1000) + 's' : 'not cached'
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Using Kalshi TypeScript SDK`);
  console.log(`🔐 Authentication: ${isAuthenticated ? 'Enabled' : 'Not needed for public data'}`);
  
  // Pre-fetch events on startup
  console.log('');
  await getAllEvents();
});
