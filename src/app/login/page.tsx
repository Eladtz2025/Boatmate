import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata = { title: "כניסה — Boatmate" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="relative flex min-h-dvh flex-col">
      <div className="absolute inset-0">
        <Image
          src="/images/boat-hero-portrait.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-hull-950 via-hull-950/75 to-hull-950/10" />
      </div>

      <div className="relative mt-auto w-full px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Boatmate</h1>
            <p className="mt-2 text-sm text-ink-muted">
              הסירה המשותפת שלכם — הוצאות, מסמכים ולוח זמנים במקום אחד.
            </p>
          </div>

          <LoginForm initialError={error ?? null} />
        </div>
      </div>
    </main>
  );
}
