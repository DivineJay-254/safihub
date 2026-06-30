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
  Users,
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

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function looksLikeDate(v: any): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}
function parseDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function formatValue(v: any): string {
  if (v == null || v === "") return "—";
  if (looksLikeDate(v)) {
    const d = parseDate(v);
    if (d) return d.toLocaleString();
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return "{…}";
  return String(v);
}
function flattenDoc(d: any): Record<string, any> {
  const out: Record<string, any> = { _id: d.id, createdAt: d.createTime, updatedAt: d.updateTime };
  for (const [k, v] of Object.entries(d.data ?? {})) {
    if (v == null) out[k] = "";
    else if (typeof v === "object") out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}
function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const keySet = new Set<string>();
  for (const r of rows) Object.keys(r).forEach(k => keySet.add(k));
  const keys = Array.from(keySet);
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

const EMPLOYEE_KEY_CANDIDATES = ["employeeId","employee_id","employeeID","userId","user_id","uid","staffId","employee","employeeName","employee_name","name","email"];
const DATE_KEY_CANDIDATES = ["date","workDate","work_date","shiftDate","day","timestamp","createdAt","created_at"];

function detectDateFields(docs: any[]): string[] {
  const fields = new Set<string>();
  for (const d of docs.slice(0, 50)) {
    for (const [k, v] of Object.entries(d.data ?? {})) {
      if (looksLikeDate(v)) fields.add(k);
    }
  }
  return Array.from(fields);
}
function detectFieldsMatching(docs: any[], candidates: string[]): string[] {
  const present = new Set<string>();
  for (const d of docs.slice(0, 50)) for (const k of Object.keys(d.data ?? {})) present.add(k);
  return candidates.filter(c => present.has(c));
}
function detectNumericFields(docs: any[]): string[] {
  const fields = new Set<string>();
  for (const d of docs.slice(0, 50)) {
    for (const [k, v] of Object.entries(d.data ?? {})) {
      if (typeof v === "number") fields.add(k);
    }
  }
  return Array.from(fields);
}

function getFieldValue(doc: any, field: string): any {
  if (field === "createdAt") return doc.createTime;
  if (field === "updatedAt") return doc.updateTime;
  return doc.data?.[field];
}

type SortPart = "full" | "year" | "month" | "day";

function sortKey(doc: any, field: string, part: SortPart): number {
  const d = parseDate(getFieldValue(doc, field));
  if (!d) return Number.NEGATIVE_INFINITY;
  if (part === "full") return d.getTime();
  if (part === "year") return d.getFullYear();
  if (part === "month") return d.getMonth();
  return d.getDate();
}

function Index() {
  const getCols = useServerFn(getCollections);
  const getDocs = useServerFn(getCollectionDocs);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openDoc, setOpenDoc] = useState<any | null>(null);
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortPart, setSortPart] = useState<SortPart>("full");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [exportOpen, setExportOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [employeeField, setEmployeeField] = useState<string>("");
  const [payrollDateField, setPayrollDateField] = useState<string>("createdAt");
  const now = new Date();
  const [rangeMode, setRangeMode] = useState<"current" | "range" | "all">("current");
  const [fromYear, setFromYear] = useState<string>(String(now.getFullYear()));
  const [fromMonth, setFromMonth] = useState<string>("0");
  const [toYear, setToYear] = useState<string>(String(now.getFullYear()));
  const [toMonth, setToMonth] = useState<string>(String(now.getMonth()));
  const [pivotMetric, setPivotMetric] = useState<string>("entries");




  const collectionsQ = useQuery({ queryKey: ["fs", "collections"], queryFn: () => getCols() });
  const docsQ = useQuery({
    queryKey: ["fs", "docs", selected],
    queryFn: () => getDocs({ data: { collection: selected! } }),
    enabled: !!selected,
  });

  const collections = collectionsQ.data?.collections ?? [];
  const docs = docsQ.data?.docs ?? [];

  const detectedDateFields = useMemo(() => detectDateFields(docs), [docs]);
  const dateFields = useMemo(() => ["createdAt", "updatedAt", ...detectedDateFields], [detectedDateFields]);
  const employeeCandidates = useMemo(() => detectFieldsMatching(docs, EMPLOYEE_KEY_CANDIDATES), [docs]);
  const numericFields = useMemo(() => detectNumericFields(docs), [docs]);

  // auto-pick employee field
  useMemo(() => {
    if (!employeeField && employeeCandidates.length) setEmployeeField(employeeCandidates[0]);
  }, [employeeCandidates, employeeField]);
  useMemo(() => {
    const preferred = detectedDateFields.find(f => DATE_KEY_CANDIDATES.includes(f));
    if (preferred) setPayrollDateField(preferred);
  }, [detectedDateFields]);

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs) {
      const dt = parseDate(getFieldValue(d, sortField));
      if (dt) s.add(String(dt.getFullYear()));
    }
    return Array.from(s).sort().reverse();
  }, [docs, sortField]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = docs.filter((d) => {
      if (q && !d.id.toLowerCase().includes(q) && !JSON.stringify(d.data).toLowerCase().includes(q)) return false;
      if (filterYear || filterMonth) {
        const dt = parseDate(getFieldValue(d, sortField));
        if (!dt) return false;
        if (filterYear && String(dt.getFullYear()) !== filterYear) return false;
        if (filterMonth && String(dt.getMonth()) !== filterMonth) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      const va = sortKey(a, sortField, sortPart);
      const vb = sortKey(b, sortField, sortPart);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [docs, search, filterYear, filterMonth, sortField, sortPart, sortDir]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const d of filtered.slice(0, 50)) Object.keys(d.data).forEach((k) => keys.add(k));
    return Array.from(keys).slice(0, 8);
  }, [filtered]);

  const toggleSort = (field: string, part: SortPart = "full") => {
    if (sortField === field && sortPart === part) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field); setSortPart(part); setSortDir("desc");
    }
  };

  const exportName = () => {
    const parts = [selected ?? "data"];
    if (filterYear) parts.push(filterYear);
    if (filterMonth) parts.push(MONTHS[Number(filterMonth)]);
    return parts.join("_");
  };
  const exportCSV = () => {
    download(new Blob([toCSV(filtered.map(flattenDoc))], { type: "text/csv;charset=utf-8;" }), `${exportName()}.csv`);
    setExportOpen(false);
  };
  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(flattenDoc));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (selected ?? "data").slice(0, 31));
    XLSX.writeFile(wb, `${exportName()}.xlsx`);
    setExportOpen(false);
  };
  const exportJSON = () => {
    download(new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" }), `${exportName()}.json`);
    setExportOpen(false);
  };

  // -------- Payroll template --------
  // Build a list of {label, year, month|null, docs[]} periods based on rangeMode.
  // rangeMode "current" -> uses toolbar filters on `filtered`.
  // rangeMode "range"   -> iterates months from (fromYear,fromMonth) to (toYear,toMonth), pulling from `docs`.
  // rangeMode "all"     -> single period containing every doc in the collection.
  type Period = { label: string; year: number | null; month: number | null; docs: any[] };

  const periods = useMemo<Period[]>(() => {
    if (rangeMode === "current") {
      const label = `${filterMonth ? MONTHS[Number(filterMonth)] : "All months"} ${filterYear || "All years"}`;
      return [{ label, year: filterYear ? Number(filterYear) : null, month: filterMonth ? Number(filterMonth) : null, docs: filtered }];
    }
    if (rangeMode === "all") {
      return [{ label: `All time (${docs.length} entries)`, year: null, month: null, docs }];
    }
    // range
    const fy = Number(fromYear), fm = Number(fromMonth);
    const ty = Number(toYear), tm = Number(toMonth);
    const out: Period[] = [];
    let y = fy, m = fm;
    let guard = 0;
    while ((y < ty || (y === ty && m <= tm)) && guard++ < 240) {
      const monthDocs = docs.filter(d => {
        const dt = parseDate(getFieldValue(d, payrollDateField));
        return dt && dt.getFullYear() === y && dt.getMonth() === m;
      });
      out.push({ label: `${MONTHS[m]} ${y}`, year: y, month: m, docs: monthDocs });
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }, [rangeMode, filtered, filterYear, filterMonth, docs, fromYear, fromMonth, toYear, toMonth, payrollDateField]);

  function buildPayrollRows(periodDocs: any[], periodLabel: string): Record<string, any>[] {
    if (!employeeField) return [];
    const groups = new Map<string, any[]>();
    for (const d of periodDocs) {
      const key = String(d.data?.[employeeField] ?? "(unknown)");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    const rows: Record<string, any>[] = [];
    for (const [emp, entries] of groups) {
      const sample = entries[0]?.data ?? {};
      const row: Record<string, any> = {
        Employee: emp,
        Name: sample.name ?? sample.employeeName ?? sample.fullName ?? "",
        Email: sample.email ?? "",
        Period: periodLabel,
        Entries: entries.length,
      };
      const days = new Set<string>();
      let firstDate: Date | null = null, lastDate: Date | null = null;
      for (const e of entries) {
        const dt = parseDate(getFieldValue(e, payrollDateField));
        if (dt) {
          days.add(dt.toISOString().slice(0, 10));
          if (!firstDate || dt < firstDate) firstDate = dt;
          if (!lastDate || dt > lastDate) lastDate = dt;
        }
      }
      row["Days Worked"] = days.size;
      row["First Entry"] = firstDate ? firstDate.toISOString().slice(0, 10) : "";
      row["Last Entry"] = lastDate ? lastDate.toISOString().slice(0, 10) : "";
      for (const nf of numericFields) {
        let sum = 0; let any = false;
        for (const e of entries) {
          const v = e.data?.[nf];
          if (typeof v === "number") { sum += v; any = true; }
        }
        if (any) row[`Total ${nf}`] = Number(sum.toFixed(2));
      }
      rows.push(row);
    }
    rows.sort((a, b) => String(a.Employee).localeCompare(String(b.Employee)));
    return rows;
  }

  // preview = first period (or combined when in current/all)
  const previewRows = useMemo(() => {
    if (!periods.length) return [];
    if (rangeMode === "range") {
      // combined preview across all months
      const all = periods.flatMap(p => p.docs);
      return buildPayrollRows(all, `${periods[0]?.label} → ${periods[periods.length - 1]?.label}`);
    }
    return buildPayrollRows(periods[0].docs, periods[0].label);
  }, [periods, employeeField, payrollDateField, numericFields, rangeMode]);

  const totalPeriodEntries = useMemo(() => periods.reduce((s, p) => s + p.docs.length, 0), [periods]);

  const payrollName = () => {
    const parts = ["payroll", selected ?? ""];
    if (rangeMode === "current") {
      if (filterYear) parts.push(filterYear);
      if (filterMonth) parts.push(MONTHS[Number(filterMonth)]);
    } else if (rangeMode === "range") {
      parts.push(`${MONTHS[Number(fromMonth)]}${fromYear}-${MONTHS[Number(toMonth)]}${toYear}`);
    } else {
      parts.push("all");
    }
    return parts.filter(Boolean).join("_");
  };
  const exportPayrollCSV = () => {
    // CSV is flat — combine every period, include Period column
    const all: Record<string, any>[] = [];
    for (const p of periods) all.push(...buildPayrollRows(p.docs, p.label));
    download(new Blob([toCSV(all)], { type: "text/csv;charset=utf-8;" }), `${payrollName()}.csv`);
  };
  const exportPayrollXLSX = () => {
    const wb = XLSX.utils.book_new();
    // Combined summary across all periods
    const combined: Record<string, any>[] = [];
    for (const p of periods) combined.push(...buildPayrollRows(p.docs, p.label));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(combined), "Summary");
    // One sheet per period (when more than one)
    if (periods.length > 1) {
      for (const p of periods) {
        const rows = buildPayrollRows(p.docs, p.label);
        if (!rows.length) continue;
        const sheetName = p.label.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
      }
    }
    // Entries detail (every doc in scope)
    const detail = periods.flatMap(p => p.docs.map(d => ({ Period: p.label, ...flattenDoc(d) })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Entries");
    XLSX.writeFile(wb, `${payrollName()}.xlsx`);
  };


  const SortHeader = ({ field, part = "full" as SortPart, label }: { field: string; part?: SortPart; label: string }) => {
    const active = sortField === field && sortPart === part;
    return (
      <button onClick={() => toggleSort(field, part)} className={`inline-flex items-center gap-1 ${active ? "text-orange-600 font-semibold" : "hover:text-gray-800"}`}>
        {label}
        {active && (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </button>
    );
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
            <Layers size={13} className="text-gray-500" /><span>{collections.length} collections</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
            <FileText size={13} className="text-gray-500" /><span>{filtered.length} / {docs.length}</span>
          </div>
          <button
            onClick={() => { collectionsQ.refetch(); if (selected) docsQ.refetch(); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <RefreshCw size={13} className={collectionsQ.isFetching || docsQ.isFetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => setPayrollOpen(true)}
            disabled={!selected || !filtered.length}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            <Users size={13} /><span>Payroll</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={!selected || !filtered.length}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50"
            >
              <Download size={13} /><span>Export</span>
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
          <div className="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-gray-500 border-b border-gray-100">COLLECTIONS</div>
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
                onClick={() => { setSelected(name); setSearch(""); setFilterYear(""); setFilterMonth(""); setEmployeeField(""); }}
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
                    onChange={(e) => { setSortField(e.target.value); }}
                    className="border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-400"
                    title="Date field used for sort & filter"
                  >
                    {dateFields.map((f) => (
                      <option key={f} value={f}>
                        {f === "createdAt" ? "Created At" : f === "updatedAt" ? "Updated At" : f}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sortPart}
                    onChange={(e) => setSortPart(e.target.value as SortPart)}
                    className="border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-400"
                    title="Sort by exact date or just day/month/year"
                  >
                    <option value="full">Exact date</option>
                    <option value="year">Year only</option>
                    <option value="month">Month only</option>
                    <option value="day">Day of month</option>
                  </select>
                  <button
                    onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                    className="p-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100"
                    title={sortDir === "asc" ? "Ascending" : "Descending"}
                  >
                    {sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-400">
                  <option value="">All years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-orange-400">
                  <option value="">All months</option>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                {(filterYear || filterMonth) && (
                  <button onClick={() => { setFilterYear(""); setFilterMonth(""); }} className="text-[11px] text-orange-600 hover:underline">Clear</button>
                )}
              </>
            )}

            <div className="ml-auto relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search all fields…"
                className="text-xs border border-gray-200 rounded-md pl-8 pr-3 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder-gray-400 bg-gray-50" />
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
            {selected && docsQ.error && <div className="p-4 text-sm text-red-600 whitespace-pre-wrap break-all">{(docsQ.error as Error).message}</div>}
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
                    <th className="text-left font-medium px-4 py-2 border-b border-gray-200 w-44">
                      <SortHeader field="createdAt" label="Created At" />
                      <span className="text-gray-300 mx-1">|</span>
                      <SortHeader field="createdAt" part="day" label="D" />
                      <SortHeader field="createdAt" part="month" label="M" />
                      <SortHeader field="createdAt" part="year" label="Y" />
                    </th>
                    <th className="text-left font-medium px-4 py-2 border-b border-gray-200 w-44">
                      <SortHeader field="updatedAt" label="Updated At" />
                    </th>
                    {columns.map((c) => (
                      <th key={c} className="text-left font-medium px-4 py-2 border-b border-gray-200">
                        {looksLikeDate(filtered.find(d => d.data[c])?.data[c])
                          ? <SortHeader field={c} label={c} />
                          : c}
                      </th>
                    ))}
                    <th className="w-10 border-b border-gray-200"></th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {filtered.map((d) => {
                    const created = parseDate(d.createTime);
                    const updated = parseDate(d.updateTime);
                    return (
                      <tr key={d.id} onClick={() => setOpenDoc(d)} className="hover:bg-orange-50/50 cursor-pointer border-b border-gray-100">
                        <td className="px-4 py-2 font-mono text-[11px] text-gray-700 truncate max-w-[12rem]">{d.id}</td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{created ? created.toLocaleString() : "—"}</td>
                        <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{updated ? updated.toLocaleString() : "—"}</td>
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
              {openDoc.createTime && (<><div className="text-[11px] text-gray-500 mb-1">Created At</div><div className="text-xs text-gray-700 mb-3">{new Date(openDoc.createTime).toLocaleString()}</div></>)}
              {openDoc.updateTime && (<><div className="text-[11px] text-gray-500 mb-1">Updated At</div><div className="text-xs text-gray-700 mb-3">{new Date(openDoc.updateTime).toLocaleString()}</div></>)}
              <div className="text-[11px] text-gray-500 mb-1">Data</div>
              <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded p-3 overflow-auto text-gray-800">{JSON.stringify(openDoc.data, null, 2)}</pre>
            </div>
          </aside>
        )}
      </div>

      {/* Payroll modal */}
      {payrollOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPayrollOpen(false)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center px-5 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center text-white"><Users size={14} /></div>
                <div>
                  <div className="font-semibold text-sm text-gray-900">Payroll Export</div>
                  <div className="text-[11px] text-gray-500">One row per employee for the selected period</div>
                </div>
              </div>
              <button onClick={() => setPayrollOpen(false)} className="ml-auto p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3 overflow-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Group by (employee field)</label>
                  <select value={employeeField} onChange={e => setEmployeeField(e.target.value)} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50">
                    <option value="">— pick a field —</option>
                    {Array.from(new Set([...employeeCandidates, ...columns])).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Date field (for days worked)</label>
                  <select value={payrollDateField} onChange={e => setPayrollDateField(e.target.value)} className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50">
                    {dateFields.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Period scope</label>
                <div className="flex flex-wrap gap-1 text-xs">
                  {([
                    ["current", "Toolbar filter"],
                    ["range", "Custom month range"],
                    ["all", "Whole collection"],
                  ] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setRangeMode(v)}
                      className={`px-3 py-1.5 rounded border ${rangeMode === v ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {rangeMode === "current" && (
                <div className="text-xs text-gray-700 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded">
                  Using toolbar filter: {filterMonth ? MONTHS[Number(filterMonth)] : "All months"} · {filterYear || "All years"}
                </div>
              )}

              {rangeMode === "range" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">From</label>
                    <div className="flex gap-1">
                      <select value={fromMonth} onChange={e => setFromMonth(e.target.value)} className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50">
                        {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                      </select>
                      <input type="number" value={fromYear} onChange={e => setFromYear(e.target.value)}
                        className="w-20 text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">To</label>
                    <div className="flex gap-1">
                      <select value={toMonth} onChange={e => setToMonth(e.target.value)} className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50">
                        {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                      </select>
                      <input type="number" value={toYear} onChange={e => setToYear(e.target.value)}
                        className="w-20 text-xs border border-gray-200 rounded px-2 py-1.5 bg-gray-50" />
                    </div>
                  </div>
                </div>
              )}

              {rangeMode === "range" && periods.length > 0 && (
                <div className="text-[11px] text-gray-600 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                  Will export <b>{periods.length}</b> month{periods.length === 1 ? "" : "s"} — one sheet per month plus a combined Summary.
                </div>
              )}
              {rangeMode === "all" && (
                <div className="text-[11px] text-gray-600 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                  Exporting the whole <b>{selected}</b> collection — all {docs.length} entries grouped per employee.
                </div>
              )}

              <div className="border border-gray-200 rounded overflow-auto max-h-[35vh]">
                {previewRows.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">
                    {employeeField ? "No entries in this period." : "Pick an employee field to preview the payroll table."}
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr>{Object.keys(previewRows[0]).map(k => <th key={k} className="text-left font-medium px-3 py-2 border-b border-gray-200 whitespace-nowrap">{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          {Object.keys(previewRows[0]).map(k => <td key={k} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{String(r[k] ?? "")}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="text-[11px] text-gray-500">
                {previewRows.length} employee{previewRows.length === 1 ? "" : "s"} · {totalPeriodEntries} entries in scope
              </div>
            </div>
            <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
              <button onClick={() => setPayrollOpen(false)} className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900">Cancel</button>
              <div className="ml-auto flex gap-2">
                <button onClick={exportPayrollCSV} disabled={!previewRows.length}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5">
                  <FileText size={12} className="text-blue-600" /> CSV
                </button>
                <button onClick={exportPayrollXLSX} disabled={!previewRows.length}
                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                  <FileSpreadsheet size={12} /> Excel ({rangeMode === "range" ? "Summary + per month" : "Summary + Entries"})
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
