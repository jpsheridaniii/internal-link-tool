require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { crawlPage } = require('./src/crawler');
const { getUrlsFromSitemap } = require('./src/sitemap');
const { getSerpPages } = require('./src/serp');
const { analyzeOpportunities } = require('./src/analyzer');
const { isUtilityPage } = require('./src/filter');

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

    let serpUrls = [];

    // 1. SERP discovery first — Google already ranked these for topical relevance
    if (keyword && process.env.SERPER_API_KEY) {
      try {
        serpUrls = await getSerpPages(keyword, origin, process.env.SERPER_API_KEY);
        candidateUrls.push(...serpUrls);
      } catch (e) {
        console.warn('SERP fetch failed:', e.message);
      }
    }

    // 2. Sitemap discovery — fills the pool; slug pre-scoring picks the best ones
    if (sitemapUrl) {
      try {
        const sitemapUrls = await getUrlsFromSitemap(sitemapUrl);
        candidateUrls.push(...sitemapUrls);
      } catch (e) {
        console.warn('Sitemap fetch failed:', e.message);
      }
    }

    // 3. Fallback: crawl internal links from target page
    if (candidateUrls.length === 0) {
      const targetPage = await crawlPage(targetUrl);
      candidateUrls.push(...targetPage.outboundLinks);
    }

    // Dedupe, remove target itself, strip utility/nav pages
    // Pass a larger pool (75) to the analyzer — it pre-ranks by slug before crawling
    const normalized = targetUrl.split('#')[0].replace(/\/$/, '');
    const allInternal = [...new Set(
      candidateUrls
        .map(u => u.split('#')[0].replace(/\/$/, ''))
        .filter(u => u.startsWith(origin) && u !== normalized)
    )];
    const filtered = allInternal.filter(u => !isUtilityPage(u));
    console.log(`[filter] ${allInternal.length} internal → ${filtered.length} after utility strip`);
    allInternal.filter(u => isUtilityPage(u)).forEach(u => console.log(`  [blocked] ${u}`));
    candidateUrls = filtered.slice(0, 75);

    if (candidateUrls.length === 0) {
      return res.status(422).json({ error: 'No candidate pages found. Try adding a sitemap or keyword.' });
    }

    const results = await analyzeOpportunities(targetUrl, candidateUrls, process.env.ANTHROPIC_API_KEY, keyword, process.env.SERPER_API_KEY);
    res.json(results);
  } catch (err) {
    console.error('[analyze]', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Internal Link Tool running at http://localhost:${PORT}`));
