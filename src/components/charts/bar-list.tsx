"use client";
/**
 * Single-series horizontal bar chart (magnitude → one hue). Values are direct-
 * labeled in text ink; a hidden table mirrors the data for screen readers.
 * Suppressed cells (string like "<5") render as a muted placeholder bar with
 * the suppression label, never a number.
 */
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BarDatum {
  label: string;
  value: number | string;
}

export function BarList({ data, title, height, emptyText = "No data yet." }: { data: BarDatum[]; title: string; height?: number; emptyText?: string }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const numeric = data.map((d) => (typeof d.value === "number" ? d.value : 0));
  const max = Math.max(1, ...numeric);
  const rows = data.map((d) => ({
    label: d.label,
    shown: typeof d.value === "number" ? d.value : max * 0.12,
    suppressed: typeof d.value !== "number",
    display: String(d.value),
  }));
  return (
    <figure>
      <div style={{ height: height ?? Math.max(120, rows.length * 36 + 16) }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap={8}>
            <XAxis type="number" hide domain={[0, max]} />
            <YAxis type="category" dataKey="label" width={170} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as (typeof rows)[number];
                return (
                  <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg">
                    <div className="font-medium text-foreground">{p.label}</div>
                    <div className="text-muted-foreground">{p.suppressed ? `${p.display} (suppressed for privacy)` : p.display}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="shown" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.label} fill={r.suppressed ? "var(--border)" : "var(--teal-strong)"} />
              ))}
              <LabelList dataKey="display" position="right" style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 500 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{String(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
