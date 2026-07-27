import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { PageHeader } from "@/components/nav/app-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BoatSettingsForm } from "@/components/settings/boat-settings-form";
import { CrewManager } from "@/components/settings/crew-manager";
import { getBoat, getCurrentUser, getMembers } from "@/lib/data";

export const metadata = { title: "הגדרות — Boatmate" };

export default async function SettingsPage() {
  const boat = await getBoat();
  if (!boat) return null;

  const [members, user] = await Promise.all([getMembers(boat.id), getCurrentUser()]);

  return (
    <main className="flex-1 pb-24">
      <PageHeader
        title="הגדרות"
        action={
          <Link
            href="/"
            aria-label="חזרה"
            className="rounded-full p-2 text-ink-muted transition hover:bg-hull-800 hover:text-ink"
          >
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        }
      />

      <div className="space-y-4 px-4">
        <Card>
          <CardTitle>פרטי הסירה</CardTitle>
          <BoatSettingsForm boat={boat} />
        </Card>

        <Card>
          <CardTitle>שותפים</CardTitle>
          <CrewManager
            boatId={boat.id}
            members={members}
            currentUserId={user?.id ?? ""}
          />
        </Card>

        <Card>
          <CardTitle>חשבון</CardTitle>
          <p className="numeric mb-3 text-xs text-ink-muted">{user?.email}</p>
          <form action={signOut}>
            <Button
              type="submit"
              variant="danger"
              block
              icon={<LogOut className="size-4" aria-hidden />}
            >
              התנתקות
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
