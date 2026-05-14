'use client';

interface GraphControlsProps {
  layout: "cola" | "dagre";
  onLayoutChange: (layout: "cola" | "dagre") => void;
}

export default function GraphControls({ layout, onLayoutChange }: GraphControlsProps) {
  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-gray-900 bg-opacity-90 rounded px-3 py-2">
      <label className="text-xs text-gray-400 font-medium">レイアウト:</label>
      <select
        value={layout}
        onChange={(e) => onLayoutChange(e.target.value as "cola" | "dagre")}
        className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-700 focus:outline-none focus:border-blue-500"
      >
        <option value="cola">Cola (力学)</option>
        <option value="dagre">Dagre (階層)</option>
      </select>
    </div>
  );
}
