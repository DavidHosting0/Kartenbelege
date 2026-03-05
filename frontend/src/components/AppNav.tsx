import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Camera,
  House,
  ReceiptText,
  Settings,
  ShieldUser
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import prizeLogo from "../assets/prizeotel___the_economy_hotel_by_karim_rashid_logo.jpg";

const isActive = (path: string, pathname: string): boolean => pathname === path || pathname.startsWith(`${path}/`);

export const AppNav = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const links = [
    { to: "/dashboard", label: "Dashboard", icon: House },
    { to: "/scan", label: "Scan Receipt", icon: Camera },
    { to: "/receipts", label: "Receipts", icon: ReceiptText },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/users", label: "Users", icon: ShieldUser, adminOnly: true },
    { to: "/settings", label: "Settings", icon: Settings }
  ];

  return (
    <aside className="app-nav">
      <div className="app-nav-inner">
        <div className="app-brand">
          <img alt="Prize by Radisson" src={prizeLogo} />
        </div>
        <nav className="app-nav-links">
          {links
            .filter((link) => !link.adminOnly || user?.role === "admin")
            .map((link) => (
              <Link className={isActive(link.to, location.pathname) ? "active" : ""} key={link.to} to={link.to}>
                <link.icon size={18} strokeWidth={2} />
                <span>{link.label}</span>
              </Link>
            ))}
        </nav>
        <div className="app-nav-user">
          <span>{user?.username}</span>
          <button className="ghost compact" onClick={logout} type="button">
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
};
