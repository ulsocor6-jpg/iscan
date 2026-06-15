/**
 * ISCAN Dashboard API Layer (FINAL WIRED VERSION)
 * Backend: /api/v1/dashboard (Ledger-based system)
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
    throw new Error('Invalid JSON response from server');
  }

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }

  return data;
}

/* ==================================================
   AUTH
================================================== */
export const auth = {
  me: () => apiFetch('/auth/me'),

  logout: async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
};

/* ==================================================
   DASHBOARD (SINGLE SOURCE OF TRUTH)
================================================== */
export const dashboard = {
  /**
   * Returns:
   * {
   *   wallet,
   *   balances,
   *   recentTransactions
   * }
   */
  get: () => apiFetch('/dashboard')
};

/* ==================================================
   WALLET HELPERS
================================================== */
export const wallet = {
  get: async () => {
    const res = await apiFetch('/dashboard');

    return {
      wallet: res.wallet,
      balances: res.balances || {},
      balance: Object.values(res.balances || {}).reduce((a, b) => a + b, 0)
    };
  }
};

/* ==================================================
   TRANSFER (WIRED TO BACKEND)
================================================== */
export const transfer = {
  send: ({ toWalletId, amount, asset = 'USDT', memo = '' }) =>
    apiFetch('/transfer/send', {
      method: 'POST',
      body: JSON.stringify({
        toWalletId,
        amount,
        asset,
        memo
      })
    })
};

/* ==================================================
   LEDGER
================================================== */
export const ledger = {
  history: (limit = 30) =>
    apiFetch(`/ledger/history?limit=${limit}`),

  feed: (limit = 30) =>
    apiFetch(`/ledger?limit=${limit}`)
};

/* ==================================================
   LIVE BALANCE SYNC (REAL-TIME UI)
================================================== */
let interval = null;

export function startLiveDashboardSync(onUpdate, ms = 5000) {
  if (interval) clearInterval(interval);

  interval = setInterval(async () => {
    try {
      const data = await dashboard.get();

      const balance =
        Object.values(data.balances || {})
          .reduce((a, b) => a + b, 0);

      onUpdate?.({
        wallet: data.wallet,
        balance,
        recentTransactions: data.recentTransactions
      });

    } catch (err) {
      console.error('[SYNC ERROR]', err.message);
    }
  }, ms);
}

export function stopLiveDashboardSync() {
  if (interval) clearInterval(interval);
  interval = null;
}

/* ==================================================
   BOOTSTRAP
================================================== */
export async function dashboardInit() {
  const [me, dash] = await Promise.all([
    auth.me(),
    dashboard.get()
  ]);

  const balance =
    Object.values(dash.balances || {})
      .reduce((a, b) => a + b, 0);

  return {
    user: me.user || me,
    wallet: dash.wallet,
    balance,
    recentTransactions: dash.recentTransactions
  };
}
