const axios = require('axios');

// Uses Serper.dev API to find pages on the target site relevant to a keyword.
// Requires SERPER_API_KEY in .env — get one at serper.dev
async function getSerpPages(keyword, siteOrigin, apiKey) {
  if (!apiKey) return [];

  const hostname = new URL(siteOrigin).hostname;
  const res = await axios.post(
    'https://google.serper.dev/search',
    { q: `site:${hostname} ${keyword}`, num: 10 },
    {
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      timeout: 8000,
    }
  );

  const organic = res.data.organic || [];
  return organic.map(item => item.link);
}

module.exports = { getSerpPages };
