import { querySearchGraph, getTopSearchTerms } from "@/lib/graph-queries";
import { graphDataToCytoscapeElements } from "@/lib/transform";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const term = searchParams.get("term");
    const maxHops = Math.min(
      parseInt(searchParams.get("maxHops") || "2", 10),
      3
    );
    const dateFrom = searchParams.get("from") || undefined;
    const dateTo = searchParams.get("to") || undefined;

    // If no term, return top keywords
    if (!term) {
      const topTerms = await getTopSearchTerms(20);
      return Response.json({ topTerms });
    }

    const graphData = await querySearchGraph(term, maxHops, dateFrom, dateTo);
    const elements = graphDataToCytoscapeElements(graphData);
    return Response.json({ graphData, elements });
  } catch (error) {
    console.error("[/api/graph/search] Error:", error);
    return Response.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
