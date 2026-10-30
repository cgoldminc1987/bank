const test = require('node:test');
const assert = require('node:assert');
const createApp = require('./app');

async function withServer(fn) {
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  try { await fn(call); } finally { server.close(); }
}

test('create, deposit, withdraw, transfer', async () => {
  await withServer(async (call) => {
    const a = await call('POST', '/accounts', { owner: 'Ann', initialDeposit: 100 });
    const b = await call('POST', '/accounts', { owner: 'Bob' });
    assert.strictEqual(a.status, 201);
    assert.strictEqual((await call('POST', '/accounts/1/deposit', { amount: 50 })).body.balance, 150);
    assert.strictEqual((await call('POST', '/accounts/1/withdraw', { amount: 30 })).body.balance, 120);
    assert.strictEqual((await call('POST', '/accounts/1/withdraw', { amount: 999 })).status, 400);
    const t = await call('POST', '/transfer', { from: 1, to: b.body.id, amount: 20 });
    assert.strictEqual(t.body.from.balance, 100);
    assert.strictEqual(t.body.to.balance, 20);
    assert.strictEqual((await call('GET', '/accounts/99')).status, 404);
    assert.strictEqual((await call('POST', '/accounts/1/deposit', { amount: -5 })).status, 400);
  });
});

test('issuing and banking use injected providers', async () => {
  const lithicClient = {
    accountHolders: { create: async () => ({ token: 'h1', account_token: 'a1', status: 'ACCEPTED' }) },
    cards: { create: async (p) => ({ token: 'c1', last_four: '4242', state: 'OPEN', ...p }) },
  };
  const calls = [];
  const columnRequest = async (m, p) => { calls.push(`${m} ${p}`); return { id: 'bacc_1' }; };
  const server = createApp({ lithicClient, columnRequest }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  try {
    assert.strictEqual((await post('/issuing/account-holders', { first_name: 'A' })).status, 400);
    const card = await (await post('/issuing/cards', { account_token: 'a1' })).json();
    assert.strictEqual(card.last_four, '4242');
    assert.strictEqual((await post('/issuing/cards', {})).status, 400);
    assert.strictEqual((await post('/banking/accounts', { entity_id: 'e1' })).status, 200);
    assert.deepStrictEqual(calls, ['POST /bank-accounts', 'POST /bank-accounts/bacc_1/account-numbers']);
  } finally { server.close(); }
});

test('payment providers use injected clients', async () => {
  const stripeClient = { paymentIntents: { create: async () => ({ id: 'pi_1', client_secret: 'sec', status: 'requires_payment_method' }) } };
  const paypalRequest = async (m, p) => (p.endsWith('/capture') ? { id: 'o1', status: 'COMPLETED' } : { id: 'o1', status: 'CREATED', links: [{ rel: 'approve', href: 'https://pp/approve' }] });
  const gocardlessRequest = async (m, p) => (p === '/payments' ? { payments: { id: 'PM1', status: 'pending_submission' } }
    : p === '/billing_requests' ? { billing_requests: { id: 'BRQ1' } } : { billing_request_flows: { authorisation_url: 'https://gc/auth' } });
  const server = createApp({ stripeClient, paypalRequest, gocardlessRequest }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
  try {
    assert.strictEqual((await post('/payments/stripe/intents', { amount: 500 })).body.client_secret, 'sec');
    assert.strictEqual((await post('/payments/stripe/intents', { amount: 5.5 })).status, 400);
    assert.strictEqual((await post('/payments/paypal/orders', { amount: 500 })).body.approve_url, 'https://pp/approve');
    assert.strictEqual((await post('/payments/paypal/orders/o1/capture', {})).body.status, 'COMPLETED');
    assert.strictEqual((await post('/payments/gocardless/mandates', { redirect_uri: 'bank://done' })).body.authorisation_url, 'https://gc/auth');
    assert.strictEqual((await post('/payments/gocardless/payments', { amount: 1000, mandate_id: 'MD1' })).body.id, 'PM1');
  } finally { server.close(); }
});
