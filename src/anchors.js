const Anthropic = require('@anthropic-ai/sdk');

// Heading-based anchor: find the H2/H3 on the source page most relevant to the target topic,
// then fall back to a shortened title.
function headingAnchor(targetPage, sourcePage) {
  const targetWords = new Set(
    `${targetPage.title} ${targetPage.h1} ${targetPage.metaDesc}`
      .toLowerCase().match(/[a-z]{3,}/g) || []
  );

  let best = null, bestScore = 0;
  for (const h of (sourcePage.headings || [])) {
    const words = h.toLowerCase().match(/[a-z]{3,}/g) || [];
    const score = words.filter(w => targetWords.has(w)).length;
    if (score > bestScore) { bestScore = score; best = h; }
  }

  if (best && bestScore >= 1) {
    return best.length <= 50 ? best.toLowerCase() : best.toLowerCase().split(' ').slice(0, 5).join(' ');
  }

  const source = targetPage.h1 || targetPage.title || '';
  const clean = source.split(/ [|\-–—] /)[0].trim().toLowerCase();
  const words = clean.match(/[a-z]{3,}/g) || [];
  return clean.length <= 50 ? clean : words.slice(0, 4).join(' ');
}

// Single Claude batch call: anchor text + topical relevance scores for all results.
async function claudeEnrich(target, linkFromPages, linkToPages, apiKey) {
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const pageSnapshot = (page) => {
    const headings = (page.headings || []).slice(0, 8).join(' | ');
    return `URL: ${page.url}\nTitle: ${page.title}\nH1: ${page.h1}\nHeadings: ${headings}`;
  };

  const fromItems = linkFromPages.map((p, i) => `[FROM-${i}]\n${pageSnapshot(p)}`).join('\n\n');
  const toItems   = linkToPages.map((p, i)   => `[TO-${i}]\n${pageSnapshot(p)}`).join('\n\n');

  const targetFocus = `${target.h1 || ''} ${target.title || ''}`.trim();

  const prompt = `You are an SEO specialist analysing internal linking opportunities.

TARGET PAGE (the page we want to build authority for):
${pageSnapshot(target)}
Focus topic: "${targetFocus}"

LINK:FROM PAGES (these pages should add a link TO the target):
${fromItems}

LINK:TO PAGES (the target should add links TO these pages):
${toItems}

For each page provide:
1. relevance (0-100): how topically relevant is this page to the target? Consider shared topics, subtopics, complementary content, and user journey fit. Be honest — 70+ means genuinely strong fit, 40-69 moderate, below 40 weak.
2. anchor: the single best anchor text phrase (2-5 words) to use when linking between that page and the target. Should be natural, specific, and reflect the topic of the PAGE BEING LINKED TO.

CRITICAL ANCHOR TEXT RULES:
- LINK:FROM anchors: reflect the target page's topic — this signals authority TO the target.
- LINK:TO anchors: do NOT reuse "${targetFocus}" keywords. Describe the destination page's specific angle instead.

Return ONLY valid JSON, no explanation:
{
  "from": [{"anchor": "...", "relevance": 0-100}, ...],
  "to":   [{"anchor": "...", "relevance": 0-100}, ...]
}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content[0].text.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(raw);
}

module.exports = { headingAnchor, claudeEnrich };
