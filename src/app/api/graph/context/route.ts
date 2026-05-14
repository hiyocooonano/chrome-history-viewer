import { queryContextGraph } from "@/lib/graph-queries";
import { graphDataToCytoscapeElements } from "@/lib/transform";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const dateFrom = searchParams.get("from") || undefined;
    const dateTo = searchParams.get("to") || undefined;

    if (!url) {
      return Response.json(
        { error: "url parameter is required" },
        { status: 400 }
      );
    }

    const graphData = await queryContextGraph(url, dateFrom, dateTo);
    const elements = graphDataToCytoscapeElements(graphData);
    return Response.json({ graphData, elements });
  } catch (error) {
    console.error("[/api/graph/context] Error:", error);
    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
