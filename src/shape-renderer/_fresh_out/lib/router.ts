import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { ComponentChildren } from "preact";

export function parseSlotUrl(path: string): { basePath: string; slots: Record<string, string> } {
  const slots: Record<string, string> = {};
  const basePath = path.replace(/\/\((\w+):([^)]+)\)/g, (_m, name, value) => {
    slots[name] = value;
    return "";
  });
  return { basePath: basePath || "/", slots };
}

export function buildSlotUrl(
  basePath: string,
  currentSlots: Record<string, string>,
  updates: Record<string, string>,
): string {
  const merged = { ...currentSlots, ...updates };
  const parts = Object.entries(merged).map(([n, v]) => `(${n}:${v})`).join("/");
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  return `${base}/${parts}`;
}

export function useSlotRouter(registry: Record<string, Record<string, () => ComponentChildren>>) {
  const url = useSignal(typeof globalThis.location !== "undefined" ? globalThis.location.pathname : "/");

  useEffect(() => {
    const onPop = () => { url.value = globalThis.location.pathname; };
    globalThis.addEventListener("popstate", onPop);

    function onClick(e: MouseEvent) {
      const link = (e.target as HTMLElement).closest("a");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || !href.includes("(")) return;
      e.preventDefault();
      globalThis.history.pushState(null, "", href);
      url.value = href;
    }
    document.addEventListener("click", onClick);

    return () => {
      globalThis.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick);
    };
  }, []);

  function resolve(slotName: string): ComponentChildren {
    const parsed = parseSlotUrl(url.value);
    const slotValue = parsed.slots[slotName];
    const slotRegistry = registry[slotName];
    if (!slotValue || !slotRegistry || !slotRegistry[slotValue]) return null;
    return slotRegistry[slotValue]();
  }

  function navigate(slotName: string, value: string) {
    const current = parseSlotUrl(url.value);
    const newUrl = buildSlotUrl(current.basePath, current.slots, { [slotName]: value });
    globalThis.history.pushState(null, "", newUrl);
    url.value = newUrl;
  }

  const parsed = parseSlotUrl(url.value);
  return { navigate, resolve, slots: parsed.slots, basePath: parsed.basePath };
}
