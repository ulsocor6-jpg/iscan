import { useNavigate, useLocation } from "react-router-dom";
export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = (path) => location.pathname === path;
  const links = [
    {label:"Dashboard",path:"/dashboard"},
    {label:"Deposits",path:"/deposits"},
    {label:"Transfers",path:"/transfers"},
    {label:"Swaps",path:"/swaps"},
    {label:"Wallets",path:"/wallets"},
    {label:"Remittance",path:"/remittance"},
    {label:"Treasury",path:"/treasury"},
    {label:"Compliance",path:"/compliance"},
    {label:"Activity",path:"/activity"},
    {label:"Settings",path:"/settings"},
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
