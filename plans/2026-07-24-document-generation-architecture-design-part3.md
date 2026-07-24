# Arabclue Document Generation Systems: Architecture Design (Part 3)

## 7. Implementation Roadmap

### 7.1 Development Phases

#### Phase 1: Foundation & Universal Standards (3-4 weeks)

**Objectives:**
- Establish design token system
- Create reusable component library
- Implement universal layout standards

**Tasks:**

**Week 1: Design System Foundation**
- [ ] Define complete design token system (colors, typography, spacing)
- [ ] Export CSS variables and TypeScript constants
- [ ] Create brand-aware theming utilities
- [ ] Set up design system documentation

**Week 2: Component Library**
- [ ] Build reusable HTML component generators
- [ ] Create component style library (buttons, cards, tables, badges)
- [ ] Implement bilingual text utilities
- [ ] Add RTL/LTR layout helpers

**Week 3: Layout Standards**
- [ ] Standardize page layouts (cover, section headers, footers)
- [ ] Implement print optimization styles
- [ ] Create responsive breakpoint system
- [ ] Build grid and spacing utilities

**Week 4: Testing & Documentation**
- [ ] Unit tests for component generators
- [ ] Visual regression tests for layouts
- [ ] Component documentation with examples
- [ ] Style guide publication

**Deliverables:**
- `src/lib/design-tokens.ts` - Complete token definitions
- `src/lib/components/` - Reusable component library
- `src/lib/styles/` - CSS modules and utilities
- `docs/design-system.md` - Design system documentation

**Dependencies:**
- None (foundational work)

**Complexity:** Medium

---

#### Phase 2: Bilingual Layout Engine (3-4 weeks)

**Objectives:**
- Build sophisticated bilingual rendering system
- Implement side-by-side, stacked, and tabbed modes
- Add RTL/LTR mirroring for visual elements

**Tasks:**

**Week 1: Core Layout Engine**
- [ ] Implement `BilingualLayoutEngine` class
- [ ] Create side-by-side layout mode
- [ ] Add content synchronization markers
- [ ] Build responsive mobile fallback

**Week 2: Advanced Modes**
- [ ] Implement stacked layout mode
- [ ] Add tabbed layout mode (HTML preview only)
- [ ] Create layout mode switcher
- [ ] Add column ratio customization

**Week 3: RTL/LTR Handling**
- [ ] Build bidirectional text utilities
- [ ] Implement visual element mirroring (charts, diagrams)
- [ ] Add mixed-direction content support
- [ ] Create RTL-aware component variants

**Week 4: Integration & Testing**
- [ ] Integrate with existing contract generator
- [ ] Add bilingual mode to proposal generator
- [ ] Extend business profile generator
- [ ] End-to-end tests for all modes

**Deliverables:**
- `src/lib/bilingual-layout.ts` - Layout engine
- `src/lib/bilingual-components.ts` - Bilingual UI components
- `src/lib/rtl-utils.ts` - RTL/LTR utilities
- Updated generators with bilingual support

**Dependencies:**
- Phase 1 (design tokens, component library)

**Complexity:** High

---

#### Phase 3: Contract Template System (4-5 weeks)

**Objectives:**
- Design and implement 5+ contract templates
- Build variable substitution engine
- Create standard clause library
- Add legal compliance validation

**Tasks:**

**Week 1: Template Infrastructure**
- [ ] Design database schema for templates
- [ ] Implement `ContractTemplate` data model
- [ ] Create template storage and versioning
- [ ] Build template inheritance system

**Week 2: Variable Substitution Engine**
- [ ] Implement Handlebars-like parser
- [ ] Add variable substitution logic
- [ ] Create conditional rendering (if/else)
- [ ] Add iteration support (loops)
- [ ] Build formatting filters (currency, date, percentage)

**Week 3: Contract Templates (5 types)**
- [ ] IT Services Agreement template
- [ ] Procurement Contract template
- [ ] NDA/Confidentiality Agreement template
- [ ] Partnership Agreement template
- [ ] Vendor/Subcontractor Agreement template

**Week 4: Clause Library**
- [ ] Define 20+ standard clauses across categories
- [ ] Implement clause selection system
- [ ] Add clause customization logic
- [ ] Build legal reference system

