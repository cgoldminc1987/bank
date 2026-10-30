const express = require('express');
const Stripe = require('stripe');

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(e.status || e.statusCode || 500).json({ error: e.message });
  }
};
const disabled = (router, name, envVar) =>
  router.use((req, res) => res.status(503).json({ error: `${name} disabled: set ${envVar}` }));

async function http(url, { method = 'GET', headers = {}, body } = {}) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw bad(data.message || data.error?.message || data.error_description || `Provider error ${r.status}`, r.status);
  return data;
}

const validAmount = (n) => Number.isInteger(n) && n > 0; // minor units (cents/pence)
const validCurrency = (c) => typeof c === 'string' && /^[a-zA-Z]{3}$/.test(c);

function stripeRouter(client) {
  const router = express.Router();
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) return disabled(router, 'Stripe', 'STRIPE_SECRET_KEY');
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  // Returns a client secret for the mobile app's Stripe PaymentSheet.
  router.post('/intents', wrap(async (req) => {
    const { amount, currency = 'usd' } = req.body || {};
    if (!validAmount(amount) || !validCurrency(currency)) throw bad('amount (integer minor units) and 3-letter currency required');
    const pi = await client.paymentIntents.create({ amount, currency: currency.toLowerCase(), automatic_payment_methods: { enabled: true } });
    return { id: pi.id, client_secret: pi.client_secret, status: pi.status };
  }));
  return router;
}

function paypalRouter(request) {
  const router = express.Router();
  if (!request) {
    const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
    if (!id || !secret) return disabled(router, 'PayPal', 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET');
    const base = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    request = async (method, path, body) => {
      const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      const token = (await tokenRes.json()).access_token;
      if (!token) throw bad('PayPal authentication failed', 502);
      return http(base + path, { method, headers: { Authorization: `Bearer ${token}` }, body });
    };
  }
  router.post('/orders', wrap(async (req) => {
    const { amount, currency = 'USD' } = req.body || {};
    if (!validAmount(amount) || !validCurrency(currency)) throw bad('amount (integer minor units) and 3-letter currency required');
    const order = await request('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: currency.toUpperCase(), value: (amount / 100).toFixed(2) } }],
    });
    return { id: order.id, status: order.status, approve_url: order.links?.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href };
  }));
  router.post('/orders/:id/capture', wrap(async (req) => {
    const o = await request('POST', `/v2/checkout/orders/${encodeURIComponent(req.params.id)}/capture`, {});
    return { id: o.id, status: o.status };
  }));
  return router;
}

function gocardlessRouter(request) {
  const router = express.Router();
  if (!request) {
    const token = process.env.GOCARDLESS_ACCESS_TOKEN;
    if (!token) return disabled(router, 'GoCardless', 'GOCARDLESS_ACCESS_TOKEN');
    const base = process.env.GOCARDLESS_ENV === 'live' ? 'https://api.gocardless.com' : 'https://api-sandbox.gocardless.com';
    request = (method, path, body) =>
      http(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'GoCardless-Version': '2015-07-06' }, body });
  }
  // Starts a Direct Debit mandate setup; the app opens authorisation_url in a browser.
  router.post('/mandates', wrap(async (req) => {
    const { redirect_uri, scheme = 'bacs' } = req.body || {};
    if (!redirect_uri) throw bad('redirect_uri is required');
    const br = (await request('POST', '/billing_requests', { billing_requests: { mandate_request: { scheme } } })).billing_requests;
    const flow = (await request('POST', '/billing_request_flows', {
      billing_request_flows: { redirect_uri, links: { billing_request: br.id } },
    })).billing_request_flows;
    return { billing_request_id: br.id, authorisation_url: flow.authorisation_url };
  }));
  router.post('/payments', wrap(async (req) => {
    const { amount, currency = 'GBP', mandate_id } = req.body || {};
    if (!validAmount(amount) || !validCurrency(currency) || !mandate_id) throw bad('amount, currency and mandate_id required');
    const p = (await request('POST', '/payments', {
      payments: { amount, currency: currency.toUpperCase(), links: { mandate: mandate_id } },
    })).payments;
    return { id: p.id, status: p.status };
  }));
  return router;
}

module.exports = { stripeRouter, paypalRouter, gocardlessRouter };
