# Wiring this into iscansystem

Everything here is NEW files — nothing in your existing tree is touched or
replaced. `reconciliationService.js` (Ledger Scanner + Blockchain Scanner +
Balance Comparator, i.e. `reconcileUser`) is reused as-is by
`reconciliationEngine.js`. Its `correctUserDrift`/`correctAllUsersDrift`
exports are left alone too — you can keep using them directly if you ever
want the old no-policy-check behavior, but the new admin routes below don't
call them.

## 1. Copy files

Drop the `src/` tree from this bundle into your repo root — it only adds
files under:
- `src/models/reconciliation/`
- `src/services/reconciliation/`
- `src/controllers/reconciliation/`
- `src/routes/reconciliation/`

## 2. Mount the admin routes

In `app.js` (wherever your other route mounts live, near
`dashboardRoutes`):

```js
import reconciliationRoutes from './src/routes/reconciliation/reconciliationRoutes.js';
app.use('/api/v1/admin/reconciliation', reconciliationRoutes);
```

New endpoints (all `requireAuth` + `requireAdmin`):
- `POST /api/v1/admin/reconciliation/run/:userId` `{ mode: 'AUTO_CORRECT' | 'DRY_RUN' }` — the "Run Full Correction" button, single user
- `POST /api/v1/admin/reconciliation/run-all` `{ mode }` — platform-wide
- `GET  /api/v1/admin/reconciliation/queue?status=PENDING` — the human-review inbox (RISK_DRIFT / NEED_APPROVAL items)
- `POST /api/v1/admin/reconciliation/queue/:id/approve` `{ note? }`
- `POST /api/v1/admin/reconciliation/queue/:id/reject` `{ note? }`

## 3. Wire the "Refresh" flow (doc 2) into the existing button

Your `GET /api/v1/dashboard/refresh-balances` route already exists
(`dashboardRoutes.js` → `dashboardController.refreshChainBalances`), called
by `useDashboard.ts`'s `refreshChainBalances()`. I don't have
`dashboardController.js`'s current contents, so rather than guess and
possibly clobber your 8-second cooldown/throttling logic, here's the one
line to add inside that handler, after your existing chain-balance fetch
and before you build the JSON response:

```js
import { refreshUserSnapshot } from '../services/reconciliation/reconciliationEngine.js';

// inside refreshChainBalances, after the existing on-chain fetch:
const { balances, reconciliation } = await refreshUserSnapshot(req.user.id);
// `balances` is the same shape balanceService.getUserBalance() already
// returns elsewhere in this file, safe to merge into your existing
// response object. `reconciliation` is optional to expose to the client —
// useful for a small "1 balance auto-corrected" toast, but not required.
```

This keeps your existing throttle/cooldown untouched (it wraps this call,
not the other way around) and only ever auto-applies SAFE_DRIFT — anything
RISK_DRIFT found during a user's own refresh gets queued for admin review,
never silently applied.

## 4. Environment variables (all optional, sensible defaults included)

```
RECON_SAFE_DRIFT_USDC=1          # USDC drift <= this => SAFE_DRIFT
RECON_SAFE_DRIFT_USDT=1          # USDT drift <= this => SAFE_DRIFT
RECON_DEBIT_SAFETY_FACTOR=0.2    # debits (ledger_ahead_of_chain) use this fraction of the safe threshold
RECON_AUTO_APPROVE_MAX_USDC=5    # hard ceiling for AUTO_APPROVED regardless of riskLevel
RECON_AUTO_APPROVE_MAX_USDT=5
RECONCILIATION_ACCOUNT_USER_ID=  # optional: a real User _id for the double-entry offset leg
```

## 5. Known gaps to close when you're ready

- **`chain_ahead_of_ledger` (crediting a user) never auto-approves today.**
  `correctionPolicyEngine.js`'s `checkTxConfirmation` blocks it
  unconditionally, because `getOnChainTotal()` only returns aggregate
  balances, not per-deposit tx hashes/confirmations. Every missed-deposit
  credit lands in the review queue until that's extended.
- **Notification Layer is stubbed** (`notificationLayer.js`) — logs via
  `inspector` only. Wire your existing Telegram alert sender into
  `sendOperatorNotification` (and whatever you use for compliance/user
  notifications) — the call sites elsewhere never need to change.
- **Double-entry is opt-in.** Without `RECONCILIATION_ACCOUNT_USER_ID` set,
  corrections still apply, just single-entry (same as your original
  `correctUserDrift`). Create one system User doc and set the env var to
  get the full "Debit: Reconciliation Account / Credit: User Wallet" pair
  from the diagram.
- Add a Mongo index cleanup job or admin sweep for `EXPIRED` proposals if
  `PENDING` items pile up unreviewed — the model supports the status,
  nothing currently transitions items into it (mirrors the pattern you
  already have in `withdrawalExpiryService.js`, worth reusing).
