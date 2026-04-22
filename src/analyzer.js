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

function buildAnchor(page) {
  const source = page.h1 || page.title || '';
  const clean = source.split(/ [|\-–—] /)[0].trim();
  const words = tokenize(clean);
  if (clean.length <= 50) return clean.toLowerCase();
  return words.slice(0, 4).join(' ') || clean.toLowerCase();
}

async function analyzeOpportunities(targetUrl, candidateUrls) {
  const target = await crawlPage(targetUrl);
  const normalizedTarget = targetUrl.split('#')[0].replace(/\/$/, '');
  const targetTf = buildTf(tokenize(`${target.title} ${target.h1} ${target.metaDesc} ${target.text}`));

  const pages = [];
  for (let i = 0; i < candidateUrls.length; i += 5) {
    const batch = candidateUrls.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map(url => crawlPage(url)));
    results.forEach(r => { if (r.status === 'fulfilled') pages.push(r.value); });
  }

  const targetOutbound = new Set(target.outboundLinks.map(u => u.replace(/\/$/, '')));

  const scored = pages.map(page => {
    const normalizedPageUrl = page.url.replace(/\/$/, '');
    if (normalizedPageUrl === normalizedTarget) return null;
    const pageTf = buildTf(tokenize(`${page.title} ${page.h1} ${page.metaDesc} ${page.text}`));
    const relevance = cosineSimilarity(targetTf, pageTf);
    const pageOutbound = new Set(page.outboundLinks.map(u => u.replace(/\/$/, '')));
    return {
      page,
      relevance,
      alreadyLinksToTarget: pageOutbound.has(normalizedTarget),
      targetAlreadyLinksTo: targetOutbound.has(normalizedPageUrl),
    };
  }).filter(Boolean).sort((a, b) => b.relevance - a.relevance);

  const linkFrom = scored
    .filter(s => !s.alreadyLinksToTarget && s.relevance > 0.01)
    .slice(0, 6)
    .map(s => ({
      url: s.page.url,
      title: s.page.title || s.page.url,
      relevance: Math.round(s.relevance * 100),
      suggestedAnchor: buildAnchor(target),
    }));

  const linkTo = scored
    .filter(s => !s.targetAlreadyLinksTo && s.relevance > 0.01)
    .slice(0, 6)
    .map(s => ({
      url: s.page.url,
      title: s.page.title || s.page.url,
      relevance: Math.round(s.relevance * 100),
      suggestedAnchor: buildAnchor(s.page),
    }));

  return { target: { url: target.url, title: target.title, h1: target.h1 }, linkFrom, linkTo };
}

module.exports = { analyzeOpportunities };
