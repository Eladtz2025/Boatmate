import { redirect } from "next/navigation";
import { BottomNav } from "@/components/nav/bottom-nav";
import { getBoat, getCurrentUser } from "@/lib/data";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fired together, not in sequence: these used to be two awaits back to back,
  // so every tab tap paid both round trips end to end before anything rendered.
  const [user, boat] = await Promise.all([getCurrentUser(), getBoat()]);

  if (!user) redirect("/login");
  // A signed-in user with no boat yet has nothing to look at.
  if (!boat) redirect("/onboarding");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      {children}
      <BottomNav />
    </div>
  );
}
