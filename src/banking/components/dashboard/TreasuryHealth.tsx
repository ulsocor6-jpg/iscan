type Props = {
  data?: {
    wallets: number;
    activeWallets: number;
    liquidityRatio: number;
  };
};

export default function TreasuryHealth({
  data
}: Props) {

  return (
    <div className="card">

      <h2>Treasury Health</h2>

      <div className="metric">
        <span>Total Wallets</span>
        <strong>{data?.wallets ?? 0}</strong>
      </div>

      <div className="metric">
        <span>Active Wallets</span>
        <strong>{data?.activeWallets ?? 0}</strong>
      </div>

      <div className="metric">
        <span>Liquidity Ratio</span>

        <strong>
          {(data?.liquidityRatio ?? 0).toFixed(1)}%
        </strong>
      </div>

    </div>
  );
}
