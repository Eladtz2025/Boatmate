"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { removePushSubscription, savePushSubscription } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/empty-state";

/**
 * Turning this device's notifications on.
 *
 * Web Push needs three things lined up, and each can be missing on its own, so
 * each gets its own honest sentence rather than one shrugging "unavailable":
 *
 * 1. a service worker registration — which this app only creates in production
 *    builds, so a dev server genuinely cannot subscribe;
 * 2. the browser's permission, which only a real tap may ask for;
 * 3. the server's VAPID keys and the `push_subscriptions` table.
 *
 * The subscription lives in the browser and its endpoint is stored per device,
 * so a partner with a phone and a laptop is two rows and gets told on both.
 */

type State =
  | "checking"
  | "unsupported"
  | "no-worker"
  | "denied"
  | "off"
  | "on";

/**
 * The base64url VAPID public key, in the byte form PushManager wants.
 *
 * Backed by an explicit `ArrayBuffer` because `applicationServerKey` will not
 * take a view over a `SharedArrayBuffer`, which is what a bare `Uint8Array`
 * widens to.
 */
function toKeyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(
    base64Url.length + ((4 - (base64Url.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** The two keys the push service gave us, base64url-encoded for storage. */
function readKeys(subscription: PushSubscription): { p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) return null;
  return { p256dh, auth };
}

export function NotificationsCard({
  boatId,
  vapidPublicKey,
}: {
  boatId: string;
  /** Empty when the server has no VAPID keys — the feature is then off. */
  vapidPublicKey: string;
}) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refreshState = useCallback(async () => {
    // Reading the browser's push state is inherently asynchronous, and asking
    // for the registration first is also what keeps every `setState` below out
    // of the effect's synchronous body.
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    const registration = supported
      ? await navigator.serviceWorker.getRegistration()
      : null;

    if (!supported) {
      setState("unsupported");
      return;
    }

    if (!registration) {
      setState("no-worker");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    const subscription = await registration.pushManager.getSubscription();
    setState(subscription ? "on" : "off");
  }, []);

  useEffect(() => {
    // This is the case the rule's own documentation carves out — reading state
    // from an external system, here the browser's PushManager. It cannot be
    // derived during render because every part of it is asynchronous, and it
    // cannot wait for a tap: a partner who already has notifications on must
    // see that on arrival, not only after pressing something.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshState();
  }, [refreshState]);

  function enable() {
    setError(null);

    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          setState("no-worker");
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }

        // An existing subscription is reused rather than replaced: the browser
        // returns the same endpoint anyway, and re-subscribing with a
        // different key would silently orphan the row already stored.
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: toKeyBytes(vapidPublicKey),
          }));

        const keys = readKeys(subscription);
        if (!keys) {
          setError("הדפדפן לא סיפק מפתחות הצפנה להתראות.");
          return;
        }

        const result = await savePushSubscription({
          boatId,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: navigator.userAgent.slice(0, 200),
        });

        if (!result.ok) {
          // The row did not save, so the browser subscription is a promise the
          // server cannot keep. Undo it rather than leave the device looking
          // subscribed to nothing.
          await subscription.unsubscribe().catch(() => undefined);
          setError(result.error);
          setState("off");
          return;
        }

        setState("on");
      } catch (cause) {
        console.error("[push] subscribe", cause);
        setError("לא הצלחנו להפעיל התראות בדפדפן הזה.");
      }
    });
  }

  function disable() {
    setError(null);

    startTransition(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setState("off");
        return;
      }

      const result = await removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe().catch(() => undefined);

      if (!result.ok) setError(result.error);
      setState("off");
    });
  }

  if (!vapidPublicKey) {
    return (
      <>
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <BellOff className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          לא מוגדר בשרת
        </p>
        <p className="mt-2 text-xs text-ink-subtle">
          התראות אוטומטיות דורשות מפתחות VAPID במשתני הסביבה. עד אז, השינויים
          נשמרים ונראים באפליקציה כרגיל.
        </p>
      </>
    );
  }

  return (
    <>
      {state === "on" ? (
        <p className="flex items-center gap-2 text-sm text-teal-400">
          <BellRing className="size-4 shrink-0" aria-hidden />
          מופעל במכשיר הזה
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Bell className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          {state === "checking" && "בודק…"}
          {state === "off" && "כבוי במכשיר הזה"}
          {state === "denied" && "הדפדפן חסם התראות"}
          {state === "unsupported" && "הדפדפן הזה לא תומך בהתראות"}
          {state === "no-worker" && "זמין רק באפליקציה המותקנת"}
        </p>
      )}

      <p className="mt-2 text-xs text-ink-subtle">
        {state === "denied"
          ? "צריך לאפשר התראות ל-Boatmate בהגדרות הדפדפן, ואז לחזור לכאן."
          : state === "no-worker"
            ? "פותחים את Boatmate מהמסך הראשי (או באתר עצמו, לא בשרת פיתוח) ומפעילים שוב."
            : "כשמישהו רושם, משנה או מבטל הגעה — שאר השותפים מקבלים התראה."}
      </p>

      {(state === "off" || state === "on") && (
        <div className="mt-3">
          {state === "on" ? (
            <Button variant="secondary" block loading={pending} onClick={disable}>
              כיבוי התראות במכשיר הזה
            </Button>
          ) : (
            <Button
              block
              loading={pending}
              onClick={enable}
              icon={<Bell className="size-4" aria-hidden />}
            >
              הפעלת התראות
            </Button>
          )}
        </div>
      )}

      {error && <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>}
    </>
  );
}
