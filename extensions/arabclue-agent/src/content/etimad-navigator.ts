/** Automated page navigation on Etimad */

import { ETIMAD } from "../constants";
import type { UserMatchCriteria } from "../types";

/** Detect if current page is on Etimad */
export function isOnEtimadSite(): boolean {
  return ETIMAD.ORIGIN_PATTERN.test(window.location.href);
}

/** Classify what type of Etimad page we're on */
export function getEtimadPageType(): "listing" | "detail" | "search" | "login" | "other" {
  const url = window.location.href.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  
  if (/alltenders|allvisitor|tenderlist/i.test(path)) return "listing";
  if (/details|detailsfor/i.test(path)) return "detail";
  if (/search|find/i.test(path)) return "search";
  if (/login|signin|auth/i.test(path)) return "login";
  
  // Check page content
  const hasTable = !!document.querySelector("table tbody tr, .tender-item, .tender-card");
  if (hasTable) return "listing";
  
  const hasDetailFields = !!document.querySelector("[data-tender-ref], .tender-reference, .tender-title");
  if (hasDetailFields) return "detail";
  
  return "other";
}

/** Navigate to the tenders listing page */
export function navigateToTendersList(): void {
  window.location.href = ETIMAD.TENDERS_LIST;
}

/** Navigate to a specific tender detail page */
export function navigateToTenderDetail(url: string): void {
  window.location.href = url;
}

/** Click the next page button — returns true if navigation triggered */
export function clickNextPage(): boolean {
  const nextBtn = document.querySelector(
    "a.next, .pagination .next a, [aria-label='Next'], a[rel='next'], .page-item:not(.disabled):last-child a, .pagination li:last-child a"
  ) as HTMLAnchorElement | null;
  
  if (!nextBtn) return false;
  
  // Check if it's disabled
  const parent = nextBtn.closest(".page-item, li");
  if (parent?.classList.contains("disabled") || parent?.classList.contains("active")) return false;
  
  nextBtn.click();
  return true;
}

/** Apply search filters on Etimad's listing page */
export function applyFilters(criteria: UserMatchCriteria): void {
  // Try to find and fill search/filter inputs
  const searchInput = document.querySelector(
    "input[type='search'], input[name*='search'], input[placeholder*='بحث'], #searchInput, .search-input"
  ) as HTMLInputElement | null;
  
  if (searchInput && criteria.keywordsAr.length > 0) {
    searchInput.value = criteria.keywordsAr[0];
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  
  // Try category dropdown
  const categorySelect = document.querySelector(
    "select[name*='category'], select[name*='type'], #categoryFilter"
  ) as HTMLSelectElement | null;
  
  if (categorySelect && criteria.categories.length > 0) {
    // Map our categories to potential Etimad option values
    const options = Array.from(categorySelect.options);
    for (const cat of criteria.categories) {
      const match = options.find(opt => 
        opt.text.toLowerCase().includes(cat.toLowerCase()) ||
        opt.value.toLowerCase().includes(cat.toLowerCase())
      );
      if (match) {
        categorySelect.value = match.value;
        categorySelect.dispatchEvent(new Event("change", { bubbles: true }));
        break;
      }
    }
  }
  
  // Try submit/search button
  const submitBtn = document.querySelector(
    "button[type='submit'], .search-btn, .filter-btn, button[onclick*='search'], input[type='submit']"
  ) as HTMLElement | null;
  
  if (submitBtn) {
    setTimeout(() => submitBtn.click(), 300);
  }
}

/** Wait for page content to load (SPA rendering) */
export function waitForPageLoad(): Promise<void> {
  return new Promise((resolve) => {
    // If content is already loaded
    if (document.querySelector("table tbody tr, .tender-item, .tender-card")) {
      resolve();
      return;
    }
    
    // Wait for DOM mutations indicating content loaded
    const observer = new MutationObserver((mutations, obs) => {
      if (document.querySelector("table tbody tr, .tender-item, .tender-card")) {
        obs.disconnect();
        resolve();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 10000);
  });
}

/** Get current page number from URL or pagination */
export function getCurrentPage(): number {
  // Try URL parameter
  const urlMatch = window.location.href.match(/[?&]page=(\d+)/i);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  
  // Try active pagination item
  const active = document.querySelector(".pagination .active, .page-item.active");
  if (active) {
    const num = parseInt(active.textContent?.trim() || "1", 10);
    if (!isNaN(num)) return num;
  }
  
  return 1;
}
