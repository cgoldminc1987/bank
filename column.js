const express = require('express');

// Real bank accounts via Column (https://column.com). Column API keys are sandbox or production keys.
function createColumnRouter(request) {
  const router = express.Router();
  const apiKey = process.env.COLUMN_API_KEY;

  if (!request) {
    if (!apiKey) {
      return router.use((req, res) =>
        res.status(503).json({ error: 'Banking disabled: set COLUMN_API_KEY' }));
    }
    const base = process.env.COLUMN_API_URL || 'https://api.column.com';
    const auth = 'Basic ' + Buffer.from(`:${apiKey}`).toString('base64');
    request = async (method, path, body) => {
      const r = await fetch(base + path, {
        method,
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw Object.assign(new Error(data.message || `Column error ${r.status}`), { status: r.status });
      }
      return data;
    };
  }

  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  };
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

  // Creates a person entity (KYC runs on Column's side).
  router.post('/entities', wrap(async (req) => {
    const { first_name, last_name, ssn, date_of_birth, email, address } = req.body || {};
    const person = { first_name, last_name, ssn, date_of_birth, email, address };
    const missing = Object.keys(person).filter((k) => !person[k]);
    if (missing.length) throw bad(`Missing fields: ${missing.join(', ')}`);
    return request('POST', '/entities/person', person);
  }));

  router.post('/accounts', wrap(async (req) => {
    const { entity_id, description } = req.body || {};
    if (!entity_id) throw bad('entity_id is required');
    const account = await request('POST', '/bank-accounts', { entity_id, description });
    const number = await request('POST', `/bank-accounts/${account.id}/account-numbers`, {});
    return { account, account_number: number };
  }));

  router.get('/accounts/:id', wrap((req) => request('GET', `/bank-accounts/${encodeURIComponent(req.params.id)}`)));

  return router;
}

module.exports = createColumnRouter;
