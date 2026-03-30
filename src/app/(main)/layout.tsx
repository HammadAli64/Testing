import { AssistantChat } from "@/components/assistant/AssistantChat";
import { AppShell } from "@/components/layout/AppShell";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {children}
      <AssistantChat />
    </AppShell>
  );
}
