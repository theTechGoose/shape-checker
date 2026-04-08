import { useSignal, useComputed, type Signal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

type SNode = string | SNode[] | { [k: string]: SNode };

function isObj(v: unknown): v is Record<string, SNode> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function setAt(root: Record<string, SNode>, path: string[], value: SNode): Record<string, SNode> {
  const copy = { ...root };
  if (path.length === 1) { copy[path[0]] = value; return copy; }
  const [head, ...rest] = path;
  if (isObj(copy[head])) copy[head] = setAt({ ...copy[head] as Record<string, SNode> }, rest, value);
  return copy;
}

function deleteAt(root: Record<string, SNode>, path: string[]): Record<string, SNode> {
  const copy = { ...root };
  if (path.length === 1) { delete copy[path[0]]; return copy; }
  const [head, ...rest] = path;
  if (isObj(copy[head])) copy[head] = deleteAt({ ...copy[head] as Record<string, SNode> }, rest);
  return copy;
}

function addAt(root: Record<string, SNode>, path: string[], key: string, value: SNode): Record<string, SNode> {
  const copy = { ...root };
  if (path.length === 0) { copy[key] = value; return copy; }
  const [head, ...rest] = path;
  if (isObj(copy[head])) copy[head] = addAt({ ...copy[head] as Record<string, SNode> }, rest, key, value);
  return copy;
}

function renameAt(root: Record<string, SNode>, path: string[], newKey: string): Record<string, SNode> {
  if (path.length === 0) return root;
  const copy = { ...root };
  if (path.length === 1) {
    const old = path[0];
    if (old === newKey) return copy;
    const result: Record<string, SNode> = {};
    for (const k of Object.keys(copy)) {
      result[k === old ? newKey : k] = copy[k];
    }
    return result;
  }
  const [head, ...rest] = path;
  if (isObj(copy[head])) copy[head] = renameAt({ ...copy[head] as Record<string, SNode> }, rest, newKey);
  return copy;
}

// ── inline edit ──────────────────────────────────────────

function InlineEdit({ value, onDone, className }: {
  value: string;
  onDone: (v: string | null) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      class={`bg-transparent border-b border-cyan-500/50 outline-none px-0 py-0 text-inherit font-inherit ${className || ""}`}
      style={{ minWidth: "4ch", width: `${Math.max(value.length, 4) + 2}ch` }}
      value={value}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter") onDone((e.target as HTMLInputElement).value);
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={(e: FocusEvent) => onDone((e.target as HTMLInputElement).value)}
    />
  );
}

// ── context menu ─────────────────────────────────────────

function ContextMenu({ x, y, items, onClose }: {
  x: number;
  y: number;
  items: { label: string; action: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div
      ref={ref}
      class="fixed z-50 bg-gray-800 border border-gray-700 rounded-md shadow-xl py-1 min-w-[160px]"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          class={`block w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-gray-700 ${item.danger ? "text-red-400" : "text-gray-300"}`}
          onClick={() => { item.action(); onClose(); }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ── tree node ────────────────────────────────────────────

function TreeNode({ name, value, path, depth, selected, onSelect, mutate }: {
  name: string;
  value: SNode;
  path: string[];
  depth: number;
  selected: Signal<string | null>;
  onSelect: (path: string | null) => void;
  mutate: (op: string, path: string[], a1?: string, a2?: SNode) => void;
}) {
  const expanded = useSignal(depth < 2);
  const editing = useSignal<"name" | "desc" | "add-file" | "add-folder" | null>(null);
  const menu = useSignal<{ x: number; y: number } | null>(null);

  const isMeta = name.startsWith("$");
  const isDescriptor = name.startsWith("<") && name.endsWith(">");
  const isOptional = name.endsWith("?");
  const isFolder = isObj(value);
  const isArray = Array.isArray(value);
  const isFile = typeof value === "string" && !isMeta;
  const displayName = isOptional ? name.slice(0, -1) : name;
  const desc = isFolder ? ((value as Record<string, SNode>)["$desc"] as string || "") : (typeof value === "string" ? value : "");
  const extensions = isFolder ? (value as Record<string, SNode>)["$extensions"] as unknown as string[] | undefined : undefined;
  const ignore = isFolder ? (value as Record<string, SNode>)["$ignore"] as unknown as string | undefined : undefined;
  const isSelected = selected.value === path.join("/");

  const children = isFolder
    ? Object.entries(value as Record<string, SNode>).filter(([k]) => k !== "$desc" && k !== "$ignore" && k !== "$extensions")
    : [];

  const nameColor = isMeta ? "text-purple-400"
    : (isFolder || isArray) ? (isDescriptor ? "text-amber-400" : "text-blue-400")
    : isDescriptor ? "text-amber-300" : "text-emerald-400";

  function contextMenu(e: MouseEvent) {
    e.preventDefault();
    onSelect(path.join("/"));
    const items: { label: string; action: () => void; danger?: boolean }[] = [];
    if (!isMeta) items.push({ label: "Rename", action: () => { editing.value = "name"; } });
    items.push({ label: "Edit description", action: () => { editing.value = "desc"; } });
    if (isFolder) {
      items.push({ label: "Add file", action: () => { editing.value = "add-file"; expanded.value = true; } });
      items.push({ label: "Add folder", action: () => { editing.value = "add-folder"; expanded.value = true; } });
      if (!extensions) {
        items.push({ label: "Add $extensions", action: () => {
          const v = prompt("Extensions (comma-separated, e.g. .json,.ts):");
          if (v) mutate("set", [...path, "$extensions"], v.split(",").map(s => s.trim()) as unknown as SNode);
        }});
      }
    }
    if (!isMeta) items.push({ label: "Delete", action: () => { mutate("delete", path); }, danger: true });
    menu.value = { x: e.clientX, y: e.clientY };
    // store items on window temporarily for the menu
    (window as any).__menuItems = items;
  }

  return (
    <div>
      <div
        class={`flex items-center gap-1 rounded px-2 py-0.5 cursor-default select-none transition-colors ${
          isSelected ? "bg-cyan-900/30" : "hover:bg-gray-800/60"
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect(isSelected ? null : path.join("/"))}
        onDblClick={() => { if (!isMeta) editing.value = "name"; }}
        onContextMenu={contextMenu}
      >
        {/* expand/collapse or leaf indicator */}
        {(isFolder || isArray) ? (
          <button
            class="text-gray-500 hover:text-gray-300 w-4 text-center text-[10px] flex-shrink-0"
            onClick={(e: MouseEvent) => { e.stopPropagation(); expanded.value = !expanded.value; }}
          >
            {expanded.value ? "▾" : "▸"}
          </button>
        ) : (
          <span class="w-4 text-center text-gray-600 text-[10px] flex-shrink-0">•</span>
        )}

        {/* name */}
        {editing.value === "name" ? (
          <InlineEdit
            value={name}
            className={nameColor}
            onDone={(v) => {
              editing.value = null;
              if (v && v !== name) mutate("rename", path, v);
            }}
          />
        ) : (
          <span class={`${nameColor} text-[13px]`}>
            {displayName}{(isFolder || isArray) && !isMeta ? "/" : ""}
          </span>
        )}

        {isOptional && <span class="text-gray-600 text-[10px]">?</span>}

        {/* extensions as pills */}
        {extensions && extensions.map((ext, i) => (
          <span
            key={i}
            class="px-1 rounded text-[10px] bg-purple-500/20 text-purple-300 hover:bg-red-500/20 hover:text-red-300 cursor-pointer"
            title="Click to remove"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              const next = [...extensions];
              next.splice(i, 1);
              mutate("set", [...path, "$extensions"], next.length ? next as unknown as SNode : undefined!);
              if (!next.length) mutate("delete", [...path, "$extensions"]);
              else mutate("set", [...path, "$extensions"], next as unknown as SNode);
            }}
          >{ext}</span>
        ))}

        {ignore && <span class="px-1 rounded text-[10px] bg-gray-700 text-gray-400">ignore: {ignore}</span>}

        {/* description */}
        {editing.value === "desc" ? (
          <InlineEdit
            value={desc}
            className="text-gray-500 text-[12px] flex-1"
            onDone={(v) => {
              editing.value = null;
              if (v !== null) {
                if (isFile) mutate("set", path, v);
                else if (isFolder) mutate("set", [...path, "$desc"], v as unknown as SNode);
              }
            }}
          />
        ) : desc ? (
          <span class="text-gray-500 text-[12px] truncate" onDblClick={(e: MouseEvent) => { e.stopPropagation(); editing.value = "desc"; }}>
            {desc}
          </span>
        ) : null}
      </div>

      {/* add input */}
      {(editing.value === "add-file" || editing.value === "add-folder") && (
        <div class="flex items-center gap-1 px-2 py-0.5" style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}>
          <span class={`w-4 text-center text-[10px] flex-shrink-0 ${editing.value === "add-folder" ? "text-blue-400" : "text-emerald-400"}`}>
            {editing.value === "add-folder" ? "▸" : "•"}
          </span>
          <InlineEdit
            value=""
            className={editing.value === "add-folder" ? "text-blue-400 text-[13px]" : "text-emerald-400 text-[13px]"}
            onDone={(v) => {
              editing.value = null;
              if (v) mutate("add", path, v, editing.value === "add-folder" ? {} : "description" as unknown as SNode);
            }}
          />
        </div>
      )}

      {/* context menu */}
      {menu.value && (
        <ContextMenu
          x={menu.value.x}
          y={menu.value.y}
          items={(window as any).__menuItems || []}
          onClose={() => { menu.value = null; }}
        />
      )}

      {/* children */}
      {expanded.value && isFolder && children.map(([k, v]) => (
        <TreeNode
          key={k}
          name={k}
          value={v}
          path={[...path, k]}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          mutate={mutate}
        />
      ))}
    </div>
  );
}

// ── meta row ($forbiddenDirNames, etc.) ──────────────────

function MetaRow({ name, value, mutate }: {
  name: string;
  value: unknown;
  mutate: (op: string, path: string[], a1?: string, a2?: SNode) => void;
}) {
  const adding = useSignal(false);

  if (!Array.isArray(value)) {
    return (
      <div class="flex items-center gap-2 px-2 py-1 text-[12px] font-mono">
        <span class="text-purple-400">{name}</span>
        <span class="text-gray-400">{JSON.stringify(value)}</span>
      </div>
    );
  }

  return (
    <div class="flex items-center gap-1.5 px-2 py-1 text-[12px] font-mono flex-wrap">
      <span class="text-purple-400 mr-1">{name}</span>
      {value.map((item: string, i: number) => (
        <span
          key={i}
          class="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-red-900/40 hover:text-red-300 cursor-pointer transition-colors"
          title="Click to remove"
          onClick={() => {
            const next = [...value];
            next.splice(i, 1);
            mutate("set", [name], next as unknown as SNode);
          }}
        >{item}</span>
      ))}
      {adding.value ? (
        <InlineEdit
          value=""
          className="text-gray-300 text-[12px]"
          onDone={(v) => {
            adding.value = false;
            if (v && !value.includes(v)) mutate("set", [name], [...value, v] as unknown as SNode);
          }}
        />
      ) : (
        <button
          class="px-1.5 py-0.5 rounded bg-gray-800/50 text-gray-500 hover:text-cyan-400 hover:bg-gray-800 transition-colors text-[11px]"
          onClick={() => { adding.value = true; }}
        >+</button>
      )}
    </div>
  );
}

// ── main ─────────────────────────────────────────────────

export default function ShapeViewer() {
  const data = useSignal<Record<string, SNode> | null>(null);
  const saving = useSignal(false);
  const saved = useSignal(false);
  const error = useSignal("");
  const dirty = useSignal(false);
  const selected = useSignal<string | null>(null);

  const topEntries = useComputed(() => {
    if (!data.value) return [];
    return Object.entries(data.value).filter(([k]) => !k.startsWith("$"));
  });

  const metaEntries = useComputed(() => {
    if (!data.value) return [];
    return Object.entries(data.value).filter(([k]) => k.startsWith("$"));
  });

  function mutate(op: string, path: string[], a1?: string, a2?: SNode) {
    if (!data.value) return;
    let next = data.value;
    switch (op) {
      case "set": next = setAt(next, path, a1 as unknown as SNode); break;
      case "delete": next = deleteAt(next, path); break;
      case "add": next = addAt(next, path, a1!, a2!); break;
      case "rename": next = renameAt(next, path, a1!); break;
    }
    data.value = next;
    dirty.value = true;
    saved.value = false;
  }

  // expose for programmatic use
  useEffect(() => {
    (window as any).__shapeMutate = mutate;
    fetch("/api/shape").then(r => r.json()).then(d => { data.value = d; }).catch(e => { error.value = String(e); });
  }, []);

  async function save() {
    if (!data.value) return;
    saving.value = true;
    error.value = "";
    try {
      const resp = await fetch("/api/shape", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(JSON.parse(JSON.stringify(data.value))),
      });
      if (!resp.ok) throw new Error(await resp.text());
      dirty.value = false;
      saved.value = true;
    } catch (e) {
      error.value = `Save failed: ${e}`;
    } finally {
      saving.value = false;
    }
  }

  if (error.value) return <p class="text-red-400 p-8 font-mono text-sm">{error.value}</p>;
  if (!data.value) return <p class="text-gray-500 p-8 font-mono text-sm">Loading...</p>;

  return (
    <div class="flex flex-col h-full">
      {/* header */}
      <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <span class="text-sm font-semibold text-gray-300">canonical-paths.json</span>
        <div class="flex-1" />
        {dirty.value && <span class="text-amber-400 text-xs">unsaved</span>}
        <button
          class={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            dirty.value
              ? "bg-cyan-600 hover:bg-cyan-500 text-white"
              : saved.value
                ? "bg-gray-800 text-emerald-400"
                : "bg-gray-800 text-gray-500"
          }`}
          onClick={save}
          disabled={!dirty.value || saving.value}
        >
          {saving.value ? "Saving..." : saved.value ? "Saved" : "Save"}
        </button>
      </div>

      {/* meta properties */}
      <div class="border-b border-gray-800 py-1">
        {metaEntries.value.map(([k, v]) => (
          <MetaRow key={k} name={k} value={v} mutate={mutate} />
        ))}
      </div>

      {/* tree */}
      <div class="flex-1 overflow-auto py-2 font-mono">
        {topEntries.value.map(([k, v]) => (
          <TreeNode
            key={k}
            name={k}
            value={v}
            path={[k]}
            depth={0}
            selected={selected}
            onSelect={(p) => { selected.value = p; }}
            mutate={mutate}
          />
        ))}
      </div>

      {/* footer hint */}
      <div class="px-4 py-2 border-t border-gray-800 text-[11px] text-gray-600">
        double-click to rename · right-click for actions
      </div>
    </div>
  );
}
