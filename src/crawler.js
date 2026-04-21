const axios = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (compatible; InternalLinkBot/1.0)';

async function fetchPage(url) {
  const res = await axios.get(url, {
    headers: { 'User-Agent': UA },
    timeout: 10000,
    maxRedirects: 5,
    validateStatus: status => status < 400,
  });
  return res.data;
}

function parsePage(html, baseUrl) {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;

  // Extract readable text from main content areas
  $('script, style, nav, footer, header, noscript').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000);

  const title = $('title').text().trim();
  const h1 = $('h1').first().text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';

  // Collect internal outbound links from this page
  const outboundLinks = new Set();
  $('a[href]').each((_, el) => {
    try {
      const href = new URL($(el).attr('href'), baseUrl).href;
      if (href.startsWith(origin) && href !== baseUrl) {
        outboundLinks.add(href.split('#')[0].replace(/\/$/, ''));
      }
    } catch {}
  });

  return { url: baseUrl, title, h1, metaDesc, text, outboundLinks: [...outboundLinks] };
}

async function crawlPage(url) {
  const html = await fetchPage(url);
  return parsePage(html, url);
}

module.exports = { crawlPage };
