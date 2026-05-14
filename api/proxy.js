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

  if (!allowed.some(d => targetUrl.hostname.includes(d)))
    return res.status(403).json({ error: 'Domain not allowed' });

  const match = targetUrl.pathname.match(/\/products\/([^\/\?#]+)/);
  if (!match) return res.status(400).json({ error: 'Not a product URL' });

  const handle = match[1].replace(/\.json$/, '');

  let site = '小怪獸日本代購';
  if (targetUrl.hostname.includes('chiikawamarket')) site = '🐭 吉伊卡哇 Market';
  else if (targetUrl.hostname.includes('nagano-market')) site = '🎨 Nagano Market';

  const shopifyJsonUrl = /^\d+$/.test(handle)
    ? `${targetUrl.origin}/products.json?q=${handle}`
    : `${targetUrl.origin}/products/${handle}.json`;

  try {
    const r = await fetch(shopifyJsonUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });
    if (!r.ok) return res.status(r.status).json({ error: `Shop returned ${r.status}` });

    const d = await r.json();
    const p = d.product || (d.products && d.products[0]);
    if (!p) return res.status(404).json({ error: 'Product not found' });

    const variants = (p.variants || [])
      .map(v => ({
        title: v.title === 'Default Title' ? '' : v.title,
        price: Math.round(parseFloat(v.price || 0)),
        available: v.available !== false,
      }))
      .filter(v => v.price > 0);

    // 價格低於 100 日圓視為佔位符，清空讓客人手動填
    const apiPrice = variants[0]?.price || 0;
    const priceIsPlaceholder = apiPrice < 100;
    const finalPrice = priceIsPlaceholder ? 0 : apiPrice;
    const cleanVariants = priceIsPlaceholder
      ? variants.map(v => ({ ...v, price: 0 }))
      : variants;

    return res.status(200).json({
      name: p.title || '',
      site,
      price_jpy: finalPrice,
      image: p.images?.[0]?.src || '',
      variants: cleanVariants,
      parsed: true,
      priceIsPlaceholder,
    });

  } catch(err) {
    return res.status(500).json({ error: 'Fetch failed: ' + err.message });
  }
}
