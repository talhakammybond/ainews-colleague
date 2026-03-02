# 🛰️ AI Colleague — FutureProof AI Systems

Real-time news pulled from the web, rewritten under 160 characters by AI.
Export as PNG, JPG, PDF, Word, or TXT.

## Built With
- [NewsAPI](https://newsapi.org) — live headlines (free tier)
- [Groq](https://console.groq.com) — AI summarisation (free tier)
- Node.js + Express

## Setup (5 minutes)

**1. Clone**
```bash
git clone https://github.com/YOUR_USERNAME/futureproof-ai.git
cd futureproof-ai
```

**2. Install**
```bash
npm install
```

**3. Get your free API keys**
- NewsAPI → https://newsapi.org/register
- Groq    → https://console.groq.com

**4. Add keys**
```bash
cp .env.example .env
# Open .env and paste your keys
```

**5. Run**
```bash
npm run dev
# Open http://localhost:3000/ai-colleague.html
```

## Free Tier Limits
| Service | Limit |
|---------|-------|
| NewsAPI | 100 requests/day |
| Groq    | ~14,400 requests/day |

## License
MIT — free to use and modify.