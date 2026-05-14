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
  let site = '日本代購';
  if (targetUrl.hostname.includes('chiikawamarket')) site = '🐭 吉伊卡哇 Market';
  else if (targetUrl.hostname.includes('nagano-market')) site = '🎨 Nagano Market';
  let shopifyJsonUrl = /^\d+$/.test(handle)
    ? `${targetUrl.origin}/products.json?q=${handle}`
    : `${targetUrl.origin}/products/${handle}.json`;
  let p = null;
  try {
    const r = await fetch(shopifyJsonUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    if (r.ok) { const d = await r.json(); p = d.product || (d.products && d.products[0]); }
  } catch(_) {}
  if (!p) return res.status(404).json({ error: 'Product not found' });
  let realPrice = 0, variants = [];
  try {
    const pageRes = await fetch(`${targetUrl.origin}${targetUrl.pathname}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15', 'Accept': 'text/html', 'Accept-Language': 'zh-TW,zh;q=0.9' },
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const jsonLdBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
      for (const block of jsonLdBlocks) {
        try {
          const obj = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, ''));
          if (obj['@type'] === 'Product' && obj.offers) {
            const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
            variants = offers.filter(o => o.price && parseFloat(o.price) > 100).map(o => ({ title: o.name || o.sku || '', price: Math.round(parseFloat(o.price)), available: o.availability !== 'http://schema.org/OutOfStock' }));
            if (variants.length > 0) { realPrice = variants[0].price; break; }
          }
        } catch(_) {}
      }
      if (realPrice === 0) {
        const m1 = html.match(/["']price["']\s*:\s*["']?(\d{3,6})["']?/);
        if (m1 && parseInt(m1[1]) > 100) realPrice = parseInt(m1[1]);
      }
      if (realPrice === 0) {
        const m2 = html.match(/property="product:price:amount"\s+content="([\d.]+)"/);
        if (m2 && Math.round(parseFloat(m2[1])) > 100) realPrice = Math.round(parseFloat(m2[1]));
      }
      if (realPrice === 0) {
        const m3 = html.match(/data-price="(\d+)"/);
        if (m3) { let c = parseInt(m3[1]); if (c > 100000) c = Math.round(c/100); if (c > 100) realPrice = c; }
      }
    }
  } catch(_) {}
  if (variants.length === 0) {
    variants = (p.variants || []).map(v => ({ title: v.title === 'Default Title' ? '' : v.title, price: Math.round(parseFloat(v.price || 0)), available: v.available !== false })).filter(v => v.price > 0);
  }
  const finalPrice = realPrice > 100 ? realPrice : (variants[0]?.price || 0);
  if (realPrice > 100 && variants.length > 0 && variants[0].price < 100) variants = variants.map(v => ({ ...v, price: realPrice }));
  return res.status(200).json({ name: p.title || '', site, price_jpy: finalPrice, image: p.images?.[0]?.src || '', variants, parsed: true });
}

