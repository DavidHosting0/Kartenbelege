import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const ProtectedRoute = ({
  children,
  adminOnly = false
}: {
  children: JSX.Element;
  adminOnly?: boolean;
}) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="center-screen">Loading session...</div>;
  }
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};
