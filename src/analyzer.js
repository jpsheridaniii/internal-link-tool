const { crawlPage } = require('./crawler');

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'is','it','this','that','was','are','be','by','as','from','have','has',
  'had','not','we','you','he','she','they','our','your','their','its',
  'will','can','do','if','so','up','out','about','which','when','there',
]);

function tokenize(text) {
  return text.toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !STOP_WORDS.has(w)) || [];
}

function buildTf(tokens) {
  const tf = {};
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
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

function suggestAnchorText(targetPage, sourcePage) {
  const targetTokens = new Set(tokenize(`${targetPage.title} ${targetPage.h1} ${targetPage.metaDesc}`));
  const sourceText = `${sourcePage.title} ${sourcePage.h1} ${sourcePage.text}`;
  const sourceTokens = tokenize(sourceText);

  // Find 2-4 word phrases in source that overlap with target topic
  const words = sourceText.toLowerCase().match(/[a-z]{3,}/g) || [];
  const phrases = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (targetTokens.has(words[i]) && !STOP_WORDS.has(words[i + 1])) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (!phrases.includes(phrase)) phrases.push(phrase);
    }
    if (phrases.length >= 3) break;
  }

  return phrases.length ? phrases[0] : tokenize(targetPage.title)[0] || 'related content';
}

async function analyzeOpportunities(targetUrl, candidateUrls) {
  // Crawl target page
  const target = await crawlPage(targetUrl);
  const normalizedTarget = targetUrl.split('#')[0].replace(/\/$/, '');
  const targetTf = buildTf(tokenize(`${target.title} ${target.h1} ${target.metaDesc} ${target.text}`));

  // Crawl candidates in batches of 5 to avoid hammering servers
  const pages = [];
  const batches = [];
  for (let i = 0; i < candidateUrls.length; i += 5) batches.push(candidateUrls.slice(i, i + 5));

  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map(url => crawlPage(url)));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') pages.push(r.value);
    });
  }

  const targetOutbound = new Set(target.outboundLinks.map(u => u.replace(/\/$/, '')));

  const scored = pages.map(page => {
    const normalizedPageUrl = page.url.replace(/\/$/, '');
    if (normalizedPageUrl === normalizedTarget) return null;

    const pageTf = buildTf(tokenize(`${page.title} ${page.h1} ${page.metaDesc} ${page.text}`));
    const relevance = cosineSimilarity(targetTf, pageTf);

    const pageOutbound = new Set(page.outboundLinks.map(u => u.replace(/\/$/, '')));
    const alreadyLinksToTarget = pageOutbound.has(normalizedTarget);
    const targetAlreadyLinksTo = targetOutbound.has(normalizedPageUrl);

    return { page, relevance, alreadyLinksToTarget, targetAlreadyLinksTo };
  }).filter(Boolean);

  scored.sort((a, b) => b.relevance - a.relevance);

  // link:from — pages that should link TO the target (don't already)
  const linkFrom = scored
    .filter(s => !s.alreadyLinksToTarget && s.relevance > 0.01)
    .slice(0, 6)
    .map(s => ({
      url: s.page.url,
      title: s.page.title || s.page.url,
      relevance: Math.round(s.relevance * 100),
      suggestedAnchor: suggestAnchorText(target, s.page),
    }));

  // link:to — pages the target should link TO (doesn't already)
  const linkTo = scored
    .filter(s => !s.targetAlreadyLinksTo && s.relevance > 0.01)
    .slice(0, 6)
    .map(s => ({
      url: s.page.url,
      title: s.page.title || s.page.url,
      relevance: Math.round(s.relevance * 100),
      suggestedAnchor: suggestAnchorText(s.page, target),
    }));

  return { target: { url: target.url, title: target.title, h1: target.h1 }, linkFrom, linkTo };
}

module.exports = { analyzeOpportunities };
