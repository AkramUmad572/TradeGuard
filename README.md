# TradeGuard

TradeGuard is a system for detecting potentially suspicious trading behavior in prediction markets. It ingests real-time market data, applies multiple quantitative detection methods, and produces a normalized risk score with a short explanation for each flagged market or trade.

The project is designed to explore how quantitative signals, AI-assisted reasoning, and continuous feedback can be combined to improve surveillance in markets where labeled insider-trading data is limited. <br>
Live Link: https://trade-guard-ten.vercel.app/
## Tech Stack
Frontend --> React.js, Three.js, interactive market search and visualization interface for viewing risk scores and flagged behavior. <br>

Backend --> Node.js, Express, Kalshi API integration for real-time market data, trade history, and order books, plus a detection engine powered by 14 quantitative algorithms grounded in market microstructure research. <br>

AI --> We used Moorcheh to build a context-aware market data layer and integrated it with the Gemini API to reason over complex trading patterns and improve insider-risk detection accuracy. <br>

ML/DataBases --> MongoDB for storing market analyses, user interactions, and feedback, enabling a continuous learning pipeline that improves the system’s ability to distinguish normal volatility from potential insider trading over time. 


## System Architecture

![TradeGuard System Architecture Diagram](frontend/dist/assets/Diagram.png)

*Figure: TradeGuard system architecture showing data flow from frontend through backend detection algorithms to external services.*
