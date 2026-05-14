import { graphDataToCytoscapeElements } from "@/lib/transform";
import type { GraphData } from "@/types/graph";

describe("graphDataToCytoscapeElements", () => {
  it("converts GraphData to CytoscapeElements", () => {
    const input: GraphData = {
      nodes: [
        {
          id: "term:日向坂46",
          label: "日向坂46",
          type: "search-term",
          depth: 0,
          data: {
            term: "日向坂46",
            searchCount: 11,
            firstSearch: "2026-01-01T00:00:00Z",
            lastSearch: "2026-05-10T00:00:00Z",
          },
        },
        {
          id: "page:https://hinatazaka46.com",
          label: "hinatazaka46.com",
          type: "web-page",
          depth: 1,
          data: {
            url: "https://hinatazaka46.com",
            title: "日向坂46公式サイト",
            domain: "hinatazaka46.com",
            visitCount: 15,
            lastVisit: "2026-05-10T14:32:00Z",
          },
        },
      ],
      edges: [
        {
          id: "sf:日向坂46:https://hinatazaka46.com",
          source: "term:日向坂46",
          target: "page:https://hinatazaka46.com",
          type: "searched-for",
          data: {
            term: "日向坂46",
            url: "https://hinatazaka46.com",
            searchTime: "2026-05-10T00:00:00Z",
          },
        },
      ],
    };

    const result = graphDataToCytoscapeElements(input);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    expect(result.nodes[0].data).toEqual({
      id: "term:日向坂46",
      label: "日向坂46",
      type: "search-term",
      depth: 0,
      searchCount: 11,
    });

    expect(result.nodes[1].data).toMatchObject({
      id: "page:https://hinatazaka46.com",
      label: "hinatazaka46.com",
      type: "web-page",
      depth: 1,
      visitCount: 15,
      domain: "hinatazaka46.com",
    });

    expect(result.edges[0].data).toEqual({
      id: "sf:日向坂46:https://hinatazaka46.com",
      source: "term:日向坂46",
      target: "page:https://hinatazaka46.com",
      type: "searched-for",
    });
  });

  it("returns empty elements for empty input", () => {
    const result = graphDataToCytoscapeElements({ nodes: [], edges: [] });
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("converts bookmark-folder nodes", () => {
    const input: GraphData = {
      nodes: [
        {
          id: "folder:abc",
          label: "GoogleCloud",
          type: "bookmark-folder",
          depth: 2,
          data: { folderId: "abc", name: "GoogleCloud", depth: 2 },
        },
      ],
      edges: [],
    };
    const result = graphDataToCytoscapeElements(input);
    expect(result.nodes[0].data.type).toBe("bookmark-folder");
    expect(result.nodes[0].data.label).toBe("GoogleCloud");
  });

  it("includes bookmark info for web-page nodes", () => {
    const input: GraphData = {
      nodes: [
        {
          id: "page:https://github.com",
          label: "GitHub",
          type: "web-page",
          depth: 1,
          data: {
            url: "https://github.com",
            title: "GitHub",
            domain: "github.com",
            visitCount: 5,
            lastVisit: "2026-05-10T00:00:00Z",
            isBookmarked: true,
            bookmarkFolder: "Develop",
          },
        },
      ],
      edges: [],
    };
    const result = graphDataToCytoscapeElements(input);
    expect(result.nodes[0].data.isBookmarked).toBe(true);
    expect(result.nodes[0].data.bookmarkFolder).toBe("Develop");
  });
});
