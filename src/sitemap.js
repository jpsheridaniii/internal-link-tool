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

async function getUrlsFromSitemap(sitemapUrl) {
  const xml = await fetchXml(sitemapUrl);
  const parsed = parser.parse(xml);

  let urls = extractUrls(parsed);

  // If it's a sitemap index, fetch each child sitemap
  if (parsed?.sitemapindex) {
    const childUrls = await Promise.allSettled(
      urls.slice(0, 10).map(async u => {
        const childXml = await fetchXml(u);
        return extractUrls(parser.parse(childXml));
      })
    );
    urls = childUrls
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }

  return [...new Set(urls)];
}

module.exports = { getUrlsFromSitemap };
