export async function dashboardInit() {
  const [dash, me] = await Promise.all([
    dashboard.overview(),
    auth.me()
  ]);

  setBalance(dash.balance); // 🔥 live state sync

  return {
    user: me.user || me,
    balance: dash.balance,
    wallet: dash.wallet,
    recentTransactions: dash.recentTransactions
  };
}
