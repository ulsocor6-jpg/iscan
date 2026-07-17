import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const active = (path) => location.pathname === path;
  const links = [
    {label:"Dashboard",path:"/dashboard"},
    {label:"Deposits",path:"/deposits"},
    {label:"Withdrawals",path:"/withdrawals"},
    {label:"Transfers",path:"/transfers"},
    {label:"Swaps",path:"/swaps"},
    {label:"Wallets",path:"/wallets"},
    {label:"Remittance",path:"/remittance"},
    ...(user?.role === "admin" ? [
{label:"⚙ Cashouts",path:"/admin/cashouts"},
{label:"Treasury",path:"/treasury"},
{label:"📥 Deposits",path:"/admin/deposits"},
{label:"🔄 Reconciliation",path:"/admin/reconciliation"},
{label:"👥 Users",path:"/admin/users"},
{label:"🎥 System Inspector",path:"/admin/system-inspector"},
{label:"⛓️ Blockchain Inspector",path:"/admin/blockchain-inspector"},
{label:"🧠 Mission Control",path:"/admin/mission-control"},
{label:"🔁 Swap Inspector",path:"/admin/swap-inspector"},
{label:"🔬 Inspector",path:"/inspector"},
{label:"🛰️ Mission Control",path:"/admin/mission-control"},
{label:"🖥 Operator",path:"/admin/operator"}
] : []),
    {label:"Compliance",path:"/compliance"},
    {label:"Activity",path:"/activity"},
  ];
  return (
    <aside className="sidebar">
      <div className="logo">ISCAN</div>
      <nav>
        {links.map(({label,path})=>(
          <button key={path} className={active(path)?"active":""} onClick={()=>navigate(path)}>{label}</button>
        ))}
      </nav>
    </aside>
  );
}
