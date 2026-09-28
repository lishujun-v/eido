import { ChatInterface } from "@/components/chat-interface";
import { TopNav } from "@/components/top-nav";

export default function DemoChatPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <TopNav />
      <ChatInterface />
    </main>
  );
}
