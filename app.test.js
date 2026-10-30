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
