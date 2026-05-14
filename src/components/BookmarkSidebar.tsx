'use client';

interface BookmarkSidebarProps {
  folders: Array<{ folderId: string; name: string; depth: number }>;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
}

export default function BookmarkSidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
}: BookmarkSidebarProps) {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">
        フォルダ
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        <button
          onClick={() => onSelectFolder(null)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
            selectedFolderId === null
              ? "bg-purple-900/50 text-white font-medium"
              : "text-gray-300 hover:bg-gray-800"
          }`}
        >
          すべて
        </button>
        {folders.map((folder) => (
          <button
            key={folder.folderId}
            onClick={() => onSelectFolder(folder.folderId)}
            className={`w-full text-left py-1.5 text-sm transition-colors truncate ${
              selectedFolderId === folder.folderId
                ? "bg-purple-900/50 text-white font-medium"
                : "text-gray-300 hover:bg-gray-800"
            }`}
            style={{ paddingLeft: `${(folder.depth + 1) * 12}px` }}
            title={folder.name}
          >
            {folder.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
