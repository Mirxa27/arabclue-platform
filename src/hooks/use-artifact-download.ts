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
        });
        if (!result.ok) {
          // Collapse repeated gate codes: "invented_nora_id, invented_nora_id, …"
          const description = result.error
            .replace(
              /Export blocked by validation gate:\s*/i,
              ar ? "بوابة التحقق منعت التصدير: " : "Export blocked: "
            )
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .slice(0, 5)
            .join(", ");
          toast({
            title: ar ? "فشل التنزيل" : "Download failed",
            description: description || result.error,
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