**Week 5: Legal Compliance Engine**
- [ ] Saudi law validation rules
- [ ] Government Tenders Law compliance checks
- [ ] Delay penalty validation
- [ ] Bilingual requirement validation
- [ ] Compliance reporting

**Deliverables:**
- Database migrations for template tables
- `src/lib/template-engine.ts` - Substitution engine
- `src/lib/contract-templates/` - 5+ contract templates
- `src/lib/clause-library.ts` - Standard clauses
- `src/lib/legal-compliance.ts` - Validation engine

**Dependencies:**
- Phase 2 (bilingual layout for contract rendering)

**Complexity:** High

---

#### Phase 4: Enhanced Proposal Layouts (2-3 weeks)

**Objectives:**
- Redesign proposal document layouts
- Add modern visual components
- Implement chart and visualization templates

**Tasks:**

**Week 1: Layout Components**
- [ ] Modern cover page design
- [ ] Executive summary layout
- [ ] Technical approach section
- [ ] Financial summary section
- [ ] Compliance overview section

**Week 2: Visual Elements**
- [ ] Chart generators (bar, pie, gauge, timeline)
- [ ] SVG rendering for PDF compatibility
- [ ] Data visualization utilities
- [ ] Icon system integration

**Week 3: Integration & Polish**
- [ ] Integrate new layouts with proposal generator
- [ ] Add layout selection options
- [ ] Implement layout customization settings
- [ ] Visual testing and refinement

**Deliverables:**
- `src/lib/proposal-layouts/` - Layout templates
- `src/lib/charts/` - Chart generation utilities
- Updated `src/lib/generators.ts` with new layouts

**Dependencies:**
- Phase 1 (design system)
- Phase 2 (bilingual layouts - optional)

**Complexity:** Medium

---

#### Phase 5: Template Management UI (4-5 weeks)

**Objectives:**
- Build user interface for template management
- Create template browser and editor
- Implement variable mapping and clause selection
- Add live preview with sample data

**Tasks:**

**Week 1: Template Browser**
- [ ] Grid and list view components
- [ ] Filtering and search functionality
- [ ] Sorting options
- [ ] Template card design
- [ ] Create new template flow

**Week 2: Template Editor (WYSIWYG)**
- [ ] Source/preview/split editor modes
- [ ] Section navigation sidebar
- [ ] Markdown editor integration (e.g., Monaco Editor)
- [ ] Syntax highlighting for template variables
- [ ] Auto-save functionality

**Week 3: Variable Mapping Interface**
- [ ] Variable list with type-specific inputs
- [ ] Auto-fill from project data
- [ ] Validation and error display
- [ ] Bulk variable management

**Week 4: Clause Selection UI**
- [ ] Clause browser by category
- [ ] Mandatory vs. optional indication
- [ ] Clause preview modal
- [ ] Custom clause editor

**Week 5: Live Preview & Testing**
- [ ] Real-time preview rendering
- [ ] Sample data generation
- [ ] Export to PDF from preview
- [ ] User testing and refinement

**Deliverables:**
- `src/components/dashboard/template-browser.tsx`
- `src/components/dashboard/template-editor.tsx`
- `src/components/dashboard/variable-mapper.tsx`
- `src/components/dashboard/clause-selector.tsx`
- `src/app/api/templates/` - API routes

**Dependencies:**
- Phase 3 (contract template system backend)

**Complexity:** High

---

#### Phase 6: Integration & Optimization (2-3 weeks)

**Objectives:**
- Integrate all systems
- Performance optimization
- End-to-end testing
- Documentation and training

**Tasks:**

**Week 1: System Integration**
- [ ] Connect template UI to backend
- [ ] Integrate bilingual engine across all generators
- [ ] Wire up new proposal layouts
- [ ] End-to-end workflow testing

**Week 2: Performance Optimization**
- [ ] PDF generation pooling (keep Chromium warm)
- [ ] Parallel artifact generation
- [ ] Template caching
- [ ] Database query optimization
- [ ] Asset optimization (fonts, images)

**Week 3: Documentation & Polish**
- [ ] User documentation for template management
- [ ] API documentation
- [ ] Admin guide for template library
- [ ] Video tutorials
- [ ] Final bug fixes and polish

