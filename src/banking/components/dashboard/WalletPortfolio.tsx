type Props = {
  data?: any[];
};

export default function WalletPortfolio({
  data
}: Props) {

  return (
    <div className="card">

      <h2>Wallet Portfolio</h2>

      {(data ?? []).length === 0 && (
        <div>
          No linked wallets found
        </div>
      )}

      {(data ?? []).map((wallet, index) => (

        <div
          key={index}
          className="wallet-row"
        >
          <strong>
            {wallet.network}
          </strong>

          <span>
            {wallet.balance}
            {" "}
            {wallet.token}
          </span>
        </div>

      ))}

    </div>
  );
}
