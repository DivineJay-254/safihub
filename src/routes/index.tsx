import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Database,
  Search,
  Layers,
  FileText,
  RefreshCw,
  Download,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
  FileSpreadsheet,
  FileJson,
  Calendar,
} from "lucide-react";
import { getCollections, getCollectionDocs } from "@/lib/firestore.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SafiHub · Firestore Viewer" },
      { name: "description", content: "Browse, sort and export Firestore data for payroll & timesheets." },
    ],
  }),
  component: Index,
});

function formatValue(v: any): string {
  if (v == null) return "—";
  if (typeof v === "string") {
    // ISO date → short
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString();
    }
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return "{…}";
  return String(v);
}

function flattenDoc(d: any): Record<string, any> {
  const out: Record<string, any> = { _id: d.id, _createTime: d.createTime, _updateTime: d.updateTime };
  for (const [k, v] of Object.entries(d.data ?? {})) {
    if (v == null) out[k] = "";
    else if (typeof v === "object") out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const keys = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set<string>()));
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// detect probable date fields by scanning data
function detectDateFields(docs: any[]): string[] {
  const fields = new Set<string>();
  for (const d of docs.slice(0, 30)) {
    for (const [k, v] of Object.entries(d.data ?? {})) {
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) fields.add(k);
    }
  }
  return Array.from(fields);
}

