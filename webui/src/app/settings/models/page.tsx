import { ProviderConfigManager } from "@/components/provider-config-manager";
import { TopNav } from "@/components/top-nav";

export default function ModelSettingsPage() {
  return (
    <main className="theme-root min-h-screen">
      <TopNav />
      <div className="px-5 py-8 sm:px-8">
        <ProviderConfigManager />
      </div>
    </main>
  );
}
