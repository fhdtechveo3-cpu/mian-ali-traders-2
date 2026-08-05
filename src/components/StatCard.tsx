import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  title,
  value,
  icon: Icon,
  hint,
  sub,
  tone = "default",
}: {
  label?: string;
  title?: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const displayLabel = label ?? title ?? "";
  const displayHint = hint ?? sub ?? "";
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{displayLabel}</p>
          <p className={`mt-1 truncate text-2xl font-semibold ${toneClass}`}>{value}</p>
          {displayHint && <p className="mt-1 text-xs text-muted-foreground">{displayHint}</p>}
        </div>
        {Icon && (
          <span className="rounded-md bg-secondary p-2 text-secondary-foreground">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </CardContent>
    </Card>
  );
}
