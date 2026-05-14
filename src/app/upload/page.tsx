import UploadPanel from "@/components/UploadPanel";
import Header from "@/components/Header";

export default function UploadPage() {
  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-white">データアップロード</h2>
          <UploadPanel
            title="Chrome 閲覧履歴"
            description="Chrome の History ファイル（SQLite）をアップロード。macOS: ~/Library/Application Support/Google/Chrome/Default/History"
            accept="*"
            endpoint="/api/upload/history"
          />
          <UploadPanel
            title="Chrome ブックマーク"
            description="Chrome の Bookmarks ファイル（JSON）をアップロード。macOS: ~/Library/Application Support/Google/Chrome/Default/Bookmarks"
            accept="*"
            endpoint="/api/upload/bookmarks"
          />
        </div>
      </div>
    </div>
  );
}
