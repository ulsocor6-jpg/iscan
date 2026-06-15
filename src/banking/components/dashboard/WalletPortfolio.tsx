type Wallet = {
  type?: 'internal' | 'external';
  network: string;
  chain?: string;
  token: string;
  color?: string;
  balance: number;
  usdc?: number;
  address?: string;
  provider?: string;
};

type Props = { data?: Wallet[] };

const CHAIN_ICONS: Record<string, string> = {
  ETHEREUM: '⬡', POLYGON: '⬟', BASE: '🔵', RONIN: '🗡️',
};

export default function WalletPortfolio({ data }: Props) {
  const wallets = data ?? [];
  return (
    <div className="card">
      <h2>Wallet Portfolio</h2>
      {wallets.length === 0 && (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>No wallets found</div>
      )}
      {wallets.map((wallet, index) => (
        <div key={index} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', borderBottom: '1px solid #1d2942', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: (wallet.color || '#1d2942') + '22',
              border: `2px solid ${wallet.color || '#1d2942'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, flexShrink: 0,
            }}>
              {CHAIN_ICONS[wallet.chain || ''] || '◎'}
            </div>
            <div>
              <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>{wallet.network}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                {wallet.type === 'internal' && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    background: '#0d3321', color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    iScan
                  </span>
                )}
                {wallet.type === 'external' && wallet.provider && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    background: '#1a1200', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {wallet.provider}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>
              {(wallet.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}{' '}
              <span style={{ color: wallet.color || '#94a3b8', fontSize: 11 }}>{wallet.token}</span>
            </div>
            {(wallet.usdc ?? 0) > 0 && (
              <div style={{ color: '#60a5fa', fontSize: 11, marginTop: 2 }}>
                ${wallet.usdc!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
