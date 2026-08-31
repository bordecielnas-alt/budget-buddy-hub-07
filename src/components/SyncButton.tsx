import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { syncFromN8n } from "@/lib/n8n.functions";

export function SyncButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const sync = useServerFn(syncFromN8n);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const report = await sync({ data: { preview: false } });
      toast.success(report.message);
      void queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
      void queryClient.invalidateQueries({ queryKey: ["n8n-config"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size={size} onClick={run} disabled={busy}>
      {busy ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 size-4" />
      )}
      MAJ
    </Button>
  );
}
