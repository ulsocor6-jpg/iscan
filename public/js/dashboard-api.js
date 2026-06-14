/**
 * ISCAN Dashboard API Layer (Ledger-based system)
 * Uses httpOnly cookies (no tokens stored in JS)
 */

const API = '/api/v1';

// ─────────────────────────────────────────────
// CORE FETCH WRAPPER
// ─────────────────────────────────────────────

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
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }

  return data;
}

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

export const auth = {
  me: () => apiFetch('/auth/me'),

  logout: async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
};

// ─────────────────────────────────────────────
// WALLET (LEDGER-BASED)
// ─────────────────────────────────────────────

export const wallet = {
  balance: () => apiFetch('/dashboard').then(r => ({
    balance: r.balance,
    wallet:  r.wallet
  }))
};

// ─────────────────────────────────────────────
// LEDGER
// ─────────────────────────────────────────────

export const ledger = {
  history: (limit = 30) => apiFetch(`/ledger/history?limit=${limit}`),
  feed:    (limit = 30) => apiFetch(`/ledger?limit=${limit}`)
};

// ─────────────────────────────────────────────
// TRANSFER (P2P / INTERNAL)
// ─────────────────────────────────────────────

export const transfer = {
  send: ({ toWalletId, amount, asset = 'PHP', memo = '' }) =>
    apiFetch('/transfer/send', {
      method: 'POST',
      body: JSON.stringify({ toWalletId, amount, asset, memo })
    })
};

// ─────────────────────────────────────────────
// SWAP
// ─────────────────────────────────────────────

export const swap = {
  /**
   * Convert foreign currency to PHP
   * @param {number} amount
   * @param {string} currency  e.g. 'USD', 'USDT', 'BTC'
   * Returns { success, data: { phpAmount, rate, source, tx } }
   */
  toPHP: (amount, currency) =>
    apiFetch('/swap/php', {
      method: 'POST',
      body: JSON.stringify({ amount, currency })
    })
};

// ─────────────────────────────────────────────
// USER SEARCH
// ─────────────────────────────────────────────

export const users = {
  search: (q) => apiFetch(`/users/search?q=${encodeURIComponent(q)}`)
};

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

export const dashboard = {
  overview: () => apiFetch('/dashboard'),
  health:   () => apiFetch('/health')
};

// ─────────────────────────────────────────────
// INIT (BOOTSTRAP DASHBOARD PAGE)
// ─────────────────────────────────────────────

export async function dashboardInit() {
  const [dash, me] = await Promise.all([
    dashboard.overview(),
    auth.me()
  ]);

  return {
    user:               me.user || me,
    balance:            dash.balance,
    wallet:             dash.wallet,
    recentTransactions: dash.recentTransactions
  };
}
