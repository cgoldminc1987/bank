const express = require('express');
const Lithic = require('lithic');

// Account holders (KYC) and card issuing via Lithic. Defaults to the sandbox environment.
function createIssuingRouter(client) {
  const router = express.Router();

  if (!client) {
    if (!process.env.LITHIC_API_KEY) {
      return router.use((req, res) =>
        res.status(503).json({ error: 'Issuing disabled: set LITHIC_API_KEY' }));
    }
    client = new Lithic({
      apiKey: process.env.LITHIC_API_KEY,
      environment: process.env.LITHIC_ENV === 'production' ? 'production' : 'sandbox',
    });
  }

  const wrap = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  };

  const cardView = (c) => ({
    token: c.token,
    type: c.type,
    state: c.state,
    last_four: c.last_four,
    exp_month: c.exp_month,
    exp_year: c.exp_year,
    spend_limit: c.spend_limit,
    spend_limit_duration: c.spend_limit_duration,
    memo: c.memo,
    created: c.created,
  });

  // Opens an account by creating a KYC-verified account holder.
  router.post('/account-holders', wrap(async (req) => {
    const { first_name, last_name, dob, email, phone_number, government_id, address } = req.body || {};
    const individual = { first_name, last_name, dob, email, phone_number, government_id, address };
    const missing = Object.keys(individual).filter((k) => !individual[k]);
    if (missing.length) {
      throw Object.assign(new Error(`Missing fields: ${missing.join(', ')}`), { status: 400 });
    }
    const holder = await client.accountHolders.create({
      workflow: 'KYC_BASIC',
      tos_timestamp: new Date().toISOString(),
      individual,
    });
    return {
      token: holder.token,
      account_token: holder.account_token,
      status: holder.status,
      status_reasons: holder.status_reasons,
    };
  }));

  router.get('/account-holders/:token', wrap(async (req) => {
    const h = await client.accountHolders.retrieve(req.params.token);
    return {
      token: h.token,
      account_token: h.account_token,
      status: h.status,
      status_reasons: h.status_reasons,
    };
  }));

  router.post('/cards', wrap(async (req) => {
    const { account_token, type = 'VIRTUAL', spend_limit, spend_limit_duration = 'MONTHLY', memo } = req.body || {};
    if (!account_token) throw Object.assign(new Error('account_token is required'), { status: 400 });
    if (!['VIRTUAL', 'UNLOCKED'].includes(type)) {
      throw Object.assign(new Error('type must be VIRTUAL or UNLOCKED'), { status: 400 });
    }
    const params = { type, account_token, spend_limit_duration, memo };
    if (spend_limit !== undefined) params.spend_limit = spend_limit; // cents
    return cardView(await client.cards.create(params));
  }));

  router.get('/cards', wrap(async (req) => {
    const params = req.query.account_token ? { account_token: req.query.account_token } : {};
    const cards = [];
    for await (const c of client.cards.list(params)) cards.push(cardView(c));
    return cards;
  }));

  router.get('/cards/:token', wrap(async (req) => cardView(await client.cards.retrieve(req.params.token))));

  router.patch('/cards/:token', wrap(async (req) => {
    const { state, spend_limit } = req.body || {};
    const body = {};
    if (state) {
      if (!['OPEN', 'PAUSED', 'CLOSED'].includes(state)) {
        throw Object.assign(new Error('state must be OPEN, PAUSED or CLOSED'), { status: 400 });
      }
      body.state = state;
    }
    if (spend_limit !== undefined) body.spend_limit = spend_limit;
    return cardView(await client.cards.update(req.params.token, body));
  }));

  return router;
}

module.exports = createIssuingRouter;
