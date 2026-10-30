# PulseBank

Banking backend (Express) and mobile app (Expo / React Native).

## Providers

| Area | Provider | Routes | Env |
|------|----------|--------|-----|
| Bank accounts | Column | `/banking` | `COLUMN_API_KEY` |
| Card issuing | Lithic | `/issuing` | `LITHIC_API_KEY`, `LITHIC_ENV` |
| Card payments | Stripe | `/payments/stripe` | `STRIPE_SECRET_KEY` |
| Wallet payments | PayPal | `/payments/paypal` | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` |
| Direct Debit | GoCardless | `/payments/gocardless` | `GOCARDLESS_ACCESS_TOKEN`, `GOCARDLESS_ENV` |

Each integration returns 503 until its keys are set. Copy `.env.example` to `.env`. Providers default to sandbox/test mode; going live requires approved provider accounts.

Plus a demo in-memory ledger at `/accounts`, `/transfer`.

## Run

```
npm install && npm start        # API on :3000
npm test
cd mobile && npm install && EXPO_PUBLIC_API_URL=http://<host>:3000 npx expo start
```
