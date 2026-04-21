require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { crawlPage } = require('./src/crawler');
const { getUrlsFromSitemap } = require('./src/sitemap');
const { getSerpPages } = require('./src/serp');
const { analyzeOpportunities } = require('./src/analyzer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/analyze', async (req, res) => {
  const { targetUrl, sitemapUrl, keyword } = req.body;

  if (!targetUrl) return res.status(400).json({ error: 'targetUrl is required' });

  try {
    const origin = new URL(targetUrl).origin;
    let candidateUrls = [];

    // 1. Sitemap discovery
    if (sitemapUrl) {
      try {
        const sitemapUrls = await getUrlsFromSitemap(sitemapUrl);
        candidateUrls.push(...sitemapUrls);
      } catch (e) {
        console.warn('Sitemap fetch failed:', e.message);
      }
    }

    // 2. SERP discovery via Serper
    if (keyword && process.env.SERPER_API_KEY) {
      try {
        const serpUrls = await getSerpPages(keyword, origin, process.env.SERPER_API_KEY);
        candidateUrls.push(...serpUrls);
      } catch (e) {
        console.warn('SERP fetch failed:', e.message);
      }
    }

    // 3. Fallback: crawl internal links from target page
    if (candidateUrls.length === 0) {
      const targetPage = await crawlPage(targetUrl);
      candidateUrls.push(...targetPage.outboundLinks);
    }

    // Dedupe, remove target itself, limit to 40 pages to keep analysis fast
    const normalized = targetUrl.split('#')[0].replace(/\/$/, '');
    candidateUrls = [...new Set(
      candidateUrls
        .map(u => u.split('#')[0].replace(/\/$/, ''))
        .filter(u => u.startsWith(origin) && u !== normalized)
    )].slice(0, 40);

    if (candidateUrls.length === 0) {
      return res.status(422).json({ error: 'No candidate pages found. Try adding a sitemap or keyword.' });
    }

    const results = await analyzeOpportunities(targetUrl, candidateUrls);
    res.json(results);
  } catch (err) {
    console.error('[analyze]', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Internal Link Tool running at http://localhost:${PORT}`));
