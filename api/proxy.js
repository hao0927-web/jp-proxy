export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const allowed = ['chiikawamarket.jp', 'nagano-market.jp'];

  let targetUrl;
  try { targetUrl = new URL(url); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }

  if (!allowed.some(d => targetUrl.hostname.includes(d))) {
    return res.status(403).json({ error: 'Domain not allowed' });
  }

  // 支援 /products/handle 或 /collections/xxx/products/handle 兩種格式
  const match = targetUrl.pathname.match(/\/products\/([^\/\?#]+)/);
  if (!match) return res.status(400).json({ error: 'Not a product URL' });

  const handle = match[1].replace(/\.json$/, '');

  // 如果 handle 是純數字（條碼），用不同方式查詢
  let shopifyJsonUrl;
  if (/^\d+$/.test(handle)) {
    // 用 search API 查詢
    shopifyJsonUrl = `${targetUrl.origin}/products.json?q=${handle}`;
  } else {
    shopifyJsonUrl = `${targetUrl.origin}/products/${handle}.json`;
  }

  try {
    const response = await fetch(shopifyJsonUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });

    if (!response.ok) return res.status(response.status).json({ error: `Shop returned ${response.status}` });

    const data = await response.json();

    // products.json 回傳陣列，product.json 回傳單一
    let p = data.product || (data.products && data.products[0]);
    if (!p) return res.status(404).json({ error: 'Product not found' });

    let site = '日本代購';
    if (targetUrl.hostname.includes('chiikawamarket')) site = '🐭 吉伊卡哇 Market';
    else if (targetUrl.hostname.includes('nagano-market')) site = '🎨 Nagano Market';

    const variants = (p.variants || [])
      .map(v => ({
        title: v.title === 'Default Title' ? '' : v.title,
        price: Math.round(parseFloat(v.price || 0)),
        available: v.available !== false,
      }))
      .filter(v => v.price > 0);

    return res.status(200).json({
      name: p.title || '',
      site,
      price_jpy: variants[0]?.price || 0,
      image: p.images?.[0]?.src || '',
      variants,
      parsed: true,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed: ' + err.message });
  }
}
