window.connectWallet = async function(providerType) {
  const provider = providerType === 'metamask' ? window.ethereum : window.ronin;
  if (!provider) return alert('Wallet not installed!');

  try {
    // Force permission request
    await provider.request({ method: 'eth_requestAccounts' });
    const accounts = await provider.request({ method: 'eth_accounts' });
    const account = accounts[0];

    const res = await fetch('/api/v1/wallet/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: account, provider: providerType })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
      return;
    }
    
    // Refresh UI
    window.location.reload(); 
  } catch (err) { console.error(err); }
};
