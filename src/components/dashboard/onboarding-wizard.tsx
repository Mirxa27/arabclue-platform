"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { useEffect, useMemo, useState, startTransition } from "react";
import { useSession } from "next-auth/react";
import { useLocale, useUI } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ONBOARDING_WIZARD_STEPS,
  WIZARD_ROLES,
  WIZARD_SECTORS,
  WIZARD_MISSION_CATALOG,
  EMPTY_CONNECT,
  deriveWizardPreview,
  wizardStepCompletion,
  wizardProgress,
  wizardProfileSchema,
  wizardBrandSchema,
  wizardLegalSchema,
  type WizardProfile,
  type WizardBrand,
  type WizardLegal,
  type WizardConnectState,
  type WizardMission,
  saveApprovalChain,
} from "@/lib/onboarding-wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Building2,
  Shield,
  Link2,
  Rocket,
  Loader2,
  FileCheck2,
  Scale,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, { en: string; ar: string }> = {
  FOUNDER_EXEC: { en: "Founder / exec", ar: "مؤسس / تنفيذي" },
  BID_MANAGER: { en: "Bid manager", ar: "مدير مناقصات" },
  TECHNICAL_LEAD: { en: "Technical lead", ar: "قائد فني" },
  PROPOSAL_WRITER: { en: "Proposal writer", ar: "كاتب عروض" },
  OTHER: { en: "Other", ar: "أخرى" },
};

const SECTOR_LABEL: Record<string, { en: string; ar: string }> = {
  GOV: { en: "Government", ar: "حكومي" },
  HEALTH: { en: "Health", ar: "صحي" },
  FINANCE: { en: "Finance", ar: "مالي" },
  ENERGY: { en: "Energy", ar: "طاقة" },
  TELECOM: { en: "Telecom", ar: "اتصالات" },
  OTHER: { en: "Other", ar: "أخرى" },
};

function DotProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current
              ? "w-6 bg-primary"
              : i < current
                ? "w-1.5 bg-primary/60"
                : "w-1.5 bg-muted-foreground/20"
          )}
        />
      ))}
    </div>
  );
}

