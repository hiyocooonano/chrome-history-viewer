'use client';

import type { GraphNode, SearchTermNode, WebPageNode, BookmarkFolderNode } from "@/types/graph";

interface NodeDetailProps {
  node: GraphNode | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function NodeDetail({ node }: NodeDetailProps) {
  if (!node) {
    return (
      <div className="bg-gray-900 border-t border-gray-800 px-6 py-3 text-sm text-gray-500 flex items-center">
        ノードを選択すると詳細が表示されます
      </div>
    );
  }

  if (node.type === "bookmark-folder") {
    const data = node.data as BookmarkFolderNode;
    return (
      <div className="bg-gray-900 border-t border-gray-800 px-6 py-3 flex items-center gap-8 text-sm overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-[#7b1fa2] shrink-0" />
          <span className="text-gray-400">フォルダ</span>
        </div>
        <div>
          <span className="text-gray-400">名前: </span>
          <span className="text-white font-medium">{data.name}</span>
        </div>
        <div>
          <span className="text-gray-400">階層: </span>
          <span className="text-white">{data.depth}</span>
        </div>
      </div>
    );
  }

  if (node.type === "search-term") {
    const data = node.data as SearchTermNode;
    return (
      <div className="bg-gray-900 border-t border-gray-800 px-6 py-3 flex items-center gap-8 text-sm overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-[#1a73e8] shrink-0" />
          <span className="text-gray-400">検索キーワード</span>
        </div>
        <div>
          <span className="text-gray-400">キーワード: </span>
          <span className="text-white font-medium">{data.term}</span>
        </div>
        <div>
          <span className="text-gray-400">検索回数: </span>
          <span className="text-white font-medium">{data.searchCount}</span>
        </div>
        <div>
          <span className="text-gray-400">初回: </span>
          <span className="text-white">{formatDate(data.firstSearch)}</span>
        </div>
        <div>
          <span className="text-gray-400">最終: </span>
          <span className="text-white">{formatDate(data.lastSearch)}</span>
        </div>
      </div>
    );
  }

  const data = node.data as WebPageNode;
  return (
    <div className="bg-gray-900 border-t border-gray-800 px-6 py-3 flex items-center gap-8 text-sm overflow-x-auto">
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: node.depth === 1 ? "#2e7d32" : "#e65100" }}
        />
        <span className="text-gray-400">Webページ</span>
      </div>
      <div className="max-w-xs">
        <span className="text-gray-400">タイトル: </span>
        <span className="text-white font-medium truncate">{data.title || "N/A"}</span>
      </div>
      <div>
        <span className="text-gray-400">ドメイン: </span>
        <span className="text-white">{data.domain}</span>
      </div>
      <div>
        <span className="text-gray-400">訪問回数: </span>
        <span className="text-white font-medium">{data.visitCount}</span>
      </div>
      <div>
        <span className="text-gray-400">最終訪問: </span>
        <span className="text-white">{formatDate(data.lastVisit)}</span>
      </div>
      <div className="max-w-sm">
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 truncate block"
        >
          {data.url}
        </a>
      </div>
      {data.isBookmarked && (
        <div>
          <span className="text-gray-400">ブックマーク: </span>
          <span className="text-yellow-400 font-medium">★ {data.bookmarkFolder || "あり"}</span>
        </div>
      )}
    </div>
  );
}
