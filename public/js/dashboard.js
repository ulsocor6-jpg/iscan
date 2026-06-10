// ─── BALANCE DISPLAY ─────────────────────────────────────────────────────────

async function loadBalance() {
  try {
    const res = await fetch('/api/v1/wallet/balance', {
      method: 'GET',
      credentials: 'include' // sends the iscan_token cookie with the request
    });

    if (!res.ok) {
      console.error('[BALANCE] HTTP', res.status);
      setBalanceDisplay('—');
      return;
    }

    const data = await res.json();

    if (data.success) {
      // Format as Philippine Peso — adjust locale/currency to match your app
      const formatted = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
      }).format(data.balance);

      setBalanceDisplay(formatted);
    } else {
      setBalanceDisplay('—');
    }

  } catch (err) {
    console.error('[BALANCE ERROR]', err);
    setBalanceDisplay('—');
  }
}

function setBalanceDisplay(value) {
  // Update every element with this ID/class — adjust selector to match your HTML
  const els = document.querySelectorAll('#balance-display, .balance-amount');
  els.forEach(el => { el.textContent = value; });
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
  loadBalance();
});

// ─── SAFE ACTION WRAPPER (unchanged from original) ───────────────────────────

function safeAction(fn) {
  return async function (...args) {
    try {
      setLoading(true);
      const result = await fn(...args);
      console.log('SUCCESS:', result);
      setLoading(false);
      return result;
    } catch (err) {
      setLoading(false);
      alert('Error: ' + err.message);
    }
  };
}
