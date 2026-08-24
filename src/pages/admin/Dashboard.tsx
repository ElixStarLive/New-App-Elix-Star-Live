import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, DollarSign, Flag, Users, Video, Zap } from "lucide-react";
import {
  ADMIN_DASHBOARD_ACTIONS,
  ADMIN_DASHBOARD_ACTIONS_TITLE,
  ADMIN_DASHBOARD_ERROR,
  ADMIN_DASHBOARD_LOADING,
  ADMIN_DASHBOARD_TITLE,
  formatAdminCount,
  formatAdminRevenueMajor,
} from "@/content/adminDashboard";
import { apiFetchAdminDashboard, type AdminDashboardStats } from "@/features/admin/adminApi";
import { useAuthStore } from "@/store/useAuthStore";

const STAT_ICONS: Record<string, ReactNode> = {
  dailyActiveUsers: <Users className="w-8 h-8" />,
  totalUsers: <Users className="w-8 h-8" />,
  totalVideos: <Video className="w-8 h-8" />,
  liveRooms: <Zap className="w-8 h-8" />,
  totalRevenue: <DollarSign className="w-8 h-8" />,
  pendingReports: <Flag className="w-8 h-8" />,
};

const STAT_COLORS: Record<string, string> = {
  blue: "from-blue-500/20 to-blue-600/5",
  green: "from-green-500/20 to-green-600/5",
  purple: "from-purple-500/20 to-purple-600/5",
  red: "from-red-500/20 to-red-600/5",
  yellow: "from-yellow-500/20 to-yellow-600/5",
  orange: "from-orange-500/20 to-orange-600/5",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setStats(null);
      setError(null);
      setLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const ownerId = userId;
    setStats(null);
    setError(null);
    setLoading(true);
    void apiFetchAdminDashboard().then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setStats(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (result.error || !result.data) {
        setStats(null);
        setError(result.error || ADMIN_DASHBOARD_ERROR);
        setLoading(false);
        return;
      }
      setStats(result.data);
      setError(null);
      setLoading(false);
    });
  }, [isAdmin, userId]);

  const goAdminPath = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen elix-page-glass bg-transparent flex items-center justify-center" aria-busy="true">
        <div className="text-white">{ADMIN_DASHBOARD_LOADING}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-white" />
          {ADMIN_DASHBOARD_TITLE}
        </h1>

        {error ? (
          <p role="alert" className="text-sm text-rose-300 mb-8">
            {error}
          </p>
        ) : null}

        {stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <StatCard
              icon={STAT_ICONS.dailyActiveUsers}
              title="Daily Active Users"
              value={formatAdminCount(stats.dailyActiveUsers)}
              color="blue"
            />
            <StatCard
              icon={STAT_ICONS.totalUsers}
              title="Total Users"
              value={formatAdminCount(stats.totalUsers)}
              color="green"
            />
            <StatCard
              icon={STAT_ICONS.totalVideos}
              title="Total Videos"
              value={formatAdminCount(stats.totalVideos)}
              color="purple"
            />
            <StatCard
              icon={STAT_ICONS.liveRooms}
              title="Live Rooms"
              value={formatAdminCount(stats.liveRooms)}
              color="red"
            />
            <StatCard
              icon={STAT_ICONS.totalRevenue}
              title="Total Revenue"
              value={formatAdminRevenueMajor(stats.totalRevenueMinor)}
              color="yellow"
            />
            <StatCard
              icon={STAT_ICONS.pendingReports}
              title="Pending Reports"
              value={formatAdminCount(stats.pendingReports)}
              color="orange"
            />
          </div>
        ) : null}

        <div className="bg-transparent rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">{ADMIN_DASHBOARD_ACTIONS_TITLE}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {ADMIN_DASHBOARD_ACTIONS.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => goAdminPath(item.path)}
                className="px-4 py-3 bg-[#E6E9EE] text-white rounded-lg font-semibold hover:bg-[#E6E9EE]/90 transition text-center"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  color,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${STAT_COLORS[color]} rounded-lg p-6`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-white/80">{icon}</div>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-sm text-white/60">{title}</div>
    </div>
  );
}
