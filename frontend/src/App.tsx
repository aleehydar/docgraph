import { useCallback, useEffect, useState } from "react";
import { fetchHealth } from "./lib/api";
import Sidebar from "./components/Sidebar";
import IngestView from "./components/IngestView";
import QueryView from "./components/QueryView";
import type { HealthResponse, QuerySettings, View } from "./types";

const DEFAULT_SETTINGS: QuerySettings = {
  topK: 5,
  useGraph: true,
  useVector: true,
};

export default function App() {
  const [view, setView] = useState<View>("ingest");
  const [settings, setSettings] = useState<QuerySettings>(DEFAULT_SETTINGS);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const h = await fetchHealth();
      setHealth(h);
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const interval = setInterval(refreshHealth, 30_000);
    return () => clearInterval(interval);
  }, [refreshHealth]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        view={view}
        onViewChange={setView}
        settings={settings}
        onSettingsChange={setSettings}
        health={health}
        healthLoading={healthLoading}
        onRefreshHealth={refreshHealth}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          {view === "ingest" ? (
            <IngestView onNavigateQuery={() => setView("query")} />
          ) : (
            <QueryView settings={settings} />
          )}
        </div>
      </main>
    </div>
  );
}
