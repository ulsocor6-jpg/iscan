export default function MarketsPanel() {
  const assets = [
    { symbol: "BTC", price: "$105,200", change: "+2.3%" },
    { symbol: "ETH", price: "$5,220", change: "+1.8%" },
    { symbol: "SOL", price: "$210", change: "+4.1%" },
    { symbol: "RON", price: "$0.74", change: "+5.2%" },
    { symbol: "USDC", price: "$1.00", change: "0.0%" }
  ];

  return (
    <div className="card">
      <h2>Markets</h2>

      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>24h</th>
          </tr>
        </thead>

        <tbody>
          {assets.map((asset) => (
            <tr key={asset.symbol}>
              <td>{asset.symbol}</td>
              <td>{asset.price}</td>
              <td>{asset.change}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
