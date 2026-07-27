import { redirect } from "next/navigation";
import { BottomNav } from "@/components/nav/bottom-nav";
import { getBoat, getCurrentUser } from "@/lib/data";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // A signed-in user with no boat yet has nothing to look at.
  const boat = await getBoat();
  if (!boat) redirect("/onboarding");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      {children}
      <BottomNav />
    </div>
  );
}
