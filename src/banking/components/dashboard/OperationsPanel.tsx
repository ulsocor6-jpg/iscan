export default function OperationsPanel() {

  return (
    <div className="card">

      <h2>Operations Center</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(180px,1fr))",
          gap: 12
        }}
      >

        <button>
          Generate Deposit Address
        </button>

        <button>
          Send Internal Transfer
        </button>

        <button>
          Convert USDT → PHP
        </button>

        <button>
          Create Remittance
        </button>

      </div>

    </div>
  );
}