**Deliverables:**
- Complete integrated system
- Performance benchmarks and optimizations
- User and admin documentation
- Training materials

**Dependencies:**
- All previous phases

**Complexity:** Medium

---

### 7.2 Prioritized Feature List

**Must-Have (P0) - Core Functionality:**

1. ✅ **Design Token System** - Foundation for all styling
2. ✅ **Bilingual Side-by-Side Layout** - Critical for contracts
3. ✅ **5 Contract Templates** - Core value proposition
4. ✅ **Variable Substitution Engine** - Template functionality
5. ✅ **Template Storage (Database)** - Persistence layer
6. ✅ **Template Browser UI** - User access to templates
7. ✅ **Basic Variable Mapping** - Minimum viable editor
8. ✅ **Enhanced Proposal Cover Page** - Visual improvement

**Should-Have (P1) - Important Enhancements:**

9. ✅ **Stacked/Tabbed Bilingual Modes** - Alternative layouts
10. ✅ **Standard Clause Library** - Reusable legal content
11. ✅ **Template Editor (WYSIWYG)** - Better UX
12. ✅ **Chart Generators** - Visual data representation
13. ✅ **Legal Compliance Validation** - Saudi law checks
14. ✅ **Live Preview with Sample Data** - Real-time feedback
15. ✅ **Clause Selection UI** - User-friendly clause browser

**Nice-to-Have (P2) - Future Improvements:**

16. ⭕ **RTL Visual Mirroring** - Charts/diagrams flip for Arabic
17. ⭕ **Scroll Synchronization** - Side-by-side column sync
18. ⭕ **Template Version History** - Track changes over time
19. ⭕ **Template Sharing** - Share across workspaces
20. ⭕ **AI-Powered Template Suggestions** - Smart recommendations
21. ⭕ **Multi-Language Support** (beyond AR/EN) - French, Urdu
22. ⭕ **Custom Chart Builder** - User-designed visualizations
23. ⭕ **Template Analytics** - Usage statistics and insights

---

### 7.3 Testing Strategy

#### Unit Testing

**Coverage Targets:**
- ✅ Core libraries: 90%+ coverage
- ✅ Generators: 85%+ coverage
- ✅ UI components: 75%+ coverage

**Test Files:**
```
src/lib/__tests__/
  ├── design-tokens.test.ts
  ├── bilingual-layout.test.ts
  ├── template-engine.test.ts
  ├── clause-library.test.ts
  ├── legal-compliance.test.ts
  ├── chart-generators.test.ts
  └── variable-substitution.test.ts
```

**Key Test Scenarios:**
1. Variable substitution with all data types
2. Conditional rendering (if/else, loops)
3. Bilingual layout modes (side-by-side, stacked, tabbed)
4. RTL/LTR text direction handling
5. Template validation rules
6. Legal compliance checks
7. Chart rendering with edge cases

#### Integration Testing

**Test Suites:**
```
src/lib/__tests__/integration/
  ├── template-to-pdf.test.ts          // End-to-end template → PDF
  ├── contract-generation.test.ts       // Full contract workflow
  ├── proposal-generation.test.ts       // Full proposal workflow
  ├── bilingual-export.test.ts          // Bilingual document export
  └── template-crud.test.ts             // Template CRUD operations
```

**Scenarios:**
1. Create template → Fill variables → Generate PDF
2. Import template → Customize → Export
3. Select clauses → Generate contract → Validate
4. Multi-language proposal generation
5. Template versioning and rollback

#### Visual Regression Testing

**Tools:** Playwright + Percy or Chromatic

**Test Scenarios:**
1. Cover page layouts across brands
2. Bilingual side-by-side rendering
3. Chart rendering consistency
4. Table styles in PDF output
5. Mobile responsive layouts
6. Print styles (@media print)

**Test Matrix:**
- 3 brand themes (default, custom primary, custom accent)
- 2 locales (Arabic, English)
- 3 document types (proposal, contract, business profile)
- 2 output formats (HTML, PDF)
= **36 visual test cases**

#### Performance Testing

**Benchmarks:**

