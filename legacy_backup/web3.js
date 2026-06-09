window.currentFullAddress = null;
window.currentProvider = null;

// Helper function to call our backend link/unlink routes
async function syncWalletWithBackend(action, address, providerName) {
  try {
    const response = await fetch(`/api/v1/wallet/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address, provider: providerName })
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Backend sync failed:", err);
    return false;
  }
}

async function connectWallet(providerType) {
  let provider;
  let providerName = '';

  if (providerType === 'metamask') {
    if (typeof window.ethereum === 'undefined') {
      alert('MetaMask is not installed!');
      return;
    }
    provider = window.ethereum;
    providerName = 'metamask';
  } else if (providerType === 'ronin') {
    if (typeof window.ronin === 'undefined') {
      alert('Ronin Wallet is not installed!');
      return;
    }
    provider = window.ronin.provider || window.ronin;
    providerName = 'ronin';
  }

  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const account = accounts[0];

    // Attempt to link it in the backend (checks the 3-wallet limit)
    const success = await syncWalletWithBackend('link', account, providerName);
    
    if (success) {
      window.currentFullAddress = account;
      window.currentProvider = providerName;
      
      const balanceWei = await provider.request({ method: 'eth_getBalance', params: [account, 'latest'] });
      const balanceEth = (parseInt(balanceWei, 16) / 1e18).toFixed(4);
      
      updateWalletUI(account, balanceEth, providerName);
    }
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

async function unlinkCurrentWallet() {
  if (!window.currentFullAddress) return;

  const success = await syncWalletWithBackend('unlink', window.currentFullAddress);
  
  if (success) {
    window.currentFullAddress = null;
    window.currentProvider = null;
    
    document.getElementById('wallet-connected').style.display = 'none';
    document.getElementById('wallet-disconnected').style.display = 'block';
  }
}

function updateWalletUI(account, balanceEth, providerName) {
  document.getElementById('wallet-disconnected').style.display = 'none';
  document.getElementById('wallet-connected').style.display = 'block';
  
  const shortAddress = account.substring(0, 6) + '...' + account.substring(account.length - 4);
  document.getElementById('wallet-address-text').textContent = shortAddress;
  document.getElementById('actual-balance').textContent = balanceEth;
  
  // Update provider icon visually
  const icon = document.getElementById('provider-icon');
  if(providerName === 'ronin') {
    icon.className = 'fa-solid fa-gamepad'; // Temporary icon for Ronin
  } else {
    icon.className = 'fa-brands fa-ethereum';
  }
}
