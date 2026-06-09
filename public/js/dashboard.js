// public/js/dashboard.js
import { loadWallets } from './wallet.js';
import { apiGet } from './api.js';

function switchTab(id, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));

  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
}

window.switchTab = switchTab;

async function loadDashboardBalances() {
  const wallets = await apiGet('/api/v1/wallet/list');

  document.getElementById('phpBalance').textContent =
    Array.isArray(wallets)
      ? wallets.length + ' Wallet(s)'
      : '0 Wallets';
}

async function init() {
  try {
    const user = await apiGet('/api/v1/auth/verify');

    document.getElementById('userInfo').textContent =
      user.user.email;

    await loadDashboardBalances();
    await loadWallets();

  } catch (err) {
    window.location.href = '/login.html';
  }
}

window.addEventListener('DOMContentLoaded', init);