| Operation | Current | Target | Acceptable |
|-----------|---------|--------|------------|
| HTML generation | 50ms | 50ms | 100ms |
| PDF generation | 2-4s | 1.5-2s | 3s |
| XLSX generation | 150ms | 100ms | 300ms |
| PPTX generation | 150ms | 100ms | 300ms |
| Template substitution | N/A | 20ms | 50ms |
| Full ZIP package | 3-5s | 2-3s | 5s |

**Load Testing:**
- Concurrent PDF generations: 10 simultaneous requests
- Large documents: 50+ page proposals
- Complex templates: 100+ variables, 20+ clauses

#### User Acceptance Testing (UAT)

**Test Groups:**
1. **Internal team** (2 users) - Feature validation
2. **Beta users** (5 workspaces) - Real-world usage
3. **Legal reviewers** (2 lawyers) - Contract template accuracy

**UAT Scenarios:**
1. Create custom IT services contract from template
2. Generate bilingual proposal for government tender
3. Customize clause library for company-specific terms
4. Export and submit contract package
5. Import template from JSON file

---

### 7.4 Rollout Plan

#### Stage 1: Internal Alpha (Week 1-2)

**Participants:** Development team only

**Scope:**
- Core functionality testing
- Bug identification
- Performance baseline

**Success Criteria:**
- All P0 features functional
- No critical bugs
- Performance within acceptable range

---

#### Stage 2: Closed Beta (Week 3-6)

**Participants:** 3-5 selected workspaces

**Scope:**
- Real-world contract generation
- Template customization testing
- Feedback collection

**Features Enabled:**
- ✅ 5 contract templates
- ✅ Template browser
- ✅ Variable mapping
- ✅ Bilingual layout
- ⚠️ Template editor (read-only preview)

**Success Criteria:**
- 80% user satisfaction
- <5 critical bugs
- Successful contract generation in 90%+ cases

---

#### Stage 3: Public Beta (Week 7-10)

**Participants:** All workspaces (opt-in)

**Scope:**
- Full feature set
- Template sharing
- Enhanced proposal layouts

**Features Enabled:**
- ✅ All P0 and P1 features
- ✅ Full template editor
- ✅ Enhanced proposal layouts
- ✅ Chart generators

**Success Criteria:**
- 100+ templates created by users
- 500+ documents generated from templates
- 90% user satisfaction
- <3 critical bugs

---

#### Stage 4: General Availability (Week 11)

**Participants:** All workspaces (default enabled)

**Scope:**
- Production-ready release
- Full documentation
- Support infrastructure

**Launch Checklist:**
- ✅ All critical bugs resolved
- ✅ Performance optimizations complete
- ✅ User documentation published
- ✅ Admin guide available
- ✅ Video tutorials recorded
- ✅ Support team trained
- ✅ Rollback plan ready

---

### 7.5 Risk Mitigation

#### Risk: PDF Generation Performance

**Impact:** High  
**Probability:** Medium

**Mitigation:**
1. Implement Chromium pooling (keep 2-3 instances warm)
2. Add Redis caching for frequently generated templates
3. Offer HTML export as alternative for instant preview
4. Consider serverless function scaling for PDF generation
5. Progressive enhancement: generate PDF asynchronously

---

#### Risk: Template Complexity Exceeds Substitution Engine

**Impact:** Medium  
**Probability:** Low

**Mitigation:**
1. Comprehensive testing with complex templates
2. Fallback to raw markdown if substitution fails
3. Clear error messages for template authors
4. Template validation before save
5. Gradual rollout of advanced features (loops, nested conditionals)

---

#### Risk: Legal Accuracy of Templates

**Impact:** Critical  
**Probability:** Low

**Mitigation:**
1. Disclaimer on all generated contracts (not legal advice)
2. Legal review of all standard templates
3. Cite Saudi law references explicitly
4. Recommend legal counsel review before execution
5. Version tracking for template changes
6. Clear indication of customized vs. standard clauses

---

#### Risk: RTL/LTR Rendering Issues

**Impact:** Medium  
**Probability:** Medium

**Mitigation:**
1. Extensive testing with Arabic and English content
2. Use Unicode bidirectional algorithm properly
3. Test with mixed content (Arabic text + English numbers/terms)
4. Browser and PDF renderer compatibility testing
5. Fallback to stacked mode if side-by-side breaks

