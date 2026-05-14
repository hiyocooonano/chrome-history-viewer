import { queryBookmarkTree, getBookmarkFolders } from "@/lib/graph-queries";
import { graphDataToCytoscapeElements } from "@/lib/transform";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId") || undefined;
    const foldersOnly = searchParams.get("foldersOnly") === "true";

    if (foldersOnly) {
      const folders = await getBookmarkFolders();
      return Response.json({ folders });
    }

    const graphData = await queryBookmarkTree(folderId);
    const elements = graphDataToCytoscapeElements(graphData);
    return Response.json({ graphData, elements });
  } catch (error) {
    console.error("[/api/graph/bookmarks] Error:", error);
    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
