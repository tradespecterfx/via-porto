// netlify/functions/products-api.js
//
// Single endpoint for product data, backed by Netlify Blobs (a built-in
// key-value store, no separate database needed).
//
// GET    /.netlify/functions/products-api          -> public, returns all products
// POST   /.netlify/functions/products-api          -> admin, create a product
// PUT    /.netlify/functions/products-api?id=...   -> admin, update a product
// DELETE /.netlify/functions/products-api?id=...   -> admin, delete a product
//
// Admin write operations require an "x-admin-password" header matching the
// ADMIN_PASSWORD environment variable set in Netlify.

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'via-porto-data';
const KEY = 'products';

// Seed data — used only the first time the store is empty, so the existing
// three products keep working without manual re-entry.
const SEED_PRODUCTS = [
  {
    id: 'marina-shirt',
    slug: 'marina-shirt',
    name: 'The Marina Shirt',
    nameLower: 'linen shirt',
    price: 320,
    material: 'Italian Linen · Stone',
    description: 'A harbour folded into the hills, where stone houses lean toward still water. Cut from heavyweight Italian linen in a faded stone tone — built to soften with wear, not wash out.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    unavailableSizes: []
  },
  {
    id: 'dock-trouser',
    slug: 'dock-trouser',
    name: 'The Dock Trouser',
    nameLower: 'trouser',
    price: 380,
    material: 'Cotton Twill · Graphite',
    description: 'Tailored for the quiet of a marina before the day begins. A graphite cotton twill with enough structure to hold its line, enough give to move freely through it.',
    sizes: ['44', '46', '48', '50', '52'],
    unavailableSizes: ['52']
  },
  {
    id: 'teak-knit',
    slug: 'teak-knit',
    name: 'The Teak Knit',
    nameLower: 'knit',
    price: 410,
    material: 'Merino · Muted Silver',
    description: 'The colour of weathered teak under a low Mediterranean sun. Fine merino, knit dense enough for cool evenings on the water and light enough for the walk home.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    unavailableSizes: ['XS']
  }
];

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function isAuthorized(event) {
  const expected = process.env.ADMIN_PASSWORD || 'changeme123';
  const provided = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
  return provided && provided === expected;
}

exports.handler = async function (event) {
  const store = getStore(STORE_NAME);

  // ----- GET: public, anyone can list products -----
  if (event.httpMethod === 'GET') {
    let products = await store.get(KEY, { type: 'json' });
    if (!products) {
      products = SEED_PRODUCTS;
      await store.setJSON(KEY, products);
    }
    return jsonResponse(200, { products });
  }

  // Everything past this point modifies data — require the admin password.
  if (!isAuthorized(event)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  // ----- Lightweight auth check used by the admin login screen (no mutation) -----
  if (event.httpMethod === 'POST' && (event.queryStringParameters || {}).check === '1') {
    return jsonResponse(200, { ok: true });
  }

  let products = (await store.get(KEY, { type: 'json' })) || SEED_PRODUCTS;

  // ----- POST: create a product -----
  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }

    if (!payload.name || !payload.price) {
      return jsonResponse(400, { error: 'name and price are required' });
    }

    const slug = payload.slug ? slugify(payload.slug) : slugify(payload.name);
    if (products.some((p) => p.slug === slug)) {
      return jsonResponse(409, { error: 'A product with this slug already exists' });
    }

    const newProduct = {
      id: slug,
      slug: slug,
      name: payload.name,
      nameLower: payload.nameLower || payload.name.toLowerCase(),
      price: Number(payload.price),
      material: payload.material || '',
      description: payload.description || '',
      sizes: Array.isArray(payload.sizes) ? payload.sizes : [],
      unavailableSizes: Array.isArray(payload.unavailableSizes) ? payload.unavailableSizes : []
    };

    products.push(newProduct);
    await store.setJSON(KEY, products);
    return jsonResponse(201, { product: newProduct });
  }

  // ----- PUT: update a product -----
  if (event.httpMethod === 'PUT') {
    const id = (event.queryStringParameters || {}).id;
    if (!id) return jsonResponse(400, { error: 'Missing id query parameter' });

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return jsonResponse(404, { error: 'Product not found' });

    products[idx] = {
      ...products[idx],
      ...payload,
      id: products[idx].id, // id/slug stay stable
      slug: products[idx].slug,
      price: payload.price !== undefined ? Number(payload.price) : products[idx].price,
      sizes: Array.isArray(payload.sizes) ? payload.sizes : products[idx].sizes,
      unavailableSizes: Array.isArray(payload.unavailableSizes) ? payload.unavailableSizes : products[idx].unavailableSizes
    };

    await store.setJSON(KEY, products);
    return jsonResponse(200, { product: products[idx] });
  }

  // ----- DELETE: remove a product -----
  if (event.httpMethod === 'DELETE') {
    const id = (event.queryStringParameters || {}).id;
    if (!id) return jsonResponse(400, { error: 'Missing id query parameter' });

    const before = products.length;
    products = products.filter((p) => p.id !== id);
    if (products.length === before) return jsonResponse(404, { error: 'Product not found' });

    await store.setJSON(KEY, products);
    return jsonResponse(200, { deleted: id });
  }

  return jsonResponse(405, { error: 'Method Not Allowed' });
};