export function OnboardingWizard() {
  const { locale } = useLocale();
  const { setView } = useUI();
  const { data: session, update: updateSession } = useSession();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ar = locale === "ar";

  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<WizardProfile | null>(null);
  const [brand, setBrand] = useState<WizardBrand | null>(null);
  const [legal, setLegal] = useState<WizardLegal | null>(null);
  const [connect, setConnect] = useState<WizardConnectState>(EMPTY_CONNECT);
  const [mission, setMission] = useState<WizardMission | null>(null);
  const [busy, setBusy] = useState(false);

  // Form drafts
  const [draftName, setDraftName] = useState("");
  const [draftRole, setDraftRole] = useState<string>("FOUNDER_EXEC");
  const [draftWsName, setDraftWsName] = useState("");
  const [draftWsNameAr, setDraftWsNameAr] = useState("");
  const [draftSector, setDraftSector] = useState<string>("GOV");
  const [draftTagline, setDraftTagline] = useState("");
  const [draftTaglineAr, setDraftTaglineAr] = useState("");
  const [draftColor, setDraftColor] = useState("#0F766E");
  const [draftCr, setDraftCr] = useState("");
  const [draftVat, setDraftVat] = useState("");
  const [draftTrack, setDraftTrack] = useState(false);
  const [draftTenderTitle, setDraftTenderTitle] = useState("");
  const [draftTenderTitleAr, setDraftTenderTitleAr] = useState("");
  const [draftEtimadRef, setDraftEtimadRef] = useState("");

  // These three prefill the form below, and the save handlers PATCH the drafts
  // straight back with the optional fields as `|| null`. A read that fails
  // quietly therefore renders blank inputs and writes null over stored values
  // the moment the user presses Continue — so none of them may return a
  // default, and the guard above the form is what keeps the form off screen.
  const workspaceQuery = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const r = await fetch("/api/workspaces");
      if (!r.ok) {
        throw new Error(
          apiErrorText(await r.json().catch(() => null), locale, ar ? "تعذر تحميل بيانات المنشأة" : "Could not load your organization")
        );
      }
      return r.json() as Promise<{
        workspace: { id: string; name: string; nameAr?: string | null; crNumber?: string | null; vatNumber?: string | null };
        members?: Array<{ user: { id: string; name: string; email: string } }>;
      }>;
    },
  });

  const brandQuery = useQuery({
    queryKey: ["brand"],
    queryFn: async () => {
      const r = await fetch("/api/brand");
      if (!r.ok) {
        throw new Error(
          apiErrorText(await r.json().catch(() => null), locale, ar ? "تعذر تحميل الهوية البصرية" : "Could not load your brand")
        );
      }
      return r.json() as Promise<{ brand: { tagline?: string | null; taglineAr?: string | null; primaryColor?: string | null } | null }>;
    },
  });

  const onboardingQuery = useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => {
      const r = await fetch("/api/onboarding");
      if (!r.ok) {
        throw new Error(
          apiErrorText(await r.json().catch(() => null), locale, ar ? "تعذر تحميل حالة الإعداد" : "Could not load your setup status")
        );
      }
      return r.json() as Promise<{ readyForProposals: boolean; missing: string[] }>;
    },
  });

  const wsData = workspaceQuery.data;
  const brandData = brandQuery.data;
  const onboardingStatus = onboardingQuery.data;
  const loadError = workspaceQuery.error ?? brandQuery.error ?? onboardingQuery.error;
  const loadPending =
    workspaceQuery.isPending || brandQuery.isPending || onboardingQuery.isPending;

  // Prefill once
  useEffect(() => {
    if (session?.user?.name && !draftName) setDraftName(session.user.name);
  }, [session?.user?.name, draftName]);
  useEffect(() => {
    if (wsData?.workspace && !draftWsName) {
      setDraftWsName(wsData.workspace.name ?? "");
      setDraftWsNameAr(wsData.workspace.nameAr ?? "");
      setDraftCr(wsData.workspace.crNumber ?? "");
      setDraftVat(wsData.workspace.vatNumber ?? "");
    }
  }, [wsData, draftWsName]);
  useEffect(() => {
    if (brandData?.brand && !draftTagline && !draftTaglineAr) {
      setDraftTagline(brandData.brand.tagline ?? "");
      setDraftTaglineAr(brandData.brand.taglineAr ?? "");
      if (brandData.brand.primaryColor) setDraftColor(brandData.brand.primaryColor);
    }
  }, [brandData, draftTagline, draftTaglineAr]);

  const completion = useMemo(
    () => wizardStepCompletion({ profile, brand, legal, connect, mission }),
    [profile, brand, legal, connect, mission]
  );
  const { percent } = useMemo(() => wizardProgress(completion), [completion]);
  const preview = useMemo(
    () => deriveWizardPreview({ profile, brand, legal, connect, mission }, wsData?.workspace?.name ?? draftWsName ?? ""),
    [profile, brand, legal, connect, mission, wsData?.workspace?.name, draftWsName]
  );

  const total = ONBOARDING_WIZARD_STEPS.length;
  const meta = ONBOARDING_WIZARD_STEPS[step]!;

  async function saveProfile(): Promise<boolean> {
    const parsed = wizardProfileSchema.safeParse({
      name: draftName,
      role: draftRole,
      workspaceName: draftWsName,
      workspaceNameAr: draftWsNameAr,
      sector: draftSector,
    });
    if (!parsed.success) {
      toast({ title: ar ? "تحقق من الحقول المطلوبة" : "Check required fields", variant: "destructive" });
      return false;
    }
    setBusy(true);
    try {
      if (parsed.data.name !== session?.user?.name) {
        const r = await fetch("/api/auth/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: parsed.data.name }),
        });
        if (!r.ok) throw new Error(apiErrorText(await r.json().catch(() => null), locale, ar ? "تعذر حفظ الملف الشخصي" : "Could not save your profile"));
        await updateSession?.({ name: parsed.data.name } as never);
      }
      const wr = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsed.data.workspaceName, nameAr: parsed.data.workspaceNameAr || null }),
      });
      if (!wr.ok) throw new Error(apiErrorText(await wr.json().catch(() => null), locale, ar ? "تعذر حفظ بيانات المنشأة" : "Could not save your organization"));
      setProfile(parsed.data);
      qc.invalidateQueries({ queryKey: ["workspace"] });
      return true;
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Error", variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveBrand(): Promise<boolean> {
    const parsed = wizardBrandSchema.safeParse({
      tagline: draftTagline,
      taglineAr: draftTaglineAr,
      primaryColor: draftColor,
    });
    if (!parsed.success) {
      toast({ title: ar ? "تحقق من الهوية البصرية" : "Check brand fields", variant: "destructive" });
      return false;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagline: parsed.data.tagline || null,
          taglineAr: parsed.data.taglineAr || null,
          primaryColor: parsed.data.primaryColor,
        }),
      });
      if (!r.ok) throw new Error(apiErrorText(await r.json().catch(() => null), locale, ar ? "تعذر حفظ الهوية البصرية" : "Could not save your brand"));
      setBrand(parsed.data);
      qc.invalidateQueries({ queryKey: ["brand"] });
      return true;
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Error", variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLegal(): Promise<boolean> {
    const parsed = wizardLegalSchema.safeParse({ crNumber: draftCr, vatNumber: draftVat });
    if (!parsed.success) {
      toast({ title: ar ? "السجل التجاري مطلوب" : "CR number is required", variant: "destructive" });
      return false;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crNumber: parsed.data.crNumber, vatNumber: parsed.data.vatNumber || null }),
      });
      if (!r.ok) throw new Error(apiErrorText(await r.json().catch(() => null), locale, ar ? "تعذر حفظ البيانات القانونية" : "Could not save your legal details"));
      setLegal(parsed.data);
      qc.invalidateQueries({ queryKey: ["workspace"] });
      return true;
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Error", variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveConnect(): Promise<boolean> {
    if (!connect.restrictionsAcknowledged) {
      toast({ title: ar ? "أقر بقواعد التعامل للمتابعة" : "Acknowledge handling rules to continue", variant: "destructive" });
      return false;
    }
    setBusy(true);
    try {
      // Restrictions
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restrictionsReviewed: true }),
      });
      // Track tender -> create project
      if (draftTrack && draftTenderTitle.trim() && draftEtimadRef.trim()) {
        const pr = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draftTenderTitle.trim(),
            titleAr: draftTenderTitleAr.trim() || null,
            etimadRef: draftEtimadRef.trim(),
          }),
        });
        if (!pr.ok) {
          throw new Error(
            apiErrorText(
              await pr.json().catch(() => null),
              locale,
              ar ? "تعذر إنشاء المشروع" : "Could not create the project"
            )
          );
        }
      }
      // Approval chain -> if reviewer selected, create policy
      // For wizard, use current user as approver if none selected (self-approval quick setup)
      const reviewerIds = wsData?.members?.slice(0, 1).map((m) => m.user.id) ?? [];
      // Throws on failure so the step is not silently marked complete.
      await saveApprovalChain(reviewerIds);
      setConnect({
        trackTender: draftTrack,
        tenderTitle: draftTenderTitle,
        tenderTitleAr: draftTenderTitleAr,
        etimadRef: draftEtimadRef,
        reviewerIds,
        restrictionsAcknowledged: true,
      });
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      return true;
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Error", variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleContinue() {
    let ok = true;
    if (step === 0) ok = await saveProfile();
    else if (step === 1) ok = await saveBrand();
    else if (step === 2) ok = await saveLegal();
    else if (step === 3) ok = await saveConnect();
    else if (step === 4) {
      if (!mission) {
        toast({ title: ar ? "اختر مهمة أولى" : "Pick a first mission", variant: "destructive" });
        return;
      }
      // Honest gating: the platform still requires an evidence-backed track
      // record before AI proposal generation. If the wizard hasn't satisfied
      // it yet, route to the detailed account setup instead of promising an
      // immediate draft that would be blocked by ONBOARDING_INCOMPLETE.
      const needsTrackRecord = onboardingStatus?.missing?.includes("trackRecord") ?? false;
      if (mission === "PROPOSAL" && needsTrackRecord) {
        startTransition(() => setView("account" as never));
        toast({
          title: ar ? "خطوة أخيرة — أضف سجل مشروع واحد" : "One last step — add a past project",
          description: ar
            ? "سجل المشاريع مطلوب لفحص الأهلية قبل توليد العطاءات. سنفتح لك نموذج الإضافة الموجّه."
            : "Track record is required for qualification checks before proposal generation. Opening the guided add form.",
        });
        return;
      }
      const target = WIZARD_MISSION_CATALOG.find((m) => m.id === mission)?.targetView ?? "overview";
      startTransition(() => setView(target as never));
      toast({ title: ar ? "انطلقنا — مهمتك الأولى جاهزة" : "You're set — your first mission is ready" });
      return;
    }
    if (ok && step < total - 1) setStep((s) => s + 1);
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  function handleSkip() {
    startTransition(() => setView("overview" as never));
  }

  // Before the form, not beside it: an error banner over a live form would
  // still let Continue submit the blanks it was warning about.
  if (loadPending || loadError) {
    return (
      <div className="mx-auto max-w-[1120px] w-full p-4 md:p-6" dir={ar ? "rtl" : "ltr"}>
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[20px] border bg-card p-10 text-center">
          {loadError ? (
            <div role="alert" className="flex flex-col items-center gap-4">
              <span className="rounded-full bg-destructive/10 p-3">
                <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
              </span>
              <div className="space-y-1.5">
                <h2 className="text-[18px] font-semibold tracking-tight">
                  {ar ? "تعذر تحميل بيانات الإعداد" : "We couldn't load your setup"}
                </h2>
                <p className="mx-auto max-w-[46ch] text-[13px] leading-5 text-muted-foreground">
                  {ar
                    ? "لم نعرض النموذج حتى لا تُستبدل بياناتك المحفوظة بحقول فارغة."
                    : "We're keeping the form hidden — filling it in now would overwrite your saved details with blanks."}
                </p>
                <p className="text-[12px] text-muted-foreground/80">{loadError.message}</p>
              </div>
              <Button
                onClick={() => {
                  void workspaceQuery.refetch();
                  void brandQuery.refetch();
                  void onboardingQuery.refetch();
                }}
              >
                {ar ? "إعادة المحاولة" : "Try again"}
              </Button>
            </div>
          ) : (
            <div role="status" className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-[13px] text-muted-foreground">
                {ar ? "جارٍ تحميل بيانات منشأتك…" : "Loading your organization…"}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1120px] w-full p-4 md:p-6" dir={ar ? "rtl" : "ltr"}>
      <div className="overflow-hidden rounded-[20px] border bg-card shadow-[0_8px_40px_rgba(0,0,0,0.12)] grid grid-cols-1 lg:grid-cols-[1.55fr_0.85fr] min-h-[620px]">
        {/* Left: wizard */}
        <div className="flex flex-col bg-card">
          <div className="px-7 md:px-8 pt-7 pb-5 border-b bg-muted/20">
            <div className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {ar ? "إعداد أراب كلاو" : "ARABCLUE SETUP"}
            </div>
            <div className="mt-1.5 text-[13px] text-muted-foreground">
              {ar ? `الخطوة ${step + 1} من ${total} · ${meta.ar}` : `Step ${step + 1} of ${total} · ${meta.en}`}
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${((step + 1) / total) * 100}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <DotProgress current={step} total={total} />
              <span className="text-[11px] text-muted-foreground">{percent}%</span>
            </div>
          </div>

          <div className="flex-1 px-7 md:px-8 py-7">
            <h2 className="text-[22px] font-semibold tracking-tight leading-tight">
              {ar ? meta.ar : meta.en}
            </h2>
            <p className="mt-2 text-[13px] leading-5 text-muted-foreground max-w-[52ch]">
              {ar ? meta.descriptionAr : meta.descriptionEn}
            </p>

            <div className="mt-6">
              {step === 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{ar ? "اسمك" : "Your name"}</Label>
                      <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={ar ? "محمد العتيبي" : "Mohammed Alotaibi"} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{ar ? "دورك" : "Your role"}</Label>
                      <Select value={draftRole} onValueChange={setDraftRole}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WIZARD_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{ar ? ROLE_LABEL[r]!.ar : ROLE_LABEL[r]!.en}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "اسم الشركة (EN)" : "Company name"}</Label>
                    <Input value={draftWsName} onChange={(e) => setDraftWsName(e.target.value)} placeholder={ar ? "شركة الحلول المتقدمة" : "Advanced Solutions Co."} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "اسم الشركة (AR)" : "Company name (Arabic)"}</Label>
                    <Input value={draftWsNameAr} onChange={(e) => setDraftWsNameAr(e.target.value)} placeholder="شركة الحلول المتقدمة" dir="rtl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "القطاع" : "Primary sector"}</Label>
                    <Select value={draftSector} onValueChange={setDraftSector}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WIZARD_SECTORS.map((s) => (
                          <SelectItem key={s} value={s}>{ar ? SECTOR_LABEL[s]!.ar : SECTOR_LABEL[s]!.en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "الشعار النصي (EN)" : "Tagline"}</Label>
                    <Input value={draftTagline} onChange={(e) => setDraftTagline(e.target.value)} placeholder={ar ? "نبني المستقبل الرقمي للمملكة" : "Engineering Saudi Arabia's Digital Future"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "الشعار النصي (AR)" : "Tagline (Arabic)"}</Label>
                    <Input value={draftTaglineAr} onChange={(e) => setDraftTaglineAr(e.target.value)} placeholder="نبني المستقبل الرقمي للمملكة" dir="rtl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "اللون الأساسي" : "Primary color"}</Label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={draftColor} onChange={(e) => setDraftColor(e.target.value)} className="h-9 w-14 rounded-md border bg-transparent p-1" aria-label="Primary color" />
                      <Input value={draftColor} onChange={(e) => setDraftColor(e.target.value)} className="font-mono text-sm" placeholder="#0F766E" />
                      <span className="h-6 flex-1 rounded-md border" style={{ background: draftColor }} aria-hidden />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{ar ? "يُلوّن الأغلفة وجداول التصدير والشرائح." : "Paints covers, export tables, and slide decks."}</p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "رقم السجل التجاري" : "Commercial registration (CR)"}</Label>
                    <Input value={draftCr} onChange={(e) => setDraftCr(e.target.value)} placeholder={ar ? "1010XXXXXX" : "1010XXXXXX"} dir="ltr" className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{ar ? "الرقم الضريبي (اختياري)" : "VAT number (optional)"}</Label>
                    <Input value={draftVat} onChange={(e) => setDraftVat(e.target.value)} placeholder="3000XXXXXX" dir="ltr" className="font-mono" />
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3 flex gap-2.5">
                    <Shield className="size-4 shrink-0 text-primary mt-0.5" />
                    <p className="text-xs leading-4 text-muted-foreground">
                      {ar ? "تُستخدم للتحقق من الأهلية في كل عطاء — لا تُعرض في المسودات إلا عند الحاجة." : "Used for qualification checks on every bid — never shown in drafts unless relevant."}
                    </p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <label className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/40 cursor-pointer">
                    <Checkbox checked={draftTrack} onCheckedChange={(v) => setDraftTrack(Boolean(v))} className="mt-0.5" />
                    <span className="text-sm leading-5">
                      <span className="font-medium flex items-center gap-1.5"><Link2 className="size-3.5" />{ar ? "تتبع أول مناقصة من اعتماد" : "Track your first Etimad tender"}</span>
                      <span className="text-xs text-muted-foreground">{ar ? "أنشئ مشروعاً برقم المرجع — يبقى التقديم على منصة اعتماد حصراً." : "Creates a project by reference — filing stays exclusively on the Etimad portal."}</span>
                    </span>
                  </label>
                  {draftTrack && (
                    <div className="space-y-3 rounded-lg border bg-card p-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{ar ? "عنوان المناقصة" : "Tender title"}</Label>
                        <Input value={draftTenderTitle} onChange={(e) => setDraftTenderTitle(e.target.value)} placeholder={ar ? "مناقصة تشغيل السحابة" : "Cloud Operations Tender"} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{ar ? "عنوان المناقصة (AR)" : "Title (Arabic)"}</Label>
                        <Input value={draftTenderTitleAr} onChange={(e) => setDraftTenderTitleAr(e.target.value)} placeholder="مناقصة تشغيل السحابة" dir="rtl" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Etimad ref</Label>
                        <Input value={draftEtimadRef} onChange={(e) => setDraftEtimadRef(e.target.value)} placeholder="ETM-2026-..." dir="ltr" className="font-mono" />
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="text-xs font-medium flex items-center gap-1.5"><Building2 className="size-3.5" />{ar ? "سلسلة الاعتماد" : "Approval chain"}</div>
                    <p className="text-xs text-muted-foreground">{ar ? "سيُنشأ مسار اعتماد سريع بك كمعتمد أول — يمكنك توسيعه لاحقاً في الإعداد." : "A quick approval route with you as first approver will be created — expand it later in Account setup."}</p>
                  </div>
                  <label className="flex items-start gap-2.5 text-xs leading-4 cursor-pointer">
                    <Checkbox checked={connect.restrictionsAcknowledged || false} onCheckedChange={(v) => setConnect((c) => ({ ...c, restrictionsAcknowledged: Boolean(v) }))} />
                    <span>{ar ? "أقررتُ بأنني راجعت قيود التعامل والحساسيات الخاصة بمساحة العمل." : "I confirm I have reviewed workspace handling restrictions and sensitivities."}</span>
                  </label>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  {WIZARD_MISSION_CATALOG.map((m) => {
                    const active = mission === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMission(m.id)}
                        className={cn(
                          "w-full text-start rounded-xl border p-4 flex gap-3 transition-all",
                          active ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/40"
                        )}
                      >
                        <span className={cn("size-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5", active ? "bg-primary text-primary-foreground" : "bg-muted")}>
                          {m.id === "PROPOSAL" ? <FileCheck2 className="size-4" /> : m.id === "CONTRACT" ? <Scale className="size-4" /> : <ClipboardCheck className="size-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="text-sm font-medium flex items-center gap-2">
                            {ar ? m.titleAr : m.titleEn}
                            {active && <Badge variant="secondary" className="h-5 text-[10px]"><Check className="size-3" />{ar ? "محدد" : "Selected"}</Badge>}
                          </span>
                          <span className="mt-1 block text-xs leading-4 text-muted-foreground">{ar ? m.descriptionAr : m.descriptionEn}</span>
                        </span>
                      </button>
                    );
                  })}
                  <p className="text-[11px] text-muted-foreground px-1">
                    {ar ? "الوكلاء يصوغون مسودة ثنائية اللغة — تراجعها قبل أي تصدير. التقديم النهائي يبقى على منصة اعتماد." : "Agents draft a bilingual proposal — you review before any export. Final filing stays on the Etimad portal."}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="px-7 md:px-8 py-5 border-t flex items-center justify-between gap-3 bg-muted/20">
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={step === 0 || busy} className="gap-1.5">
              <ArrowLeft className={cn("size-3.5", ar && "rotate-180")} />{ar ? "رجوع" : "Back"}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleSkip} disabled={busy}>
                {ar ? "تخطي حالياً" : "Skip for now"}
              </Button>
              <Button size="sm" onClick={handleContinue} disabled={busy} className="gap-1.5 min-w-[132px]">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {step === total - 1 ? (ar ? "إطلاق المهمة" : "Launch mission") : ar ? "متابعة" : "Continue"}
                {!busy && step < total - 1 && <ArrowRight className={cn("size-3.5", ar && "rotate-180")} />}
                {!busy && step === total - 1 && <Rocket className="size-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Right rail: live preview */}
        <div className="border-t lg:border-t-0 lg:border-s bg-muted/30 p-6 flex flex-col gap-6">
          <div className="text-[11px] font-medium text-muted-foreground">{ar ? "تتخصص الإعدادات بإجاباتك." : "Personalizes as you answer."}</div>

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold tracking-tight truncate">{preview.headline}</div>
            <div className="mt-1 text-xs text-muted-foreground truncate" dir={ar ? "rtl" : "ltr"}>
              {ar ? preview.contextLineAr : preview.contextLineEn}
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
                {ar ? "نقاط القوة" : "STRENGTHS"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {preview.strengths.map((s) => (
                  <Badge
                    key={s.id}
                    variant={s.active ? "default" : "outline"}
                    className={cn("text-[11px] h-6", s.active ? "" : "text-muted-foreground border-muted-foreground/20")}
                  >
                    {s.active && <Sparkles className="size-3 me-1" />}
                    {ar ? s.ar : s.en}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
                {ar ? "تطبيقات مقترحة" : "SUGGESTED APPS"}
              </div>
              <div className="mt-2 space-y-1.5">
                {[
                  { label: ar ? "تتبع اعتماد" : "Etimad tracking", active: preview.strengths.find((s) => s.id === "etimad")?.active },
                  { label: ar ? "سلسلة الاعتماد" : "Approval chain", active: preview.strengths.find((s) => s.id === "approvals")?.active },
                  { label: ar ? "تصدير بهويتك" : "Branded exports", active: preview.strengths.find((s) => s.id === "brand")?.active },
                  { label: ar ? "فحوصات الأهلية" : "Qualification", active: preview.strengths.find((s) => s.id === "legal")?.active },
                ].map((app) => (
                  <div key={app.label} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs">
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", app.active ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                      {app.label}
                    </span>
                    <span className={cn("text-[11px]", app.active ? "text-emerald-600 font-medium" : "text-muted-foreground")}>
                      {app.active ? (ar ? "مفعّل" : "Active") : ar ? "غير مفعّل" : "Setup"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
                {ar ? "رسائل أولى" : "FIRST MESSAGES"}
              </div>
              <div className="mt-2 space-y-2">
                {[
                  {
                    title: ar ? "مساعدة في صياغة العرض" : "Draft a proposal",
                    desc: ar ? "حوّل مناقصة اعتماد إلى عرض ثنائي اللغة." : "Turn an Etimad RFP into a bilingual proposal.",
                  },
                  {
                    title: ar ? "أتمتة مهمة" : "Automate a task",
                    desc: ar ? "اربط سير عمل متكرر عبر تطبيقاتك." : "Connect a repetitive workflow across your apps.",
                  },
                  {
                    title: ar ? "ساعدني أفهم" : "Help me figure it out",
                    desc: ar ? "مقابلة قصيرة ثم أول مهمة ملموسة." : "A short interview, then a concrete first task.",
                  },
                ].map((card) => (
                  <div key={card.title} className="rounded-lg border bg-background p-3">
                    <div className="text-xs font-medium">{card.title}</div>
                    <div className="mt-1 text-xs leading-4 text-muted-foreground">{card.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-dashed p-3 text-xs leading-4 text-muted-foreground">
            {ar
              ? "الوكلاء يدارون العقود والعروض وجاهزية المناقصات — تراجعها قبل أي تصدير. التقديم النهائي يبقى على منصة اعتماد."
              : "Agents manage contracts, proposals, and bid readiness end-to-end — you review before any export. Final filing stays on the Etimad portal."}
          </div>
        </div>
      </div>
    </div>
  );
}
