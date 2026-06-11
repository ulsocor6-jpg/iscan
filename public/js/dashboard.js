/**
 * dashboard-api.js
 * ISCAN Dashboard — API wiring layer
 * Drop into public/js/ and import in dashboard.html
 *
 * All calls use httpOnly cookies (set at login) — no token handling needed here.
 */

const API = '/api/v1';

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include', // sends httpOnly cookie
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });

  const data = await res.json();

  if (!res.ok) {
    // If 401, redirect to login
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const auth = {
  /** Returns current user or redirects to /login */
  me: () => apiFetch('/auth/me'),

  logout: async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }
};

// ─── WALLET / BALANCE ─────────────────────────────────────────────────────────

export const wallet = {
  /** Returns { balance: Number } */
  balance: () => apiFetch('/internal/balance'),

  /** Admin: add funds to own wallet */
  credit: (amount) => apiFetch('/internal/credit', {
    method: 'POST',
    body: JSON.stringify({ amount })
  }),

  /** Admin: spend funds from own wallet */
  debit: (amount) => apiFetch('/internal/debit', {
    method: 'POST',
    body: JSON.stringify({ amount })
  })
};

// ─── LEDGER / TRANSACTION HISTORY ────────────────────────────────────────────

export const ledger = {
  /**
   * Returns { success, entries: [...] }
   * Each entry has: credit, debit, transactionType, description, createdAt, runningBalance
   */
  history: (limit = 30) => apiFetch(`/ledger/history?limit=${limit}`),

  /** Flat list without running balance — lighter query */
  feed: (limit = 30) => apiFetch(`/ledger?limit=${limit}`)
};

// ─── P2P TRANSFER ─────────────────────────────────────────────────────────────

export const p2p = {
  /**
   * Search for a user by name, email, or phone
   * Returns { success, users: [{ _id, name, email, phone }] }
   */
  searchUser: (q) => apiFetch(`/users/search?q=${encodeURIComponent(q)}`),

  /**
   * Send money to a user
   * @param {string} receiverId  — MongoDB ObjectId of recipient
   * @param {number} amount
   */
  send: (receiverId, amount) => apiFetch('/p2p/send', {
    method: 'POST',
    body: JSON.stringify({ receiverId, amount })
  })
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

export const dashboard = {
  overview: () => apiFetch('/dashboard/overview'),
  risk:     () => apiFetch('/dashboard/risk'),
  health:   () => apiFetch('/dashboard/health')
};

// ─── Bootstrap helper — call on dashboard page load ──────────────────────────

/**
 * Loads user identity + balance in parallel on page init.
 * Usage: const { user, balance } = await dashboardInit();
 */
export async function dashboardInit() {
  const [meRes, balRes] = await Promise.all([
    auth.me(),
    wallet.balance()
  ]);

  return {
    user:    meRes.user  || meRes,
    balance: balRes.balance
  };
}