---

#### Risk: User Adoption of Template System

**Impact:** High  
**Probability:** Low

**Mitigation:**
1. Provide pre-built templates (no creation needed initially)
2. Clear tutorials and documentation
3. Sample data for preview without entering real info
4. Gradual complexity (simple templates first)
5. Success metrics tracking and feedback loops

---

## 8. Database Schema Changes

### 8.1 New Tables

#### ContractTemplate Table

```prisma
model ContractTemplate {
  id              String   @id @default(cuid())
  workspaceId     String?  // null for public templates
  baseTemplateId  String?  // For template inheritance
  
  // Metadata
  type            String   // SERVICE_AGREEMENT | PROCUREMENT_CONTRACT | NDA | etc.
  version         String   @default("1.0")
  nameEn          String
  nameAr          String
  descriptionEn   String?
  descriptionAr   String?
  
  // Legal context
  jurisdiction    String   @default("KSA") // KSA | GCC | INTERNATIONAL
  governingLaw    String   @default("Saudi Arabian Law")
  language        String   @default("BILINGUAL") // BILINGUAL | ARABIC | ENGLISH
  formality       String   @default("FORMAL") // FORMAL | STANDARD | SIMPLE
  
  // Content (JSON serialized)
  sectionsJson    String   // ContractSection[]
  variablesJson   String   // TemplateVariable[]
  clausesJson     String   // String[] - IDs of selected clauses
  
  // Legal references (JSON)
  legalReferencesJson String? // LegalReference[]
  
  // Status & usage
  isPublic        Boolean  @default(false)
  isActive        Boolean  @default(true)
  usageCount      Int      @default(0)
  
  // Audit
  createdBy       String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastUsedAt      DateTime?
  
  // Relations
  workspace       Workspace?  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  baseTemplate    ContractTemplate? @relation("TemplateInheritance", fields: [baseTemplateId], references: [id], onDelete: SetNull)
  derivedTemplates ContractTemplate[] @relation("TemplateInheritance")
  versions        ContractTemplateVersion[]
  instances       GeneratedContract[]
  
  @@index([workspaceId])
  @@index([type])
  @@index([isPublic, isActive])
  @@index([usageCount])
}
```

#### ContractTemplateVersion Table

```prisma
model ContractTemplateVersion {
  id              String   @id @default(cuid())
  templateId      String
  version         String
  sectionsJson    String
  variablesJson   String
  clausesJson     String
  changeLog       String?
  createdBy       String
  createdAt       DateTime @default(now())
  
  template        ContractTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  
  @@unique([templateId, version])
  @@index([templateId])
}
```

#### StandardClause Table

```prisma
model StandardClause {
  id              String   @id @default(cuid())
  category        String   // PAYMENT | DELIVERY | WARRANTY | LIABILITY | etc.
  titleEn         String
  titleAr         String
  contentEn       String   @db.Text
  contentAr       String   @db.Text
  
  // Properties
  mandatory       Boolean  @default(false) // Required by Saudi law
  customizable    Boolean  @default(true)  // Can user edit?
  
  // Variables used in this clause (JSON string[])
  variablesJson   String?
  
  // Legal basis
  legalBasis      String?
  frameworkId     String?  // Links to COMPLIANCE_FRAMEWORKS
  
  // Usage tracking
  usageCount      Int      @default(0)
  isActive        Boolean  @default(true)
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([category])
  @@index([mandatory])
  @@index([frameworkId])
}
```

#### GeneratedContract Table

```prisma
model GeneratedContract {
  id              String   @id @default(cuid())
  workspaceId     String
  projectId       String?  // Optional link to TenderProject
  templateId      String
  
  // Instance data
  title           String
  titleAr         String?
  version         Int      @default(1)
  status          String   @default("DRAFT") // DRAFT | REVIEW | APPROVED | EXECUTED
  
  // Variable values (JSON)
  variableValuesJson String @db.Text
  
  // Selected clauses (may differ from template defaults)
  selectedClausesJson String
  
  // Generated content (cached)
  contentMd       String?  @db.Text
  contentHtml     String?  @db.Text
  
  // Parties
  partyAName      String?
  partyBName      String?
  
  // Dates
  effectiveDate   DateTime?
  expiryDate      DateTime?
  executedAt      DateTime?
  
  // Audit
  createdBy       String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project         TenderProject? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  template        ContractTemplate @relation(fields: [templateId], references: [id])
  versions        GeneratedContractVersion[]
  
  @@index([workspaceId])
  @@index([projectId])
  @@index([templateId])
  @@index([status])
}
```

