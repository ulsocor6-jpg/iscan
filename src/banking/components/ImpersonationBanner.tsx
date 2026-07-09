import { useAuth } from "../../hooks/useAuth";

export default function ImpersonationBanner() {
  const { user } = useAuth();

  if (!user?.impersonating) return null;

  const handleExit = async () => {
    await fetch("/api/v1/auth/exit-impersonation", {
      method: "POST",
      credentials: "include",
    });
    window.location.href = "/admin/users";
  };

  return (
    <div
      style={{
        background: "#7c2d12",
        color: "#fed7aa",
        padding: "8px 16px",
        fontSize: "13px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <span>
        👁 Viewing as <strong>{user.firstName}</strong> ({user.email}) — impersonated by {user.adminEmail}
      </span>
      <button
        onClick={handleExit}
        style={{
          background: "#fed7aa",
          color: "#7c2d12",
          border: "none",
          borderRadius: "6px",
          padding: "4px 12px",
          fontSize: "12px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Exit impersonation
      </button>
    </div>
  );
}
