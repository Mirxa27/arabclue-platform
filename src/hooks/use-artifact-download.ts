"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  downloadProposalArtifact,
  saveBlob,
  type ArtifactDownloadFormat,
} from "@/lib/download-artifact";

/**
 * Reliable proposal/contract artifact download with toast feedback.
 */
export function useArtifactDownload() {
  const { toast } = useToast();
  const [busyFormat, setBusyFormat] = useState<ArtifactDownloadFormat | null>(
    null
  );

  const download = useCallback(
    async (opts: {
      proposalId: string;
      format: ArtifactDownloadFormat;
      fallbackName?: string;
      locale?: "ar" | "en";
    }) => {
      const ar = opts.locale === "ar";
      setBusyFormat(opts.format);
      try {
        const result = await downloadProposalArtifact({
          proposalId: opts.proposalId,
          format: opts.format,
          fallbackName: opts.fallbackName,
          locale: opts.locale,
        });
        if (!result.ok) {
          // The sentence is bilingual from the route; the gate's issue codes,
          // when present, follow it so the writer knows what to fix.
          const issueList = (result.issues ?? []).slice(0, 5).join(", ");
          toast({
            title: ar ? "فشل التنزيل" : "Download failed",
            description: issueList ? `${result.error} (${issueList})` : result.error,
            variant: "destructive",
          });
          return false;
        }
        saveBlob(result.blob, result.filename);
        toast({
          title: ar ? "تم التنزيل" : "Downloaded",
          description: result.filename,
        });
        return true;
      } finally {
        setBusyFormat(null);
      }
    },
    [toast]
  );

  return { download, busyFormat, isBusy: busyFormat != null };
}