#### GeneratedContractVersion Table

```prisma
model GeneratedContractVersion {
  id              String   @id @default(cuid())
  contractId      String
  version         Int
  variableValuesJson String @db.Text
  selectedClausesJson String
  contentMd       String   @db.Text
  changeLog       String?
  createdBy       String
  createdAt       DateTime @default(now())
  
  contract        GeneratedContract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  
  @@unique([contractId, version])
  @@index([contractId])
}
```

### 8.2 Modified Tables

#### GeneratedProposal Table (Add Layout Field)

```prisma
model GeneratedProposal {
  // ... existing fields ...
  
  // NEW: Layout configuration (JSON)
  layoutConfigJson String? // BilingualLayoutConfig for proposals
  
  // ... rest of fields ...
}
```

#### BrandProfile Table (Add Design Tokens)

```prisma
model BrandProfile {
  // ... existing fields ...
  
  // NEW: Extended design tokens
  neutralColor    String?  @default("#64748B")
  successColor    String?  @default("#059669")
  warningColor    String?  @default("#D97706")
  errorColor      String?  @default("#DC2626")
  
  // NEW: Typography preferences
  fontSizeScale   String?  @default("base") // small | base | large
  fontWeightBold  Int?     @default(700)
  
  // NEW: Spacing preferences
  spacingScale    String?  @default("base") // compact | base | spacious
  
  // ... rest of fields ...
}
```

### 8.3 Migration Scripts

#### Migration 1: Create Contract Template Tables

```sql
-- Create ContractTemplate table
CREATE TABLE "ContractTemplate" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "baseTemplateId" TEXT,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT '1.0',
  "nameEn" TEXT NOT NULL,
  "nameAr" TEXT NOT NULL,
  "descriptionEn" TEXT,
  "descriptionAr" TEXT,
  "jurisdiction" TEXT NOT NULL DEFAULT 'KSA',
  "governingLaw" TEXT NOT NULL DEFAULT 'Saudi Arabian Law',
  "language" TEXT NOT NULL DEFAULT 'BILINGUAL',
  "formality" TEXT NOT NULL DEFAULT 'FORMAL',
  "sectionsJson" TEXT NOT NULL,
  "variablesJson" TEXT NOT NULL,
  "clausesJson" TEXT NOT NULL,
  "legalReferencesJson" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  
  CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractTemplate_workspaceId_idx" ON "ContractTemplate"("workspaceId");
CREATE INDEX "ContractTemplate_type_idx" ON "ContractTemplate"("type");
CREATE INDEX "ContractTemplate_isPublic_isActive_idx" ON "ContractTemplate"("isPublic", "isActive");
CREATE INDEX "ContractTemplate_usageCount_idx" ON "ContractTemplate"("usageCount");

-- Add foreign keys
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_workspaceId_fkey" 
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_baseTemplateId_fkey" 
  FOREIGN KEY ("baseTemplateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

#### Migration 2: Create StandardClause Table

```sql
CREATE TABLE "StandardClause" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "titleEn" TEXT NOT NULL,
  "titleAr" TEXT NOT NULL,
  "contentEn" TEXT NOT NULL,
  "contentAr" TEXT NOT NULL,
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "customizable" BOOLEAN NOT NULL DEFAULT true,
  "variablesJson" TEXT,
  "legalBasis" TEXT,
  "frameworkId" TEXT,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  
  CONSTRAINT "StandardClause_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StandardClause_category_idx" ON "StandardClause"("category");
CREATE INDEX "StandardClause_mandatory_idx" ON "StandardClause"("mandatory");
CREATE INDEX "StandardClause_frameworkId_idx" ON "StandardClause"("frameworkId");
```

#### Migration 3: Seed Standard Clauses

```typescript
// prisma/seed-clauses.ts
import { db } from '../src/lib/db';

