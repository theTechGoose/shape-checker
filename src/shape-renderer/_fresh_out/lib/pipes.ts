import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export function useAsync<T>(promise: Promise<T>): T | undefined {
  const result = useSignal<T | undefined>(undefined);
  useEffect(() => {
    promise.then((v) => { result.value = v; });
  }, [promise]);
  return result.value;
}

export function uppercase(value: unknown): string {
  return String(value).toUpperCase();
}

export function lowercase(value: unknown): string {
  return String(value).toLowerCase();
}

export function capitalize(value: unknown): string {
  const s = String(value);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function trim(value: unknown): string {
  return String(value).trim();
}

export function currency(value: unknown, currencyCode = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).format(Number(value));
}

export function numberPipe(value: unknown, locale = "en-US"): string {
  return new Intl.NumberFormat(locale).format(Number(value));
}

export function datePipe(value: unknown, format = "medium", locale = "en-US"): string {
  const d = value instanceof Date ? value : new Date(String(value));
  const options: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: "numeric", day: "numeric", year: "2-digit" },
    medium: { month: "short", day: "numeric", year: "numeric" },
    long: { month: "long", day: "numeric", year: "numeric" },
    full: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
  };
  return new Intl.DateTimeFormat(locale, options[format] ?? options.medium).format(d);
}

export function percent(value: unknown, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "percent" }).format(Number(value));
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function truncate(value: unknown, limit = 50, trail = "..."): string {
  const s = String(value);
  return s.length > Number(limit) ? s.slice(0, Number(limit)) + trail : s;
}

export function slice(value: unknown, start: number, end?: number): string {
  return String(value).slice(start, end);
}
