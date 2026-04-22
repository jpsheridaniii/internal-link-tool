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
    // Trim to 50 chars max, keep it clean
    return best.length <= 50 ? best.toLowerCase() : best.toLowerCase().split(' ').slice(0, 5).join(' ');
  }

  // Fall back to target page title (shortened)
  const source = targetPage.h1 || targetPage.title || '';
  const clean = source.split(/ [|\-–—] /)[0].trim().toLowerCase();
  const words = clean.match(/[a-z]{3,}/g) || [];
  return clean.length <= 50 ? clean : words.slice(0, 4).join(' ');
}

// Claude batch call: suggest anchor text for all link:from and link:to results at once.
async function claudeAnchors(target, linkFromPages, linkToPages, apiKey) {
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const pageSnapshot = (page) => {
    const headings = (page.headings || []).slice(0, 8).join(' | ');
    return `URL: ${page.url}\nTitle: ${page.title}\nH1: ${page.h1}\nHeadings: ${headings}`;
  };

  const targetSnapshot = pageSnapshot(target);

  const fromItems = linkFromPages.map((p, i) =>
    `[FROM-${i}]\n${pageSnapshot(p)}`
  ).join('\n\n');

  const toItems = linkToPages.map((p, i) =>
    `[TO-${i}]\n${pageSnapshot(p)}`
  ).join('\n\n');

  const prompt = `You are an SEO specialist suggesting internal link anchor text.

TARGET PAGE (the page we want to build authority for):
${targetSnapshot}

LINK:FROM PAGES (these pages should add a link TO the target):
${fromItems}

LINK:TO PAGES (the target should add links TO these pages):
${toItems}

For each page, suggest the single best anchor text phrase (2-5 words) to use when linking between that page and the target. The anchor should:
- Be a natural phrase a reader would click
- Reflect the topic of the PAGE BEING LINKED TO (not the linking page)
- Be specific, not generic ("internal linking guide" not "click here")
- Avoid keyword stuffing

Return ONLY valid JSON in this exact format, no explanation:
{
  "from": ["anchor for FROM-0", "anchor for FROM-1", ...],
  "to": ["anchor for TO-0", "anchor for TO-1", ...]
}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content[0].text.trim();
  // Strip markdown code fences if present
  const json = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(json);
}

module.exports = { headingAnchor, claudeAnchors };
