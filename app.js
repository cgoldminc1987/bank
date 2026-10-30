const express = require('express');

function createApp() {
  const app = express();
  app.use(express.json());

  const accounts = new Map();
  let nextId = 1;

  const validAmount = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const getAccount = (req, res) => {
    const acct = accounts.get(req.params.id);
    if (!acct) res.status(404).json({ error: 'Account not found' });
    return acct;
  };

  app.post('/accounts', (req, res) => {
    const { owner, initialDeposit = 0 } = req.body || {};
    if (typeof owner !== 'string' || !owner.trim()) {
      return res.status(400).json({ error: 'owner is required' });
    }
    if (typeof initialDeposit !== 'number' || !(initialDeposit >= 0)) {
      return res.status(400).json({ error: 'initialDeposit must be >= 0' });
    }
    const id = String(nextId++);
    const acct = { id, owner: owner.trim(), balance: initialDeposit, transactions: [] };
    accounts.set(id, acct);
    res.status(201).json(acct);
  });

  app.get('/accounts', (req, res) => res.json([...accounts.values()]));

  app.get('/accounts/:id', (req, res) => {
    const acct = getAccount(req, res);
    if (acct) res.json(acct);
  });

  app.post('/accounts/:id/deposit', (req, res) => {
    const acct = getAccount(req, res);
    if (!acct) return;
    const { amount } = req.body || {};
    if (!validAmount(amount)) return res.status(400).json({ error: 'amount must be a positive number' });
    acct.balance += amount;
    acct.transactions.push({ type: 'deposit', amount, date: new Date().toISOString() });
    res.json(acct);
  });

  app.post('/accounts/:id/withdraw', (req, res) => {
    const acct = getAccount(req, res);
    if (!acct) return;
    const { amount } = req.body || {};
    if (!validAmount(amount)) return res.status(400).json({ error: 'amount must be a positive number' });
    if (amount > acct.balance) return res.status(400).json({ error: 'Insufficient funds' });
    acct.balance -= amount;
    acct.transactions.push({ type: 'withdraw', amount, date: new Date().toISOString() });
    res.json(acct);
  });

  app.post('/transfer', (req, res) => {
    const { from, to, amount } = req.body || {};
    const src = accounts.get(String(from));
    const dst = accounts.get(String(to));
    if (!src || !dst) return res.status(404).json({ error: 'Account not found' });
    if (src === dst) return res.status(400).json({ error: 'Cannot transfer to same account' });
    if (!validAmount(amount)) return res.status(400).json({ error: 'amount must be a positive number' });
    if (amount > src.balance) return res.status(400).json({ error: 'Insufficient funds' });
    const date = new Date().toISOString();
    src.balance -= amount;
    dst.balance += amount;
    src.transactions.push({ type: 'transfer_out', amount, to: dst.id, date });
    dst.transactions.push({ type: 'transfer_in', amount, from: src.id, date });
    res.json({ from: src, to: dst });
  });

  return app;
}

module.exports = createApp;
