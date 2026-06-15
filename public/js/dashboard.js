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

```
throw new Error(
  data.message ||
  data.error ||
  `HTTP ${res.status}`
);
```

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

```
window.location.href = '/login';
```

}
};

/* ==================================================
DASHBOARD
================================================== */

export const dashboard = {

async overview() {
return apiFetch('/dashboard');
},

async refresh() {
return apiFetch('/dashboard');
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

```
return {
  wallet: data.wallet || {},
  balance: data.balance || 0,
  balances: data.balances || {}
};
```

},

async balance() {
const data = await apiFetch('/dashboard');

```
return {
  balance: data.balance || 0,
  balances: data.balances || {}
};
```

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

```
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
```

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
LIVE DASHBOARD REFRESH
================================================== */

let refreshTimer = null;

export function startBalanceRefresh(
callback,
interval = 5000
) {

if (refreshTimer) {
clearInterval(refreshTimer);
}

refreshTimer = setInterval(
async () => {
try {

```
    const data =
      await dashboard.overview();

    if (callback) {
      callback(data);
    }

  } catch (err) {
    console.error(
      '[DASHBOARD REFRESH]',
      err.message
    );
  }
},
interval
```

);
}

export function stopBalanceRefresh() {

if (refreshTimer) {
clearInterval(refreshTimer);
refreshTimer = null;
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

```
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
```

};
}

