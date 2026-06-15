type Props = {
  data?: {
    totalTransactions?: number;
    successRate?: number;
    failureRate?: number;
    wallets?: number;
    activeWallets?: number;
  };
};
export default function KPIRow({ data }: Props) {
  return (
    <div className="kpi-row">
      <div className="card">
        <h3>Total Transactions</h3>
        <h2>{data?.totalTransactions ?? 0}</h2>
      </div>
      <div className="card">
        <h3>Success Rate</h3>
        <h2>{(data?.successRate ?? 0).toFixed(1)}%</h2>
      </div>
      <div className="card">
        <h3>Failure Rate</h3>
        <h2>{(data?.failureRate ?? 0).toFixed(1)}%</h2>
      </div>
      <div className="card">
        <h3>Total Wallets</h3>
        <h2>{data?.wallets ?? 0}</h2>
      </div>
      <div className="card">
        <h3>Active Wallets</h3>
        <h2>{data?.activeWallets ?? 0}</h2>
      </div>
    </div>
  );
}
