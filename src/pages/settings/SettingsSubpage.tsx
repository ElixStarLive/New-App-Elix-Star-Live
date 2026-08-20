import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageScaffold } from "@/components/PageScaffold";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";

export function SettingsSubpage({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <PageScaffold title={title} onClose={() => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true })}>
      {children}
    </PageScaffold>
  );
}
