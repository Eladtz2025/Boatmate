import "server-only";
import { createClient } from "./supabase/server";

/**
 * Keep the standing-order horizon ahead of today.
 *
 * `generate_recurring_occurrences` materialises due dates up to
 * `current_date + 120 days`. It used to be called in exactly one place — when a
 * standing order was *created* — which meant the horizon was fixed at that
 * moment and never moved again. Four months later the marina order simply
 * stopped producing occurrences, while the recurring tab still showed it as
 * active: the pending list went quiet, and quiet reads as "nothing is due".
 *
 * That is the one failure in this app that silently produces wrong money over
 * time, and reconstructing four months of balances by hand is precisely what
 * Boatmate exists to prevent. So the horizon is topped up whenever anyone looks
 * at the finances screen, and whenever an occurrence is consumed or an order is
 * switched back on. The RPC is `ON CONFLICT DO NOTHING` and documents itself as
 * safe to call repeatedly, so the extra calls cost one cheap statement each.
 */
export async function topUpOccurrences(boatId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_recurring_occurrences", {
    p_boat_id: boatId,
  });

  // Deliberately swallowed, unlike the reads in lib/data.ts. Failing to extend
  // the horizon leaves the already-materialised occurrences intact — it shows
  // fewer future rows, it does not misreport anything. Taking the finances
  // screen down over it would be the worse trade.
  if (error) {
    console.error("[boatmate] could not top up recurring occurrences", error.message);
  }
}
