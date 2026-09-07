import type { SupabaseClient } from "@supabase/supabase-js";

/** Unidades de moeda por 1 EUR. Usado quando não há taxa em fx_rates. */
const FALLBACK_RATES: Record<string, number> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  SEK: 11.2,
  NOK: 11.5,
  DKK: 7.46,
  CHF: 0.95,
  PLN: 4.3,
};

export interface Conversion {
  totalEur: number | null;
  rateUsed: number | null;
}

export async function convertToEur(
  supabase: SupabaseClient,
  amount: number | null,
  currency: string,
  asOf?: string | null,
): Promise<Conversion> {
  if (amount === null) return { totalEur: null, rateUsed: null };

  const moeda = currency.toUpperCase();
  if (moeda === "EUR") return { totalEur: amount, rateUsed: 1 };

  const { data } = await supabase
    .from("fx_rates")
    .select("rate")
    .eq("currency", moeda)
    .lte("as_of", asOf ?? new Date().toISOString().slice(0, 10))
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle<{ rate: number }>();

  const rate = data?.rate ?? FALLBACK_RATES[moeda];
  if (!rate) return { totalEur: null, rateUsed: null };

  return {
    totalEur: Number((amount / rate).toFixed(2)),
    rateUsed: rate,
  };
}
