import { NewAgentForm } from "@/components/new-agent-form";
import { TopNav } from "@/components/top-nav";

export default function NewAgentPage() {
  return (
    <main className="theme-root min-h-screen">
      <TopNav />
      <NewAgentForm />
    </main>
  );
}
