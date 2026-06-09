// public/js/wallet.js
import { apiGet, apiPost } from './api.js';

export async function connectWallet(type) {
  const provider =
    type === 'metamask'
      ? window.ethereum
      : (window.ronin?.provider || window.ronin);

  if (!provider) {
    alert(type + ' wallet not found');
    return;
  }

  try {
    // FORCE approval popup
    await provider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }]
    });

    const accounts = await provider.request({
      method: 'eth_accounts'
    });

    const address = accounts[0];

    const result = await apiPost('/api/v1/wallet/link', {
      address,
      provider: type
    });

    alert(result.message);
    await loadWallets();

  } catch (err) {
    alert('Wallet error: ' + err.message);
  }
}

export async function loadWallets() {
  const wallets = await apiGet('/api/v1/wallet/list');

  const container = document.getElementById('walletList');

  if (!Array.isArray(wallets) || wallets.length === 0) {
    container.innerHTML = 'No wallets linked';
    return;
  }

  container.innerHTML = wallets.map(w => `
    <div class="wallet-item">
      <span class="wallet-address">${w.address}</span>
      <span class="badge ${w.provider}">${w.provider}</span>
    </div>
  `).join('');
}
