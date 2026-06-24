import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Database,
  Search,
  Layers,
  FileText,
  RefreshCw,
  Download,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "safihub-app · Firestore" },
      { name: "description", content: "Browse Firestore collections and documents." },
    ],
  }),
  component: Index,
});

function Index() {
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col h-screen bg-[#F7F8FA] font-sans overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center px-4 h-12 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-orange-500 flex items-center justify-center text-white">
            <Database size={16} />
          </div>
          <span className="font-semibold text-gray-900 text-sm">safihub-app</span>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-gray-600 text-sm">Firestore</span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
            <Layers size={13} className="text-gray-500" />
            <span>0 collections</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
            <FileText size={13} className="text-gray-500" />
            <span>0 docs</span>
          </div>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-md hover:bg-gray-50">
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600">
            <Download size={13} />
            <span>Download DB</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-4 py-2.5 text-[11px] font-semibold tracking-wider text-gray-500">
            COLLECTIONS
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-xs gap-2">
            <RefreshCw size={20} className="animate-spin text-orange-400" />
            <span>Loading…</span>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
            <h2 className="font-semibold text-gray-900 text-sm">Select a collection</h2>
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
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
              <Layers size={32} className="text-gray-300" />
              <p className="text-sm">Select a collection from the sidebar</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
