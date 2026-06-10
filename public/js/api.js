const API_BASE = "http://localhost:3000/api";

async function request(endpoint, options = {}) {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || "Request failed");
    }

    return data;

  } catch (err) {
    console.error("API ERROR:", endpoint, err.message);
    throw err;
  }
}

/**
 * WALLET API
 */
export const WalletAPI = {
  linkWallet: (walletId) =>
    request("/wallet/link", {
      method: "POST",
      body: { walletId }
    }),

  unlinkWallet: (walletId) =>
    request("/wallet/unlink", {
      method: "POST",
      body: { walletId }
    }),

  getWallets: () =>
    request("/wallet/list")
};

/**
 * TRANSFER API
 */
export const TransferAPI = {
  send: (payload) =>
    request("/transfer", {
      method: "POST",
      body: payload
    })
};