const STANDARD_CLAUSES = [
  {
    id: 'payment-milestone-based',
    category: 'PAYMENT',
    titleEn: 'Milestone-Based Payment',
    titleAr: 'الدفع على أساس المراحل',
    contentEn: `Payment shall be made in accordance with the milestone schedule...`,
    contentAr: `يتم الدفع وفقاً لجدول المراحل...`,
    mandatory: false,
    customizable: true,
    variablesJson: JSON.stringify(['payment_days', 'milestone_schedule']),
  },
  // ... more clauses
];

async function seedClauses() {
  for (const clause of STANDARD_CLAUSES) {
    await db.standardClause.upsert({
      where: { id: clause.id },
      update: clause,
      create: clause,
    });
  }
  console.log(`Seeded ${STANDARD_CLAUSES.length} standard clauses`);
}

seedClauses().catch(console.error);
```

### 8.4 Data Migration Strategy

**Existing Contracts → New Schema:**

```typescript
// Migration script: Convert existing contracts to template instances
async function migrateExistingContracts() {
  // 1. Get all existing GeneratedProposal records with type="CONTRACT"
  const contracts = await db.generatedProposal.findMany({
    where: { type: 'CONTRACT' },
  });
  
  // 2. Create default "Legacy Contract" template
  const legacyTemplate = await db.contractTemplate.create({
    data: {
      type: 'CUSTOM',
      nameEn: 'Legacy Contract Template',
      nameAr: 'قالب العقد القديم',
      descriptionEn: 'Migrated from pre-template system',
      descriptionAr: 'تم الترحيل من النظام القديم',
      sectionsJson: JSON.stringify([]),
      variablesJson: JSON.stringify([]),
      clausesJson: JSON.stringify([]),
      isPublic: false,
      isActive: false,
      createdBy: 'system',
    },
  });
  
  // 3. Convert each contract to GeneratedContract instance
  for (const contract of contracts) {
    await db.generatedContract.create({
      data: {
        workspaceId: contract.workspaceId,
        projectId: contract.projectId,
        templateId: legacyTemplate.id,
        title: contract.title,
        titleAr: contract.titleAr,
        version: contract.version,
        status: contract.status,
        variableValuesJson: '{}',
        selectedClausesJson: '[]',
        contentMd: contract.contentMd,
        createdBy: contract.createdById,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
      },
    });
  }
  
  console.log(`Migrated ${contracts.length} contracts to new schema`);
}
```

---

## 9. Conclusion

This architectural design provides a comprehensive blueprint for enhancing Arabclue's document generation systems with:

1. **Bilingual Layout Engine** - Sophisticated side-by-side, stacked, and tabbed rendering
2. **Contract Template Library** - 5+ production-ready Saudi-compliant templates
3. **Enhanced Proposal Layouts** - Modern, professional document designs
4. **Universal Design System** - Consistent tokens, components, and standards
5. **Template Management UI** - Self-service template creation and customization

### Key Benefits

**For Users:**
- ✅ Create custom contracts without coding
- ✅ Generate bilingual documents seamlessly
- ✅ Professional, modern document layouts
- ✅ Faster proposal/contract generation
- ✅ Saudi law compliance built-in

**For the Platform:**
- ✅ Reusable component architecture
- ✅ Scalable template system
- ✅ Consistent brand experience
- ✅ Reduced maintenance burden
- ✅ Competitive advantage in Saudi market

### Success Metrics

**Adoption:**
- 80%+ of workspaces use templates within 3 months
- 500+ contracts generated from templates in first month
- 50+ custom templates created by users

**Quality:**
- 90%+ user satisfaction with new layouts
- <5 critical bugs in production
- 95%+ legal compliance validation pass rate

**Performance:**
- PDF generation < 2s average
- Template substitution < 50ms
- Full package export < 3s

### Next Steps

1. **Review & Approval** - Stakeholder sign-off on design
2. **Resource Allocation** - Assign development team
3. **Phase 1 Kickoff** - Begin design token system
4. **Weekly Progress Reviews** - Track against roadmap
5. **Beta Testing** - Engage early adopters for feedback

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-24  
**Status:** Ready for Implementation  
**Estimated Total Effort:** 18-24 weeks (4.5-6 months)

