type Props = {
  data?: {
    approved: number;
    pending: number;
    rejected: number;
    amlAlerts: number;
  };
};

export default function ComplianceSnapshot({
  data
}: Props) {

  return (
    <div className="card">

      <h2>Compliance</h2>

      <div className="metric">
        <span>Approved</span>
        <strong>{data?.approved ?? 0}</strong>
      </div>

      <div className="metric">
        <span>Pending</span>
        <strong>{data?.pending ?? 0}</strong>
      </div>

      <div className="metric">
        <span>Rejected</span>
        <strong>{data?.rejected ?? 0}</strong>
      </div>

      <div className="metric">
        <span>AML Alerts</span>
        <strong>{data?.amlAlerts ?? 0}</strong>
      </div>

    </div>
  );
}
