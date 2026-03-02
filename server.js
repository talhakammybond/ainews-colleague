// ═══════════════════════════════════════════════════════════════
//  FutureProof AI — AI Colleague Backend
//  NewsAPI  →  pulls live headlines
//  Groq     →  rewrites to ≤160 chars (free, ultra-fast)
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import express  from 'express';
import cors     from 'cors';
import fetch    from 'node-fetch';
import path     from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();

// ── Keys ───────────────────────────────────────────────────────
const NEWS_KEY = process.env.NEWS_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const PORT     = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── Health Check ───────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status  : 'ok',
    newsapi : NEWS_KEY ? '✅ connected' : '❌ missing NEWS_API_KEY',
    groq    : GROQ_KEY ? '✅ connected' : '❌ missing GROQ_API_KEY'
  });
});

// ── Category Guesser (fallback if Groq omits it) ───────────────
function guessCategory(text = '') {
  const t = text.toLowerCase();
  if (/\bai\b|machine learn|openai|llm|chatgpt|gemini|claude/.test(t)) return 'AI';
  if (/crypto|bitcoin|blockchain|web3|ethereum/.test(t))                return 'Crypto';
  if (/fund|invest|startup|unicorn|valuation|ipo/.test(t))             return 'Funding';
  if (/hack|cyber|breach|malware|ransomware|vuln/.test(t))             return 'Security';
  if (/climat|carbon|sustainab|solar|renewabl/.test(t))                return 'Climate';
  if (/war|conflict|election|govern|policy|sanction/.test(t))          return 'Politics';
  if (/health|cancer|drug|vaccine|fda|medical/.test(t))                return 'Health';
  return 'Tech';
}

// ── Main News Endpoint ─────────────────────────────────────────
app.post('/api/news', async (req, res) => {
  const topic = (req.body.topic || '').trim();

  if (topic.length < 2)
    return res.status(400).json({ error: 'Topic must be at least 2 characters.' });

  if (!NEWS_KEY)
    return res.status(500).json({ error: 'NEWS_API_KEY not configured on server.' });

  if (!GROQ_KEY)
    return res.status(500).json({ error: 'GROQ_API_KEY not configured on server.' });

  try {
    // ── 1. Fetch from NewsAPI ────────────────────────────────
    const newsUrl = new URL('https://newsapi.org/v2/everything');
    newsUrl.searchParams.set('q',        topic);
    newsUrl.searchParams.set('sortBy',   'publishedAt');
    newsUrl.searchParams.set('pageSize', '10');
    newsUrl.searchParams.set('language', 'en');
    newsUrl.searchParams.set('apiKey',   NEWS_KEY);

    const newsRes  = await fetch(newsUrl.toString());
    const newsData = await newsRes.json();

    if (newsData.status !== 'ok')
      throw new Error(`NewsAPI: ${newsData.message || newsData.code || 'unknown error'}`);

    // Clean & limit to 6
    const raw = (newsData.articles || [])
      .filter(a => a.title && a.title !== '[Removed]' && a.url && a.source?.name)
      .slice(0, 6);

    if (raw.length === 0)
      return res.json({ articles: [], topic, timestamp: new Date().toISOString() });

    // ── 2. Send batch to Groq ────────────────────────────────
    const articleList = raw.map((a, i) =>
      `${i + 1}. TITLE: ${a.title}\n   SOURCE: ${a.source.name}\n   URL: ${a.url}`
    ).join('\n\n');

    const prompt = `You are a sharp news editor. Rewrite each headline below into punchy, factual present-tense active voice — MAX 155 characters each.

Return ONLY a valid JSON array. Each item must have exactly these fields:
- "headline" : rewritten headline string, max 155 chars
- "source"   : source name exactly as given
- "url"      : URL exactly as given  
- "category" : ONE short tag — pick from: AI, Tech, Business, Security, Crypto, Climate, Health, Politics, Science, Funding

Return ONLY the raw JSON array — no markdown fences, no explanation.

ARTICLES TO REWRITE:
${articleList}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Authorization' : `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model : 'llama-3.1-8b-instant',
        max_tokens  : 1400,
        temperature : 0.25,
        messages    : [
          {
            role    : 'system',
            content : 'You are a precise JSON-only news headline rewriter. Never output anything except a valid JSON array.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    const groqData = await groqRes.json();

    if (!groqRes.ok)
      throw new Error(`Groq: ${groqData.error?.message || groqRes.status}`);

    const rawText = groqData.choices?.[0]?.message?.content?.trim() || '';

    // ── 3. Parse & sanitise ──────────────────────────────────
    let articles;
    try {
      const start = rawText.indexOf('[');
      const end   = rawText.lastIndexOf(']');
      if (start === -1 || end === -1) throw new Error('No JSON array found');
      articles = JSON.parse(rawText.slice(start, end + 1));
    } catch (_) {
      // Graceful fallback: use raw NewsAPI titles
      console.warn('⚠️  Groq parse failed — using raw titles as fallback');
      articles = raw.map(a => ({
        headline : a.title.slice(0, 155),
        source   : a.source.name,
        url      : a.url,
        category : guessCategory(a.title)
      }));
    }

    // Enforce limits + fill missing fields
    articles = articles.map((a, i) => ({
      headline : (a.headline || raw[i]?.title || '').slice(0, 160),
      source   : a.source   || raw[i]?.source?.name || 'Unknown',
      url      : a.url      || raw[i]?.url || '#',
      category : a.category || guessCategory(a.headline || '')
    }));

    return res.json({
      articles,
      topic,
      total     : articles.length,
      timestamp : new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ /api/news error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n┌─────────────────────────────────────────────┐');
  console.log('│  🌱  FutureProof AI Colleague — Server       │');
  console.log('└─────────────────────────────────────────────┘');
  console.log(`\n  App      → http://localhost:${PORT}`);
  console.log(`  Tool     → http://localhost:${PORT}/ai-colleague.html`);
  console.log(`  Health   → http://localhost:${PORT}/api/health`);
  console.log(`\n  NewsAPI  ${NEWS_KEY ? '✅' : '❌  Set NEWS_API_KEY in .env'}`);
  console.log(`  Groq     ${GROQ_KEY ? '✅' : '❌  Set GROQ_API_KEY in .env'}\n`);
});