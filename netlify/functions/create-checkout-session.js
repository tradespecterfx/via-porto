// netlify/functions/create-checkout-session.js
//
// This function runs server-side on Netlify. It reads the cart sent from
// the browser, rebuilds the line items using the trusted product list
// stored in Netlify Blobs (never trusting prices sent from the client),
// and creates a Stripe Checkout Session. The Stripe secret key lives only
// in Netlify's environment variables — it is never exposed to the browser.
//
// NOTE: Stripe is not available for businesses registered in Ukraine.
// This function is kept for when a supported payment processor (Stripe,
// or a Ukrainian provider like WayForPay) is connected.

const Stripe = require('stripe');
const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Stripe is not configured on the server yet.' })
    };
  }

  const stripe = Stripe(stripeSecretKey);

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty' }) };
  }

  const store = getStore('via-porto-data');
  const products = (await store.get('products', { type: 'json' })) || [];
  const catalogById = {};
  products.forEach((p) => { catalogById[p.id] = p; });

  const line_items = [];
  for (const item of items) {
    const catalogEntry = catalogById[item.id];
    if (!catalogEntry) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown product: ' + item.id }) };
    }
    const qty = Math.max(1, parseInt(item.qty, 10) || 1);
    line_items.push({
      price_data: {
        currency: 'eur',
        product_data: {
          name: catalogEntry.name + ' — Size ' + item.size,
        },
        unit_amount: Math.round(catalogEntry.price * 100)
      },
      quantity: qty
    });
  }

  const siteUrl = process.env.URL || ('https://' + event.headers.host);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: line_items,
      shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'UA', 'PL'] },
      success_url: siteUrl + '/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: siteUrl + '/cart.html'
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('Stripe error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create checkout session' })
    };
  }
};
