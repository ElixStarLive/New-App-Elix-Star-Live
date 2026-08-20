import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign, Flag, Users, Video, Zap } from "lucide-react";
import { apiFetchAdminDashboard, type AdminDashboard } from "@/features/admin/adminApi";
import { PageScaffold } from "@/components/PageScaffold";
import { SETTINGS_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiFetchAdminDashboard().then((res) => {
      if (res.error || !res.data) {
        setError(res.error || "Failed to load dashboard");
        showToast(res.error || "Failed to load dashboard");
        return;
      }
      setStats(res.data);
    });
  }, []);

  return (
    <PageScaffold title="Admin" onClose={() => navigate(SETTINGS_HOME, { replace: true })}>
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      {stats ? (
        <div className="p-4 grid grid-cols-2 gap-3">
          <Stat icon={<Users size={18} />} label="DAU" value={stats.dailyActiveUsers} />
          <Stat icon={<Users size={18} />} label="Users" value={stats.totalUsers} />
          <Stat icon={<Video size={18} />} label="Videos" value={stats.totalVideos} />
          <Stat icon={<Zap size={18} />} label="Live rooms" value={stats.liveRooms} />
          <Stat icon={<DollarSign size={18} />} label="Revenue" value={`£${(stats.totalRevenueMinor / 100).toFixed(2)}`} />
          <Stat icon={<Flag size={18} />} label="Reports" value={stats.pendingReports} />
        </div>
      ) : null}
      <div className="px-3 pb-6 space-y-1">
        {[
          ["/admin/users", "Users"],
          ["/admin/reports", "Reports"],
          ["/admin/economy", "Economy"],
          ["/admin/monetisation", "Monetisation"],
          ["/admin/purchases", "Purchases"],
          ["/admin/withdrawals", "Withdrawals"],
          ["/admin/rising-stars", "Rising Stars"],
          ["/admin/progression", "Progression"],
        ].map(([path, label]) => (
          <button key={path} type="button" className="w-full text-left py-3 border-b border-white/10" onClick={() => navigate(path)}>
            {label}
          </button>
        ))}
      </div>
    </PageScaffold>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-2 text-white/60 text-[11px]">{icon}{label}</div>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
