const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const UA = 'Mozilla/5.0 (compatible; InternalLinkBot/1.0)';
const parser = new XMLParser({ ignoreAttributes: false });

async function fetchXml(url) {
  const res = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 10000 });
  return res.data;
}

function extractUrls(parsed) {
  const urls = [];

  // Standard sitemap
  const urlset = parsed?.urlset?.url;
  if (urlset) {
    const entries = Array.isArray(urlset) ? urlset : [urlset];
    entries.forEach(e => e?.loc && urls.push(e.loc));
  }

  // Sitemap index — nested sitemaps (we only go one level deep)
  const sitemapIndex = parsed?.sitemapindex?.sitemap;
  if (sitemapIndex) {
    const entries = Array.isArray(sitemapIndex) ? sitemapIndex : [sitemapIndex];
    entries.forEach(e => e?.loc && urls.push(e.loc));
  }

  return urls;
}

async function getUrlsFromSitemap(sitemapUrl, depth = 0) {
  if (depth > 2) return [];

  const xml = await fetchXml(sitemapUrl);
  const parsed = parser.parse(xml);

  // Standard sitemap — return page URLs directly
  if (parsed?.urlset) {
    return extractUrls(parsed);
  }

  // Sitemap index — recursively fetch each child sitemap
  if (parsed?.sitemapindex) {
    const childSitemapUrls = extractUrls(parsed);
    const results = await Promise.allSettled(
      childSitemapUrls.slice(0, 15).map(u => getUrlsFromSitemap(u, depth + 1))
    );
    return [...new Set(
      results.filter(r => r.status === 'fulfilled').flatMap(r => r.value)
    )];
  }

  return [];
}


module.exports = { getUrlsFromSitemap };
