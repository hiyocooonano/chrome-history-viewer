'use client';

import { useState } from "react";

interface SearchPanelProps {
  mode: "search" | "context";
  onModeChange: (mode: "search" | "context") => void;
  onSearch: (term: string, maxHops: number, dateFrom?: string, dateTo?: string) => void;
  onContextSearch: (url: string, dateFrom?: string, dateTo?: string) => void;
  topTerms: Array<{ term: string; searchCount: number }>;
  maxHops: number;
  onMaxHopsChange: (hops: number) => void;
}

export default function SearchPanel({
  mode,
  onModeChange,
  onSearch,
  onContextSearch,
  topTerms,
  maxHops,
  onMaxHopsChange,
}: SearchPanelProps) {
  const [searchInput, setSearchInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchInput.trim();
    if (term) {
      onSearch(term, maxHops, dateFrom || undefined, dateTo || undefined);
    }
  };

  const handleContextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (url) {
      onContextSearch(url, dateFrom || undefined, dateTo || undefined);
    }
  };

  const handleKeywordClick = (term: string) => {
    setSearchInput(term);
    onSearch(term, maxHops, dateFrom || undefined, dateTo || undefined);
  };

  return (
    <div
      className="flex flex-col bg-gray-900 border-r border-gray-800 overflow-y-auto"
      style={{ width: "280px", minWidth: "280px" }}
    >
      {/* Mode Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => onModeChange("search")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === "search"
              ? "bg-gray-800 text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          検索起点
        </button>
        <button
          onClick={() => onModeChange("context")}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            mode === "context"
              ? "bg-gray-800 text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          URL追跡
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Date Range Filter (shared between modes) */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-400 font-medium">期間フィルタ</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 bg-gray-800 text-white text-xs rounded px-2 py-1.5 border border-gray-700 focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-500 text-xs self-center">〜</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 bg-gray-800 text-white text-xs rounded px-2 py-1.5 border border-gray-700 focus:outline-none focus:border-blue-500"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-gray-500 hover:text-gray-300 self-end"
            >
              期間をクリア
            </button>
          )}
        </div>

        {mode === "search" ? (
          <>
            {/* Search Form */}
            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2">
              <label className="text-xs text-gray-400 font-medium">検索キーワード</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="キーワードを入力..."
                  className="flex-1 bg-gray-800 text-white text-sm rounded px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500 placeholder-gray-500"
                />
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded transition-colors"
                >
                  検索
                </button>
              </div>
            </form>

            {/* Hop Count Slider */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-400 font-medium">
                ホップ数: <span className="text-white font-bold">{maxHops}</span>
              </label>
              <input
                type="range"
                min={1}
                max={3}
                value={maxHops}
                onChange={(e) => onMaxHopsChange(parseInt(e.target.value, 10))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>1</span>
                <span>2</span>
                <span>3</span>
              </div>
            </div>

            {/* Popular Keywords */}
            {topTerms.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-400 font-medium">人気キーワード</label>
                <ul className="flex flex-col gap-1">
                  {topTerms.map((item) => (
                    <li key={item.term}>
                      <button
                        onClick={() => handleKeywordClick(item.term)}
                        className="w-full text-left px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors flex items-center justify-between group"
                      >
                        <span className="truncate">{item.term}</span>
                        <span className="text-xs text-gray-500 group-hover:text-gray-400 ml-2 shrink-0">
                          {item.searchCount}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Context Search Form */}
            <form onSubmit={handleContextSubmit} className="flex flex-col gap-2">
              <label className="text-xs text-gray-400 font-medium">URL</label>
              <textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/..."
                rows={3}
                className="bg-gray-800 text-white text-sm rounded px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500 placeholder-gray-500 resize-none"
              />
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded transition-colors"
              >
                追跡
              </button>
            </form>
            <p className="text-xs text-gray-500">
              URLを起点に関連する閲覧履歴のグラフを表示します。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
