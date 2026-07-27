/** Chrome notifications for tender matches and deadlines */

import type { EtimadTender } from "../types";

/** Notify user about new matching tenders */
export function notifyNewMatches(tenders: EtimadTender[]): void {
  if (!tenders.length) return;

  chrome.notifications.create(`arabclue-matches-${Date.now()}`, {
    type: "basic",
    iconUrl: "../assets/icons/icon-128.png",
    title: `${tenders.length} مناقصات جديدة — New matches`,
    message: tenders.length === 1
      ? tenders[0].titleAr || tenders[0].title
      : tenders.slice(0, 3).map(t => t.titleAr || t.title).join("\n"),
    priority: 2,
  });
}

/** Notify user that a proposal is ready */
export function notifyProposalReady(tender: EtimadTender, proposalId: string): void {
  chrome.notifications.create(`arabclue-proposal-${proposalId}`, {
    type: "basic",
    iconUrl: "../assets/icons/icon-128.png",
    title: "العرض جاهز — Proposal Ready",
    message: `${tender.titleAr || tender.title}\nRef: ${tender.referenceNumber}`,
    priority: 2,
  });
}

/** Notify about tenders closing soon */
export function notifyClosingSoon(tenders: EtimadTender[]): void {
  if (!tenders.length) return;

  chrome.notifications.create(`arabclue-deadline-${Date.now()}`, {
    type: "basic",
    iconUrl: "../assets/icons/icon-128.png",
    title: `⚠️ ${tenders.length} مناقصات تغلق قريباً`,
    message: tenders.slice(0, 3).map(t =>
      `${t.titleAr || t.title} — ${t.closingDate}`
    ).join("\n"),
    priority: 2,
  });
}
