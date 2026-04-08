import { useSignal } from "@preact/signals";

export default function TreeNode(props) {
  const expanded = useSignal(props?.expanded ?? true);
  const name = useSignal(props?.name ?? "");
  const node = useSignal(props?.node ?? {});
  const depth = useSignal(props?.depth ?? 0);
  function toggle() {
    expanded.value = !expanded.value;
  }

  return (
    <><div class="ml-4 border-l border-gray-700 pl-3 py-1">
  <div class="flex items-center gap-2 group">
    <button
      onClick={() => toggle()}
      class="text-gray-400 hover:text-white w-4 text-center font-mono text-xs"
    >
      {expanded ? '▼' : '▶'}
    </button>
    <span class="font-mono text-sm text-cyan-400">{name}</span>
  </div>
</div>
</>
  );
}
