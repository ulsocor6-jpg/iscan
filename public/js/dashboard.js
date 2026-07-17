/**
 * dashboard-api.js
 * ISCAN Dashboard API
 * Ledger-based Wallet System
 */

const API = '/api/v1';

/* ==================================================
   CORE FETCH
================================================== */

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  let data;

  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid server response');
  }

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }

    throw new Error(
      data.message ||
      data.error ||
      `HTTP ${res.status}`
    );
  }

  return data;
}

/* ==================================================
   AUTH
================================================== */

export const auth = {
  me() {
    return apiFetch('/auth/me');
  },

  async logout() {
    await apiFetch('/auth/logout', {
      method: 'POST'
    });

    window.location.href = '/login';
  }
};

/* ==================================================
   DASHBOARD
================================================== */

export const dashboard = {

  // Fast initial load — Ledger balances only, zero RPC calls.
  // Chain balances come back as `pending` in the portfolio list
  // until refreshChainBalances() is called explicitly.
  async overview() {
    return apiFetch('/dashboard');
  },

  // On-demand only. Call this from a "Refresh" button's click handler —
  // never on an interval. This is the one call that actually hits
  // Base/Ronin RPCs, so it should only fire when the user asks for it.
  // The backend also enforces an 8s per-user cooldown, so rapid repeat
  // clicks return the previous result with `throttled: true` instead of
  // re-hitting RPC.
  async refreshChainBalances() {
    return apiFetch('/dashboard/refresh-balances');
  },

  async health() {
    return apiFetch('/dashboard/health');
  },

  async risk() {
    return apiFetch('/dashboard/risk');
  }
};

/* ==================================================
   WALLET
================================================== */

export const wallet = {

  async get() {
    const data = await apiFetch('/dashboard');

    return {
      wallet: data.wallet || {},
      balance: data.balance || 0,
      balances: data.balances || {}
    };
  },

  async balance() {
    const data = await apiFetch('/dashboard');

    return {
      balance: data.balance || 0,
      balances: data.balances || {}
    };
  }
};

/* ==================================================
   USERS
================================================== */

export const users = {

  search(query) {
    return apiFetch(
      `/users/search?q=${encodeURIComponent(query)}`
    );
  }
};

/* ==================================================
   TRANSFER
================================================== */

export const transfer = {

  async send({
    toWalletId,
    amount,
    asset = 'PHP',
    memo = ''
  }) {

    const result = await apiFetch(
      '/transfer/send',
      {
        method: 'POST',
        body: JSON.stringify({
          toWalletId,
          amount,
          asset,
          memo
        })
      }
    );

    return result;
  }
};

/* ==================================================
   LEDGER
================================================== */

export const ledger = {

  history(limit = 30) {
    return apiFetch(
      `/ledger/history?limit=${limit}`
    );
  },

  feed(limit = 30) {
    return apiFetch(
      `/ledger?limit=${limit}`
    );
  }
};

/* ==================================================
   CHAIN BALANCE REFRESH (manual, button-driven)
   ------------------------------------------------
   Replaces the old startBalanceRefresh()/stopBalanceRefresh()
   5-second polling loop, which called the full dashboard
   endpoint — and therefore Base/Ronin RPC — every 5s for every
   open tab. Wire refreshChainBalancesNow() to a button's onclick;
   nothing in this module calls it automatically.
================================================== */

let _refreshInFlight = false;

export async function refreshChainBalancesNow(callback) {
  if (_refreshInFlight) return; // ignore double-clicks while a call is out
  _refreshInFlight = true;
  try {
    const data = await dashboard.refreshChainBalances();
    if (callback) callback(data);
    return data;
  } catch (err) {
    console.error('[CHAIN BALANCE REFRESH]', err.message);
    throw err;
  } finally {
    _refreshInFlight = false;
  }
}

/* ==================================================
   DASHBOARD INIT
================================================== */

export async function dashboardInit() {

  const [userData, dashData] =
    await Promise.all([
      auth.me(),
      dashboard.overview()
    ]);

  return {
    user:
      userData.user ||
      userData,

    wallet:
      dashData.wallet || {},

    balance:
      dashData.balance || 0,

    balances:
      dashData.balances || {},

    recentTransactions:
      dashData.recentTransactions || []
  };
}