function getDateValue(doc: any, field: string): Date | null {
  let raw: any;
  if (field === "_createTime") raw = doc.createTime;
  else if (field === "_updateTime") raw = doc.updateTime;
  else raw = doc.data?.[field];
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function Index() {
  const getCols = useServerFn(getCollections);
  const getDocs = useServerFn(getCollectionDocs);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openDoc, setOpenDoc] = useState<any | null>(null);
  const [sortField, setSortField] = useState<string>("_createTime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [exportOpen, setExportOpen] = useState(false);

  const collectionsQ = useQuery({ queryKey: ["fs", "collections"], queryFn: () => getCols() });
  const docsQ = useQuery({
    queryKey: ["fs", "docs", selected],
    queryFn: () => getDocs({ data: { collection: selected! } }),
    enabled: !!selected,
  });

  const collections = collectionsQ.data?.collections ?? [];
  const docs = docsQ.data?.docs ?? [];

  const dateFields = useMemo(() => ["_createTime", "_updateTime", ...detectDateFields(docs)], [docs]);

  // years present given current sort field
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs) {
      const dt = getDateValue(d, sortField);
      if (dt) s.add(String(dt.getFullYear()));
    }
    return Array.from(s).sort().reverse();
  }, [docs, sortField]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = docs.filter((d) => {
      if (q && !d.id.toLowerCase().includes(q) && !JSON.stringify(d.data).toLowerCase().includes(q)) return false;
      if (filterYear || filterMonth) {
        const dt = getDateValue(d, sortField);
        if (!dt) return false;
        if (filterYear && String(dt.getFullYear()) !== filterYear) return false;
        if (filterMonth && String(dt.getMonth()) !== filterMonth) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      const da = getDateValue(a, sortField)?.getTime() ?? 0;
      const db = getDateValue(b, sortField)?.getTime() ?? 0;
      return sortDir === "asc" ? da - db : db - da;
    });
    return arr;
  }, [docs, search, filterYear, filterMonth, sortField, sortDir]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const d of filtered.slice(0, 50)) Object.keys(d.data).forEach((k) => keys.add(k));
    return Array.from(keys).slice(0, 8);
  }, [filtered]);

  const exportName = () => {
    const parts = [selected ?? "data"];
    if (filterYear) parts.push(filterYear);
    if (filterMonth) parts.push(MONTHS[Number(filterMonth)]);
    return parts.join("_");
  };

  const exportCSV = () => {
    const rows = filtered.map(flattenDoc);
    download(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8;" }), `${exportName()}.csv`);
    setExportOpen(false);
  };

  const exportXLSX = () => {
    const rows = filtered.map(flattenDoc);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (selected ?? "data").slice(0, 31));
    XLSX.writeFile(wb, `${exportName()}.xlsx`);
    setExportOpen(false);
  };

  const exportJSON = () => {
    download(new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" }), `${exportName()}.json`);
    setExportOpen(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#F7F8FA] font-sans overflow-hidden">
      <header className="flex items-center px-4 h-12 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-orange-500 flex items-center justify-center text-white shrink-0">
            <Database size={16} />
          </div>
          <span className="font-semibold text-gray-900 text-sm truncate">SafiHub</span>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-gray-600 text-sm truncate">Data Viewer</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
            <Layers size={13} className="text-gray-500" />
            <span>{collections.length} collections</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
            <FileText size={13} className="text-gray-500" />
            <span>{filtered.length} / {docs.length}</span>
          </div>
          <button
            onClick={() => { collectionsQ.refetch(); if (selected) docsQ.refetch(); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <RefreshCw size={13} className={collectionsQ.isFetching || docsQ.isFetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={!selected || !filtered.length}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50"
            >
              <Download size={13} />
              <span>Export</span>
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-10 py-1">
                <button onClick={exportXLSX} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                  <FileSpreadsheet size={13} className="text-green-600" /> Excel (.xlsx)
                </button>
                <button onClick={exportCSV} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                  <FileText size={13} className="text-blue-600" /> CSV
                </button>
                <button onClick={exportJSON} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                  <FileJson size={13} className="text-gray-600" /> JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-gray-500 border-b border-gray-100">
            COLLECTIONS
          </div>
          <div className="flex-1 overflow-auto">
            {collectionsQ.isLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 text-xs">
                <RefreshCw size={18} className="animate-spin text-orange-400" /><span>Loading…</span>
              </div>
            )}
            {collectionsQ.error && <div className="p-3 text-xs text-red-600">{(collectionsQ.error as Error).message}</div>}
            {collections.map((name) => (
              <button
                key={name}
                onClick={() => { setSelected(name); setSearch(""); setFilterYear(""); setFilterMonth(""); }}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 border-l-2 ${
                  selected === name ? "bg-orange-50 border-orange-500 text-orange-700 font-medium" : "border-transparent text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Layers size={13} className="opacity-60" /><span className="truncate">{name}</span>
              </button>
            ))}
            {!collectionsQ.isLoading && !collections.length && !collectionsQ.error && (
              <div className="p-4 text-xs text-gray-400">No collections.</div>
            )}
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
            <h2 className="font-semibold text-gray-900 text-sm truncate">{selected ?? "Select a collection"}</h2>

            {selected && (
              <>
                <div className="flex items-center gap-1 ml-2 text-xs">
                  <Calendar size={12} className="text-gray-400" />
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value)}
                    className="border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-400"
                    title="Sort by date field"
                  >
                    {dateFields.map((f) => (
                      <option key={f} value={f}>{f === "_createTime" ? "Created" : f === "_updateTime" ? "Updated" : f}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                    className="p-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100"
                    title={sortDir === "asc" ? "Oldest first" : "Newest first"}
                  >
                    {sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  <option value="">All years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  <option value="">All months</option>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                {(filterYear || filterMonth) && (
                  <button onClick={() => { setFilterYear(""); setFilterMonth(""); }} className="text-[11px] text-orange-600 hover:underline">
                    Clear
                  </button>
                )}
              </>
            )}

            <div className="ml-auto relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search all fields…"
                className="text-xs border border-gray-200 rounded-md pl-8 pr-3 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder-gray-400 bg-gray-50"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {!selected && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <Layers size={32} className="text-gray-300" /><p className="text-sm">Select a collection from the sidebar</p>
              </div>
            )}
            {selected && docsQ.isLoading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <RefreshCw size={22} className="animate-spin text-orange-400" /><p className="text-sm">Loading documents…</p>
              </div>
            )}
            {selected && docsQ.error && (
              <div className="p-4 text-sm text-red-600 whitespace-pre-wrap break-all">{(docsQ.error as Error).message}</div>
            )}
            {selected && !docsQ.isLoading && !docsQ.error && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <FileText size={28} className="text-gray-300" /><p className="text-sm">No documents</p>
              </div>
            )}
            {selected && filtered.length > 0 && (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left font-medium px-4 py-2 border-b border-gray-200 w-48">Document ID</th>
                    <th className="text-left font-medium px-4 py-2 border-b border-gray-200 w-40">
                      {sortField === "_createTime" ? "Created" : sortField === "_updateTime" ? "Updated" : sortField}
                    </th>
                    {columns.map((c) => (
                      <th key={c} className="text-left font-medium px-4 py-2 border-b border-gray-200">{c}</th>
                    ))}
                    <th className="w-10 border-b border-gray-200"></th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {filtered.map((d) => {
                    const dt = getDateValue(d, sortField);
                    return (
                      <tr key={d.id} onClick={() => setOpenDoc(d)} className="hover:bg-orange-50/50 cursor-pointer border-b border-gray-100">
                        <td className="px-4 py-2 font-mono text-[11px] text-gray-700 truncate max-w-[12rem]">{d.id}</td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{dt ? dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        {columns.map((c) => (
                          <td key={c} className="px-4 py-2 text-gray-700 truncate max-w-[14rem]">{formatValue(d.data[c])}</td>
                        ))}
                        <td className="px-2 py-2 text-gray-400"><ChevronRight size={14} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {openDoc && (
          <aside className="w-[420px] bg-white border-l border-gray-200 flex flex-col shrink-0">
            <div className="flex items-center px-4 py-2.5 border-b border-gray-200">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">{selected}</div>
                <div className="font-mono text-xs text-gray-900 truncate">{openDoc.id}</div>
              </div>
              <button onClick={() => setOpenDoc(null)} className="ml-auto p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="text-[11px] text-gray-500 mb-1">Path</div>
              <div className="font-mono text-xs text-gray-700 mb-3 break-all">{openDoc.path}</div>
              {openDoc.createTime && (<><div className="text-[11px] text-gray-500 mb-1">Created</div><div className="text-xs text-gray-700 mb-3">{new Date(openDoc.createTime).toLocaleString()}</div></>)}
              {openDoc.updateTime && (<><div className="text-[11px] text-gray-500 mb-1">Updated</div><div className="text-xs text-gray-700 mb-3">{new Date(openDoc.updateTime).toLocaleString()}</div></>)}
              <div className="text-[11px] text-gray-500 mb-1">Data</div>
              <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded p-3 overflow-auto text-gray-800">{JSON.stringify(openDoc.data, null, 2)}</pre>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
