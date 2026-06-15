type Props = {
  data: any[];
};

export default function ActivityFeed({
  data = []
}: Props) {
  return (
    <div className="card">
      <h2>Recent Activity</h2>

      {data.length === 0 && (
        <div>No recent activity</div>
      )}

      {data.map((tx, index) => (
        <div
          key={tx.reference || index}
          className="activity-item"
        >
          <strong>
            {(tx.type || "UNKNOWN").toUpperCase()}
          </strong>

          {" "}
          {tx.amount || 0}
          {" "}
          {tx.currency || "PHP"}

          <br />

          <small>
            {tx.status || "pending"}
          </small>
        </div>
      ))}
    </div>
  );
}
