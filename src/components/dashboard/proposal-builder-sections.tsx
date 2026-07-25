"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import {
  GripVertical,
  Trash2,
  FileText,
  FileCheck,
  DollarSign,
  Users,
  Award,
  Clock,
  Shield,
  FolderOpen,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProposalSection, SectionType } from "@/lib/proposal-builder-types";
import { getSectionLabel } from "@/lib/proposal-builder-engine";

// Icon mapping for section types
const SECTION_ICONS: Record<SectionType, typeof FileText> = {
  cover: FileText,
  "executive-summary": FileCheck,
  "technical-approach": FileText,
  pricing: DollarSign,
  team: Users,
  qualifications: Award,
  timeline: Clock,
  compliance: Shield,
  appendix: FolderOpen,
};

// Sortable section item component
function SortableSectionItem({
  section,
  isSelected,
  locale,
  onSelect,
  onDelete,
}: {
  section: ProposalSection;
  isSelected: boolean;
  locale: string;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const ar = locale === "ar";
  const Icon = SECTION_ICONS[section.sectionType];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.sectionKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const completenessScore = section.content.ar.trim().length > 0 || section.content.en.trim().length > 0
    ? Math.min(100, Math.round(((section.content.ar.length + section.content.en.length) / 200) * 100))
    : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-all",
        isSelected
          ? "border-primary/50 bg-primary/5 shadow-sm"
          : "border-border/50 bg-background/50 hover:border-border hover:bg-background/80",
        isDragging && "z-50 shadow-lg opacity-90"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {/* Icon */}
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          isSelected ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"
        )}
      >
        <Icon className="size-4" />
      </div>

      {/* Content */}
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start text-start"
        onClick={onSelect}
      >
        <span className="w-full truncate text-xs font-medium">
          {section.title[locale as "ar" | "en"] || getSectionLabel(section.sectionType, locale as "ar" | "en")}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Progress indicator */}
          <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                completenessScore >= 80
                  ? "bg-emerald-500"
                  : completenessScore >= 40
                    ? "bg-amber-500"
                    : "bg-muted-foreground/30"
              )}
              style={{ width: `${completenessScore}%` }}
            />
          </div>
          {section.isRequired && (
            <Badge variant="destructive" className="h-4 px-1 text-[8px]">
              {ar ? "مطلوب" : "Req"}
            </Badge>
          )}
          {!section.isVisible && (
            <EyeOff className="size-3 text-muted-foreground/50" />
          )}
        </div>
      </button>

      {/* Delete button */}
      {!section.isRequired && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3 text-destructive" />
        </Button>
      )}
    </div>
  );
}

export function ProposalBuilderSections({
  locale,
  sections,
  selectedSectionKey,
  onSelectSection,
  onReorder,
  onDelete,
}: {
  locale: string;
  sections: ProposalSection[];
  selectedSectionKey: string | null;
  onSelectSection: (key: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (key: string) => void;
}) {
  const ar = locale === "ar";

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.sectionKey === active.id);
      const newIndex = sections.findIndex((s) => s.sectionKey === over.id);
      onReorder(oldIndex, newIndex);
    }
  }

  if (sections.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <FileText className="size-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          {ar ? "لا توجد أقسام. أضف قسماً للبدء." : "No sections. Add a section to begin."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.sectionKey)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sections.map((section) => (
              <SortableSectionItem
                key={section.sectionKey}
                section={section}
                isSelected={section.sectionKey === selectedSectionKey}
                locale={locale}
                onSelect={() => onSelectSection(section.sectionKey)}
                onDelete={() => onDelete(section.sectionKey)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}