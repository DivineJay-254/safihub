import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Database,
  Search,
  Layers,
  FileText,
  RefreshCw,
  Download,
  ChevronRight,
  X,
} from "lucide-react";
import { getCollections, getCollectionDocs } from "@/lib/firestore.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SafiHub · Firestore Viewer" },
      { name: "description", content: "Browse Firestore collections and documents." },
    ],
  }),
  component: Index,
});

function formatValue(v: any): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return "{…}";
  return String(v);
}

function Index() {
  const getCols = useServerFn(getCollections);
  const getDocs = useServerFn(getCollectionDocs);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openDoc, setOpenDoc] = useState<any | null>(null);

  const collectionsQ = useQuery({
    queryKey: ["fs", "collections"],
    queryFn: () => getCols(),
  });

  const docsQ = useQuery({
    queryKey: ["fs", "docs", selected],
    queryFn: () => getDocs({ data: { collection: selected! } }),
    enabled: !!selected,
  });

  const collections = collectionsQ.data?.collections ?? [];
  const docs = docsQ.data?.docs ?? [];

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return docs;
    const q = search.toLowerCase();
    return docs.filter((d) => {
      if (d.id.toLowerCase().includes(q)) return true;
      return JSON.stringify(d.data).toLowerCase().includes(q);
    });
  }, [docs, search]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const d of filteredDocs.slice(0, 50)) {
      Object.keys(d.data).forEach((k) => keys.add(k));
    }
    return Array.from(keys).slice(0, 8);
  }, [filteredDocs]);

  const totalDocs = docs.length;

  return (
    <div className="flex flex-col h-screen bg-[#F7F8FA] font-sans overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center px-4 h-12 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-orange-500 flex items-center justify-center text-white shrink-0">
            <Database size={16} />
          </div>
          <span className="font-semibold text-gray-900 text-sm truncate">safihub-app</span>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-gray-600 text-sm truncate">Firestore</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
            <Layers size={13} className="text-gray-500" />
            <span>{collections.length} collections</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
            <FileText size={13} className="text-gray-500" />
            <span>{totalDocs} docs</span>
          </div>
          <button
            onClick={() => {
              collectionsQ.refetch();
              if (selected) docsQ.refetch();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <RefreshCw size={13} className={collectionsQ.isFetching || docsQ.isFetching ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              if (!selected || !docs.length) return;
              const blob = new Blob([JSON.stringify(docs, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${selected}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50"
            disabled={!selected || !docs.length}
          >
            <Download size={13} />
            <span>Download</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-gray-500 border-b border-gray-100">
            COLLECTIONS
          </div>
          <div className="flex-1 overflow-auto">
            {collectionsQ.isLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 text-xs">
                <RefreshCw size={18} className="animate-spin text-orange-400" />
                <span>Loading…</span>
              </div>
            )}
            {collectionsQ.error && (
              <div className="p-3 text-xs text-red-600">
                {(collectionsQ.error as Error).message}
              </div>
            )}
            {collections.map((name) => (
              <button
                key={name}
                onClick={() => {
                  setSelected(name);
                  setSearch("");
                }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 border-l-2 ${
                  selected === name
                    ? "bg-orange-50 border-orange-500 text-orange-700 font-medium"
                    : "border-transparent text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Layers size={13} className="opacity-60" />
                <span className="truncate">{name}</span>
              </button>
            ))}
            {!collectionsQ.isLoading && !collections.length && !collectionsQ.error && (
              <div className="p-4 text-xs text-gray-400">No collections.</div>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
            <h2 className="font-semibold text-gray-900 text-sm truncate">
              {selected ?? "Select a collection"}
            </h2>
            {selected && (
              <span className="text-xs text-gray-500">
                {filteredDocs.length} of {totalDocs}
              </span>
            )}
            <div className="ml-auto relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search all fields…"
                className="text-xs border border-gray-200 rounded-md pl-8 pr-3 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder-gray-400 bg-gray-50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {!selected && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <Layers size={32} className="text-gray-300" />
                <p className="text-sm">Select a collection from the sidebar</p>
              </div>
            )}

            {selected && docsQ.isLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <RefreshCw size={22} className="animate-spin text-orange-400" />
                <p className="text-sm">Loading documents…</p>
              </div>
            )}

            {selected && docsQ.error && (
              <div className="p-4 text-sm text-red-600 whitespace-pre-wrap break-all">
                {(docsQ.error as Error).message}
              </div>
            )}

            {selected && !docsQ.isLoading && !docsQ.error && filteredDocs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <FileText size={28} className="text-gray-300" />
                <p className="text-sm">No documents</p>
              </div>
            )}

            {selected && filteredDocs.length > 0 && (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left font-medium px-4 py-2 border-b border-gray-200 w-48">
                      Document ID
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c}
                        className="text-left font-medium px-4 py-2 border-b border-gray-200"
                      >
                        {c}
                      </th>
                    ))}
                    <th className="w-10 border-b border-gray-200"></th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {filteredDocs.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setOpenDoc(d)}
                      className="hover:bg-orange-50/50 cursor-pointer border-b border-gray-100"
                    >
                      <td className="px-4 py-2 font-mono text-[11px] text-gray-700 truncate max-w-[12rem]">
                        {d.id}
                      </td>
                      {columns.map((c) => (
                        <td key={c} className="px-4 py-2 text-gray-700 truncate max-w-[14rem]">
                          {formatValue(d.data[c])}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-gray-400">
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {/* Detail panel */}
        {openDoc && (
          <aside className="w-[420px] bg-white border-l border-gray-200 flex flex-col shrink-0">
            <div className="flex items-center px-4 py-2.5 border-b border-gray-200">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">
                  {selected}
                </div>
                <div className="font-mono text-xs text-gray-900 truncate">{openDoc.id}</div>
              </div>
              <button
                onClick={() => setOpenDoc(null)}
                className="ml-auto p-1 text-gray-400 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="text-[11px] text-gray-500 mb-1">Path</div>
              <div className="font-mono text-xs text-gray-700 mb-3 break-all">{openDoc.path}</div>
              {openDoc.updateTime && (
                <>
                  <div className="text-[11px] text-gray-500 mb-1">Updated</div>
                  <div className="text-xs text-gray-700 mb-3">{openDoc.updateTime}</div>
                </>
              )}
              <div className="text-[11px] text-gray-500 mb-1">Data</div>
              <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded p-3 overflow-auto text-gray-800">
{JSON.stringify(openDoc.data, null, 2)}
              </pre>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
