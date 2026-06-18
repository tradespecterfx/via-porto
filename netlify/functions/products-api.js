// netlify/functions/products-api.js
//
// Single endpoint for product data, backed by Netlify Blobs.
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

// Seed data — used only the first time the store is empty.
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
    unavailableSizes: [],
    image: ''
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
    unavailableSizes: ['52'],
    image: ''
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
    unavailableSizes: [],
    image: ''
  }
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function getStoreInstance() {
  // Pass siteID and token explicitly so Blobs works in all Netlify environments.
  return getStore({
    name: STORE_NAME,
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_ACCESS_TOKEN
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Auth check for write operations
  const isWrite = ['POST', 'PUT', 'DELETE'].includes(event.httpMethod);
  if (isWrite) {
    const pwd = (event.headers || {})['x-admin-password'];
    const expected = process.env.ADMIN_PASSWORD || 'changeme123';
    if (pwd !== expected) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const store = getStoreInstance();

    // GET — return all products
    if (event.httpMethod === 'GET') {
      let products = await store.get(KEY, { type: 'json' });
      if (!products) {
        products = SEED_PRODUCTS;
        await store.setJSON(KEY, products);
      }
      return { statusCode: 200, headers, body: JSON.stringify(products) };
    }

    // POST — create new product
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      let products = await store.get(KEY, { type: 'json' }) || SEED_PRODUCTS;

      const slug = slugify(data.name || 'product');
      const id = slug + '-' + Date.now();
      const sizes = (data.sizes || '').split(',').map(s => s.trim()).filter(Boolean);
      const unavailableSizes = (data.soldOutSizes || '').split(',').map(s => s.trim()).filter(Boolean);

      const product = {
        id,
        slug,
        name: data.name || '',
        nameLower: (data.name || '').toLowerCase(),
        price: parseFloat(data.price) || 0,
        material: data.material || '',
        description: data.description || '',
        sizes,
        unavailableSizes,
        image: data.image || ''
      };

      products.push(product);
      await store.setJSON(KEY, products);
      return { statusCode: 201, headers, body: JSON.stringify(product) };
    }

    // PUT — update existing product
    if (event.httpMethod === 'PUT') {
      const id = (event.queryStringParameters || {}).id;
      const data = JSON.parse(event.body || '{}');
      let products = await store.get(KEY, { type: 'json' }) || SEED_PRODUCTS;

      const idx = products.findIndex(p => p.id === id);
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }

      const sizes = (data.sizes || '').split(',').map(s => s.trim()).filter(Boolean);
      const unavailableSizes = (data.soldOutSizes || '').split(',').map(s => s.trim()).filter(Boolean);

      products[idx] = {
        ...products[idx],
        name: data.name || products[idx].name,
        nameLower: (data.name || products[idx].name).toLowerCase(),
        price: parseFloat(data.price) || products[idx].price,
        material: data.material || products[idx].material,
        description: data.description || products[idx].description,
        sizes,
        unavailableSizes,
        image: data.image !== undefined ? data.image : (products[idx].image || '')
      };

      await store.setJSON(KEY, products);
      return { statusCode: 200, headers, body: JSON.stringify(products[idx]) };
    }

    // DELETE — remove product
    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      let products = await store.get(KEY, { type: 'json' }) || SEED_PRODUCTS;

      const filtered = products.filter(p => p.id !== id);
      if (filtered.length === products.length) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      }

      await store.setJSON(KEY, filtered);
      return { statusCode: 200, headers, body: JSON.stringify({ deleted: id }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('products-api error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
