const { crawlPage } = require('./crawler');
const { getSerpPages } = require('./serp');
const { headingAnchor, claudeEnrich } = require('./anchors');
const { isUtilityPage } = require('./filter');

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'is','it','this','that','was','are','be','by','as','from','have','has',
  'had','not','we','you','he','she','they','our','your','their','its',
  'will','can','do','if','so','up','out','about','which','when','there',
]);

function tokenize(text) {
  return text.toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !STOP_WORDS.has(w)) || [];
}

function buildWeightedTf(page) {
  const tf = {};
  const add = (text, weight) => {
    tokenize(text).forEach(t => { tf[t] = (tf[t] || 0) + weight; });
  };
  add(page.title, 5);
  add(page.h1, 5);
  add(page.metaDesc, 3);
  (page.headings || []).forEach(h => add(h, 3));
  add(page.text, 1);
  return tf;
}

function cosineSimilarity(tfA, tfB) {
  const allKeys = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
  let dot = 0, magA = 0, magB = 0;
  allKeys.forEach(k => {
    const a = tfA[k] || 0, b = tfB[k] || 0;
    dot += a * b; magA += a * a; magB += b * b;
  });
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function normalizeScores(scored) {
  const max = scored[0]?.relevance || 1;
  return scored.map(s => ({ ...s, relevance: s.relevance / max }));
}

// Paths that indicate substantive linkable content — small pre-rank bonus
const CONTENT_PATHS = [
  '/resource', '/blog', '/article', '/guide', '/learn', '/insight',
  '/solution', '/product', '/feature', '/platform', '/tool', '/calculator',
  '/template', '/checklist', '/ebook', '/webinar', '/case-study', '/glossary',
  '/hcm', '/software', '/service',
];

function slugScore(url, tokens) {
  const path = new URL(url).pathname.toLowerCase();
  const slug = path.replace(/[-_/]/g, ' ');
  const tokenScore = tokens.filter(t => slug.includes(t)).length;
  const contentBonus = CONTENT_PATHS.some(p => path.startsWith(p)) ? 1 : 0;
  return tokenScore + contentBonus;
}

// Returns the heading on sourcePage most topically relevant to targetPage's subject.
// Used to tell the user WHERE on the page to place the link.
function findBestSection(sourcePage, targetPage) {
  const targetTokens = new Set(
    tokenize(`${targetPage.title} ${targetPage.h1} ${targetPage.metaDesc}`)
  );
  let best = null, bestScore = 0;
  for (const h of (sourcePage.headings || [])) {
    const score = tokenize(h).filter(w => targetTokens.has(w)).length;
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best || null;
}

async function analyzeOpportunities(targetUrl, candidateUrls, anthropicApiKey, keyword, serpApiKey) {
  const target = await crawlPage(targetUrl);
  const origin = new URL(targetUrl).origin;
  const normalizedTarget = targetUrl.split('#')[0].replace(/\/$/, '');
  const targetTf = buildWeightedTf(target);

  // Expand candidate pool: run extra SERP queries using target's H2/H3 topics.
  // This surfaces topically adjacent pages that slug scoring alone would miss.
  if (serpApiKey && target.headings?.length) {
    const topicQueries = [...new Set(
      target.headings
        .map(h => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim())
        .filter(q => q.split(' ').filter(w => w.length > 2).length >= 2)
    )].slice(0, 3);

    const extraResults = await Promise.all(
      topicQueries.map(q => getSerpPages(q, origin, serpApiKey).catch(() => []))
    );
    const existing = new Set(candidateUrls);
    extraResults.flat()
      .map(u => u.split('#')[0].replace(/\/$/, ''))
      .filter(u => u.startsWith(origin) && u !== normalizedTarget && !existing.has(u) && !isUtilityPage(u))
      .forEach(u => { existing.add(u); candidateUrls.push(u); });

    console.log(`[serp-expand] pool grew to ${candidateUrls.length} candidates`);
  }

  // Pre-rank by slug match before crawling — uses title, H1, meta, headings, keyword
  const tokenSrc = [
    target.title, target.h1, target.metaDesc,
    keyword || '',
    ...(target.headings || []),
  ].join(' ');
  const targetTokens = tokenize(tokenSrc);
  const ranked = candidateUrls
    .map(url => ({ url, score: slugScore(url, targetTokens) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.url);
  console.log(`[pre-rank] top candidates: ${ranked.slice(0, 5).join(', ')}`);
  const toCrawl = ranked.slice(0, 25);

  const pages = [];
  for (let i = 0; i < toCrawl.length; i += 5) {
    const batch = toCrawl.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(url => crawlPage(url)));
    results.forEach(r => { if (r.status === 'fulfilled') pages.push(r.value); });
  }

  const targetOutbound = new Set(target.outboundLinks.map(u => u.replace(/\/$/, '')));

  const rawScored = pages.map(page => {
    const normalizedPageUrl = page.url.replace(/\/$/, '');
    if (normalizedPageUrl === normalizedTarget) return null;
    const pageTf = buildWeightedTf(page);
    const relevance = cosineSimilarity(targetTf, pageTf);
    const pageOutbound = new Set(page.outboundLinks.map(u => u.replace(/\/$/, '')));
    return {
      page,
      relevance,
      alreadyLinksToTarget: pageOutbound.has(normalizedTarget),
      targetAlreadyLinksTo: targetOutbound.has(normalizedPageUrl),
    };
  }).filter(Boolean).sort((a, b) => b.relevance - a.relevance);

  const scored = normalizeScores(rawScored);

  const alreadyLinkedFrom = scored.filter(s => s.alreadyLinksToTarget).length;
  const alreadyLinkedTo   = scored.filter(s => s.targetAlreadyLinksTo).length;

  const topLinkFrom = scored.filter(s => !s.alreadyLinksToTarget && s.relevance > 0.01).slice(0, 6);
  const topLinkTo   = scored.filter(s => !s.targetAlreadyLinksTo && s.relevance > 0.01).slice(0, 6);

  // Placement hints: best heading on source page to place the link
  const fromSections = topLinkFrom.map(s => findBestSection(s.page, target));
  const toSections   = topLinkTo.map(s => findBestSection(target, s.page));

  const fromAnchors    = topLinkFrom.map(s => headingAnchor(target, s.page));
  const toAnchors      = topLinkTo.map(s => headingAnchor(s.page, target));
  const fromRelevances = topLinkFrom.map(s => Math.round(s.relevance * 100));
  const toRelevances   = topLinkTo.map(s => Math.round(s.relevance * 100));

  if (anthropicApiKey) {
    try {
      const enriched = await claudeEnrich(
        target,
        topLinkFrom.map(s => s.page),
        topLinkTo.map(s => s.page),
        anthropicApiKey
      );
      enriched?.from?.forEach((r, i) => {
        if (r?.anchor)    fromAnchors[i]    = r.anchor;
        if (r?.relevance) fromRelevances[i] = r.relevance;
      });
      enriched?.to?.forEach((r, i) => {
        if (r?.anchor)    toAnchors[i]    = r.anchor;
        if (r?.relevance) toRelevances[i] = r.relevance;
      });
    } catch (e) {
      console.warn('[claude enrich] fell back to TF-IDF + headings:', e.message);
    }
  }

  const linkFrom = topLinkFrom.map((s, i) => ({
    url: s.page.url,
    title: s.page.title || s.page.url,
    relevance: fromRelevances[i],
    suggestedAnchor: fromAnchors[i],
    suggestedSection: fromSections[i] || null,
  }));

  const linkTo = topLinkTo.map((s, i) => ({
    url: s.page.url,
    title: s.page.title || s.page.url,
    relevance: toRelevances[i],
    suggestedAnchor: toAnchors[i],
    suggestedSection: toSections[i] || null,
  }));

  return {
    target: { url: target.url, title: target.title, h1: target.h1 },
    stats: {
      outboundLinks: target.outboundLinks.length,
      candidatesChecked: pages.length,
      alreadyLinkedFrom,
      alreadyLinkedTo,
    },
    linkFrom,
    linkTo,
  };
}

module.exports = { analyzeOpportunities };
