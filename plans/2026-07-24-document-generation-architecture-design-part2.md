# Arabclue Document Generation Systems: Architecture Design (Part 2)

> **Superseded planning record.** Examples below are historical design
> sketches and may contain APIs or raw-template patterns that were deliberately
> not implemented. They are not safe production examples or compliance claims.

## 4. Enhanced Proposal Layout Specifications (Continued)

### 4.1 Visual Design System (Continued)

#### Typography System (Continued)

```css
:root {
  /* Font families */
  --font-ar: 'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', sans-serif;
  --font-en: 'Space Grotesk', 'Inter', 'IBM Plex Sans', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  /* Font sizes (responsive scale) */
  --text-xs: 0.75rem;     /* 12px */
  --text-sm: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  --text-3xl: 1.875rem;   /* 30px */
  --text-4xl: 2.25rem;    /* 36px */
  
  /* Line heights */
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  --leading-loose: 2;
  
  /* Font weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}

/* Apply font by language */
[lang="ar"] { font-family: var(--font-ar); }
[lang="en"] { font-family: var(--font-en); }
code, pre { font-family: var(--font-mono); }

/* Typography scale */
h1 { font-size: var(--text-4xl); font-weight: var(--font-bold); line-height: var(--leading-tight); }
h2 { font-size: var(--text-3xl); font-weight: var(--font-bold); line-height: var(--leading-tight); }
h3 { font-size: var(--text-2xl); font-weight: var(--font-semibold); line-height: var(--leading-snug); }
h4 { font-size: var(--text-xl); font-weight: var(--font-semibold); line-height: var(--leading-snug); }
body { font-size: var(--text-base); line-height: var(--leading-relaxed); }
small { font-size: var(--text-sm); }
```

#### Spacing System

```css
:root {
  /* Spacing scale (8px base unit) */
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  
  /* Semantic spacing */
  --section-gap: var(--space-12);
  --subsection-gap: var(--space-8);
  --paragraph-gap: var(--space-4);
  --inline-gap: var(--space-2);
}
```

### 4.2 Proposal Section Structure

#### Modern Cover Page

```typescript
interface CoverPageData {
  // Logo & Branding
  logoUrl?: string;
  companyName: string;
  companyNameAr: string;
  tagline?: string;
  taglineAr?: string;
  
  // Proposal Info
  proposalTitle: string;
  proposalTitleAr: string;
  proposalType: string;
  version: string;
  
  // Client Info
  clientName: string;
  etimadRef?: string;
  rfpNumber?: string;
  
  // Dates
  submissionDate: Date;
  validityPeriod: string;
  
  // Compliance Score (visual badge)
  complianceScore?: number;
}

function generateCoverPage(data: CoverPageData, brand: BrandProfile): string {
  return `
    <div class="cover-page" style="
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: linear-gradient(135deg, ${brand.primaryColor}, ${brand.accentColor});
      color: white;
      padding: var(--space-16) var(--space-12);
      position: relative;
    ">
      <!-- Top: Logo & Company -->
      <header class="cover-header">
        ${data.logoUrl ? `<img src="${data.logoUrl}" alt="logo" class="cover-logo" />` : ''}
        <div class="cover-company">
          <h1 class="company-name" lang="ar">${data.companyNameAr}</h1>
          <h2 class="company-name-en" lang="en">${data.companyName}</h2>
          ${data.taglineAr ? `<p class="tagline" lang="ar">${data.taglineAr}</p>` : ''}
        </div>
      </header>
      
      <!-- Center: Proposal Title -->
      <div class="cover-title">
        <div class="badge">${data.proposalType} | v${data.version}</div>
        <h1 class="proposal-title" lang="ar">${data.proposalTitleAr}</h1>
        <h2 class="proposal-title-en" lang="en">${data.proposalTitle}</h2>
      </div>
      
      <!-- Bottom: Meta Info -->
      <footer class="cover-meta">
        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">للعميل | For Client</span>
            <span class="meta-value">${data.clientName}</span>
          </div>
          ${data.etimadRef ? `
          <div class="meta-item">
            <span class="meta-label">رقم اعتماد | Etimad Ref</span>
            <span class="meta-value">${data.etimadRef}</span>
          </div>` : ''}
          <div class="meta-item">
            <span class="meta-label">تاريخ التقديم | Submission Date</span>
            <span class="meta-value">${formatDate(data.submissionDate)}</span>
          </div>
          ${data.complianceScore ? `
          <div class="meta-item compliance-badge">
            <span class="meta-label">الامتثال | Compliance</span>
            <span class="meta-value">${data.complianceScore}%</span>
            <div class="score-ring">
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="3"/>
                <circle cx="18" cy="18" r="16" fill="none" stroke="white" stroke-width="3" 
                  stroke-dasharray="${data.complianceScore}, 100" 
                  transform="rotate(-90 18 18)"/>
              </svg>
            </div>
          </div>` : ''}
        </div>
      </footer>
      
      <!-- Decorative element -->
      <div class="cover-decoration"></div>
    </div>
  `;
}
```

#### Executive Summary (Bilingual)

```typescript
interface ExecutiveSummaryData {
  summaryEn: string;
  summaryAr: string;
  keyPoints: Array<{ en: string; ar: string }>;
  vision2030Alignment?: string;
  complianceHighlights: Array<{ framework: string; score: number }>;
}

function generateExecutiveSummary(data: ExecutiveSummaryData): string {
  return `
    <section class="executive-summary">
      <header class="section-header">
        <h2 class="section-title" lang="ar">الملخص التنفيذي</h2>
        <h3 class="section-title-en" lang="en">Executive Summary</h3>
      </header>
      
      <!-- Key highlights cards -->
      <div class="highlights-grid">
        ${data.keyPoints.map(point => `
          <div class="highlight-card">
            <p lang="ar">${point.ar}</p>
            <p lang="en">${point.en}</p>
          </div>
        `).join('')}
      </div>
      
      <!-- Bilingual content blocks -->
      <div class="bilingual-content">
        <div class="content-ar" lang="ar" dir="rtl">
          ${markdownToHtml(data.summaryAr)}
        </div>
        <div class="content-divider"></div>
        <div class="content-en" lang="en" dir="ltr">
          ${markdownToHtml(data.summaryEn)}
        </div>
      </div>
      
      <!-- Compliance overview -->
      ${data.complianceHighlights.length > 0 ? `
        <div class="compliance-overview">
          <h4>نظرة عامة على الامتثال | Compliance Overview</h4>
          <div class="compliance-bars">
            ${data.complianceHighlights.map(c => `
              <div class="compliance-item">
                <span class="framework-name">${c.framework}</span>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${c.score}%"></div>
                </div>
                <span class="score">${c.score}%</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </section>
  `;
}
```

#### Technical Approach Section

```typescript
interface TechnicalApproachData {
  methodology: string;
  phases: Array<{
    id: number;
    nameEn: string;
    nameAr: string;
    duration: string;
    deliverables: string[];
  }>;
  architecture?: {
    description: string;
    diagram?: string; // SVG or image URL
  };
  technologies: string[];
}

function generateTechnicalApproach(data: TechnicalApproachData): string {
  return `
    <section class="technical-approach">
      <header class="section-header">
        <h2 lang="ar">المنهجية الفنية</h2>
        <h3 lang="en">Technical Approach & Methodology</h3>
      </header>
      
      <!-- Methodology overview -->
      <div class="methodology-intro">
        <p>${data.methodology}</p>
      </div>
      
      <!-- Phase timeline -->
      <div class="phases-timeline">
        ${data.phases.map((phase, idx) => `
          <div class="phase-card" style="--phase-order: ${idx}">
            <div class="phase-number">${String(phase.id).padStart(2, '0')}</div>
            <div class="phase-content">
              <h4 class="phase-name">
                <span lang="ar">${phase.nameAr}</span>
                <span class="divider">|</span>
                <span lang="en">${phase.nameEn}</span>
              </h4>
              <p class="phase-duration">${phase.duration}</p>
              <ul class="phase-deliverables">
                ${phase.deliverables.map(d => `<li>${d}</li>`).join('')}
              </ul>
            </div>
            ${idx < data.phases.length - 1 ? '<div class="phase-connector"></div>' : ''}
          </div>
        `).join('')}
      </div>
      
      ${data.architecture ? `
        <div class="architecture-section">
          <h4>معمارية الحل | Solution Architecture</h4>
          ${data.architecture.diagram ? `
            <div class="architecture-diagram">
              <img src="${data.architecture.diagram}" alt="Architecture" />
            </div>
          ` : ''}
          <p>${data.architecture.description}</p>
        </div>
      ` : ''}
      
      <!-- Technology stack -->
      ${data.technologies.length > 0 ? `
        <div class="tech-stack">
          <h4>المجموعة التقنية | Technology Stack</h4>
          <div class="tech-badges">
            ${data.technologies.map(tech => `
              <span class="tech-badge">${tech}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </section>
  `;
}
```

#### Financial Summary Section

```typescript
interface FinancialSummaryData {
  totalValue: number;
  currency: string;
  breakdown: Array<{
    category: string;
    categoryAr: string;
    amount: number;
    percentage: number;
  }>;
  paymentTerms: string;
  paymentTermsAr: string;
  vatIncluded: boolean;
  qualifications: {
    quickLiquidityRatio?: number;
    qlrPasses?: boolean;
    saudizationPercent?: number;
    localContentPreference?: number;
  };
}

function generateFinancialSummary(data: FinancialSummaryData): string {
  const locale = 'ar-SA';
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: data.currency,
  }).format(data.totalValue);
  
  return `
    <section class="financial-summary">
      <header class="section-header">
        <h2 lang="ar">الملخص المالي</h2>
        <h3 lang="en">Financial Summary</h3>
      </header>
      
      <!-- Total value highlight -->
      <div class="total-value-card">
        <span class="label">القيمة الإجمالية | Total Contract Value</span>
        <span class="amount">${formatted}</span>
        ${data.vatIncluded ? '<span class="vat-notice">شاملة ضريبة 15% | Including 15% VAT</span>' : ''}
      </div>
      
      <!-- Cost breakdown -->
      <div class="cost-breakdown">
        <h4>توزيع التكاليف | Cost Breakdown</h4>
        <table class="breakdown-table">
          <thead>
            <tr>
              <th lang="ar">الفئة</th>
              <th lang="en">Category</th>
              <th>المبلغ | Amount</th>
              <th>النسبة | %</th>
            </tr>
          </thead>
          <tbody>
            ${data.breakdown.map(item => `
              <tr>
                <td lang="ar">${item.categoryAr}</td>
                <td lang="en">${item.category}</td>
                <td>${new Intl.NumberFormat(locale, { style: 'currency', currency: data.currency }).format(item.amount)}</td>
                <td>${item.percentage}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <!-- Payment terms -->
      <div class="payment-terms">
        <h4>شروط الدفع | Payment Terms</h4>
        <div class="bilingual-text">
          <p lang="ar">${data.paymentTermsAr}</p>
          <p lang="en">${data.paymentTerms}</p>
        </div>
      </div>
      
      <!-- Financial qualifications -->
      ${Object.keys(data.qualifications).length > 0 ? `
        <div class="financial-qualifications">
          <h4>التأهيل المالي | Financial Qualification</h4>
          <div class="qualification-grid">
            ${data.qualifications.quickLiquidityRatio != null ? `
              <div class="qual-item ${data.qualifications.qlrPasses ? 'pass' : 'pending'}">
                <span class="qual-label">نسبة السيولة السريعة | Quick Liquidity Ratio</span>
                <span class="qual-value">${data.qualifications.quickLiquidityRatio.toFixed(2)}</span>
              </div>
            ` : ''}
            ${data.qualifications.saudizationPercent != null ? `
              <div class="qual-item">
                <span class="qual-label">نسبة السعودة | Saudization</span>
                <span class="qual-value">${data.qualifications.saudizationPercent}%</span>
              </div>
            ` : ''}
            ${data.qualifications.localContentPreference != null ? `
              <div class="qual-item">
                <span class="qual-label">تفضيل المحتوى المحلي | Local Content Preference</span>
                <span class="qual-value">${data.qualifications.localContentPreference}%</span>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
      
      <!-- Disclaimer -->
      <div class="financial-disclaimer">
        <p lang="ar">الأسعار المذكورة إرشادية. يتم إدخال الأسعار النهائية من قبل العميل.</p>
        <p lang="en">Prices shown are indicative. Final prices are entered by the client.</p>
      </div>
    </section>
  `;
}
```

### 4.3 Component Library

#### Reusable Components

```typescript
// Component registry
const ProposalComponents = {
  // Info Cards
  InfoCard: (props: { titleAr: string; titleEn: string; content: string }) => `
    <div class="info-card">
      <h5 class="card-title">
        <span lang="ar">${props.titleAr}</span>
        <span class="separator">•</span>
        <span lang="en">${props.titleEn}</span>
      </h5>
      <div class="card-content">${props.content}</div>
    </div>
  `,
  
  // Status Badge
  StatusBadge: (props: { status: string; label: string; color: string }) => `
    <span class="status-badge" style="--badge-color: ${props.color}">
      ${props.label}
    </span>
  `,
  
  // Data Table
  DataTable: (props: { 
    headersAr: string[];
    headersEn: string[];
    rows: any[][];
  }) => `
    <table class="data-table">
      <thead>
        <tr>
          ${props.headersAr.map((h, i) => `
            <th>
              <span lang="ar">${h}</span><br/>
              <small lang="en">${props.headersEn[i]}</small>
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        ${props.rows.map(row => `
          <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    </table>
  `,
  
  // Progress Indicator
  ProgressBar: (props: { label: string; percentage: number; color?: string }) => `
    <div class="progress-indicator">
      <div class="progress-header">
        <span class="progress-label">${props.label}</span>
        <span class="progress-percentage">${props.percentage}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="
          width: ${props.percentage}%;
          background: ${props.color || 'var(--primary-color)'};
        "></div>
      </div>
    </div>
  `,
  
  // Callout Box
  CalloutBox: (props: { type: 'info' | 'warning' | 'success'; content: string }) => `
    <div class="callout callout-${props.type}">
      <div class="callout-icon">${getCalloutIcon(props.type)}</div>
      <div class="callout-content">${props.content}</div>
    </div>
  `,
};

function getCalloutIcon(type: string): string {
  const icons = {
    info: '💡',
    warning: '⚠️',
    success: '✅',
  };
  return icons[type] || 'ℹ️';
}
```

### 4.4 Chart & Visualization Templates

#### Chart Configuration

```typescript
interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'donut' | 'gauge';
  title: { ar: string; en: string };
  data: ChartDataPoint[];
  colors: string[];
  rtl?: boolean;
}

interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

// Generate chart as SVG (for PDF compatibility)
function generateChartSVG(config: ChartConfig): string {
  switch (config.type) {
    case 'bar':
      return generateBarChart(config);
    case 'pie':
      return generatePieChart(config);
    case 'gauge':
      return generateGaugeChart(config);
    default:
      return '';
  }
}

function generateBarChart(config: ChartConfig): string {
  const width = 600;
  const height = 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const maxValue = Math.max(...config.data.map(d => d.value));
  const barWidth = chartWidth / config.data.length - 10;
  
  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Title -->
      <text x="${width/2}" y="20" text-anchor="middle" font-size="16" font-weight="bold">
        ${config.title.ar} | ${config.title.en}
      </text>
      
      <!-- Chart area -->
      <g transform="translate(${padding.left}, ${padding.top})">
        <!-- Y-axis -->
        <line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="#E2E8F0" stroke-width="2"/>
        
        <!-- X-axis -->
        <line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" 
          stroke="#E2E8F0" stroke-width="2"/>
        
        <!-- Bars -->
        ${config.data.map((d, i) => {
          const barHeight = (d.value / maxValue) * chartHeight;
          const x = i * (chartWidth / config.data.length) + 5;
          const y = chartHeight - barHeight;
          return `
            <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}"
              fill="${d.color || config.colors[i % config.colors.length]}"
              opacity="0.9"/>
            <text x="${x + barWidth/2}" y="${y - 5}" text-anchor="middle" font-size="12">
              ${d.value}
            </text>
            <text x="${x + barWidth/2}" y="${chartHeight + 20}" 
              text-anchor="middle" font-size="11" transform="rotate(-45 ${x + barWidth/2} ${chartHeight + 20})">
              ${d.label}
            </text>
          `;
        }).join('')}
      </g>
    </svg>
  `;
}

function generateGaugeChart(config: ChartConfig): string {
  const percentage = config.data[0]?.value || 0;
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  
  return `
    <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <!-- Background circle -->
      <circle cx="100" cy="100" r="${radius}" fill="none" 
        stroke="#E2E8F0" stroke-width="20"/>
      
      <!-- Progress circle -->
      <circle cx="100" cy="100" r="${radius}" fill="none"
        stroke="${config.colors[0]}" stroke-width="20"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${offset}"
        transform="rotate(-90 100 100)"
        stroke-linecap="round"/>
      
      <!-- Center text -->
      <text x="100" y="95" text-anchor="middle" font-size="32" font-weight="bold">
        ${percentage}%
      </text>
      <text x="100" y="115" text-anchor="middle" font-size="12" fill="#64748B">
        ${config.title.en}
      </text>
    </svg>
  `;
}
```

---

## 5. Universal Layout Standards

### 5.1 Design Token System

#### Complete Token Definitions

```typescript
interface DesignTokens {
  // Colors
  colors: {
    primary: ColorScale;
    secondary: ColorScale;
    accent: ColorScale;
    neutral: ColorScale;
    semantic: SemanticColors;
  };
  
  // Typography
  typography: {
    fontFamilies: FontFamilies;
    fontSizes: FontSizes;
    fontWeights: FontWeights;
    lineHeights: LineHeights;
    letterSpacing: LetterSpacing;
  };
  
  // Spacing
  spacing: SpacingScale;
  
  // Layout
  layout: {
    breakpoints: Breakpoints;
    containers: ContainerSizes;
    columns: ColumnConfig;
  };
  
  // Effects
  effects: {
    shadows: Shadows;
    borders: Borders;
    borderRadius: BorderRadius;
    transitions: Transitions;
  };
}

type ColorScale = {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string; // Base color
  600: string;
  700: string;
  800: string;
  900: string;
};

type SemanticColors = {
  success: string;
  warning: string;
  error: string;
  info: string;
};

// Complete design tokens
export const ARABCLUE_DESIGN_TOKENS: DesignTokens = {
  colors: {
    primary: {
      50: '#F0FDFA',
      100: '#CCFBF1',
      200: '#99F6E4',
      300: '#5EEAD4',
      400: '#2DD4BF',
      500: '#14B8A6', // Base
      600: '#0D9488',
      700: '#0F766E',
      800: '#115E59',
      900: '#134E4A',
    },
    secondary: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A', // Base
    },
    accent: {
      50: '#FFFBEB',
      100: '#FEF3C7',
      200: '#FDE68A',
      300: '#FCD34D',
      400: '#FBBF24',
      500: '#F59E0B',
      600: '#D97706', // Base (Saudi gold)
      700: '#B45309',
      800: '#92400E',
      900: '#78350F',
    },
    neutral: {
      50: '#FAFAFA',
      100: '#F5F5F5',
      200: '#E5E5E5',
      300: '#D4D4D4',
      400: '#A3A3A3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
    },
    semantic: {
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
      info: '#0EA5E9',
    },
  },
  
  typography: {
    fontFamilies: {
      arabic: "'IBM Plex Sans Arabic', 'Cairo', 'Tajawal', sans-serif",
      english: "'Space Grotesk', 'Inter', 'IBM Plex Sans', sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', monospace",
    },
    fontSizes: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem', // 36px
      '5xl': '3rem',    // 48px
    },
    fontWeights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    lineHeights: {
      tight: 1.25,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2,
    },
    letterSpacing: {
      tighter: '-0.05em',
      tight: '-0.025em',
      normal: '0',
      wide: '0.025em',
      wider: '0.05em',
      widest: '0.1em',
    },
  },
  
  spacing: {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
    24: '6rem',     // 96px
    32: '8rem',     // 128px
  },
  
  layout: {
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    containers: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    columns: {
      1: '100%',
      2: '50%',
      3: '33.333%',
      4: '25%',
      6: '16.667%',
      12: '8.333%',
    },
  },
  
  effects: {
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      base: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
      '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    },
    borders: {
      none: '0',
      thin: '1px',
      base: '2px',
      thick: '4px',
    },
    borderRadius: {
      none: '0',
      sm: '0.25rem',  // 4px
      base: '0.5rem',  // 8px
      md: '0.75rem',   // 12px
      lg: '1rem',      // 16px
      full: '9999px',
    },
    transitions: {
      fast: '150ms',
      base: '200ms',
      slow: '300ms',
      slower: '500ms',
    },
  },
};
```

### 5.2 CSS Variable Export

```css
:root {
  /* Colors - Primary */
  --color-primary-50: #F0FDFA;
  --color-primary-500: #14B8A6;
  --color-primary-700: #0F766E;
  --color-primary-900: #134E4A;
  
  /* Colors - Secondary */
  --color-secondary-50: #F8FAFC;
  --color-secondary-500: #64748B;
  --color-secondary-900: #0F172A;
  
  /* Colors - Accent */
  --color-accent-500: #F59E0B;
  --color-accent-600: #D97706;
  
  /* Colors - Semantic */
  --color-success: #059669;
  --color-warning: #D97706;
  --color-error: #DC2626;
  --color-info: #0EA5E9;
  
  /* Typography */
  --font-ar: 'IBM Plex Sans Arabic', 'Cairo', sans-serif;
  --font-en: 'Space Grotesk', 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;
  
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  
  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  
  /* Effects */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
  
  --transition-fast: 150ms;
  --transition-base: 200ms;
}

/* Brand-aware overrides (applied via inline style or class) */
[data-brand-primary] {
  --color-primary-500: var(--brand-primary, #14B8A6);
}
```

### 5.3 Component Style Guidelines

#### Button Styles

```css
.btn {
  font-family: inherit;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: all var(--transition-base);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.btn-primary {
  background: var(--color-primary-600);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-700);
  box-shadow: var(--shadow-md);
}

.btn-secondary {
  background: var(--color-secondary-100);
  color: var(--color-secondary-900);
}

.btn-outline {
  background: transparent;
  border: 2px solid var(--color-primary-600);
  color: var(--color-primary-600);
}
```

#### Card Styles

```css
.card {
  background: white;
  border: 1px solid var(--color-secondary-200);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-base);
}

.card:hover {
  box-shadow: var(--shadow-md);
}

.card-header {
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-secondary-200);
}

.card-title {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--color-secondary-900);
  margin: 0;
}

.card-body {
  color: var(--color-secondary-700);
  line-height: var(--leading-relaxed);
}
```

#### Table Styles

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.table thead {
  background: var(--color-secondary-50);
}

.table th {
  padding: var(--space-3) var(--space-4);
  text-align: start;
  font-weight: var(--font-semibold);
  color: var(--color-secondary-900);
  border-bottom: 2px solid var(--color-secondary-200);
}

.table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-secondary-200);
  color: var(--color-secondary-700);
}

.table tbody tr:hover {
  background: var(--color-secondary-50);
}

.table tbody tr:last-child td {
  border-bottom: none;
}
```

### 5.4 Print Optimization Guidelines

```css
@media print {
  /* Reset page margins */
  @page {
    size: A4;
    margin: 18mm 14mm;
  }
  
  /* Hide interactive elements */
  .no-print,
  button,
  .interactive {
    display: none !important;
  }
  
  /* Force page breaks */
  .page-break {
    page-break-before: always;
  }
  
  .avoid-break {
    page-break-inside: avoid;
  }
  
  /* Optimize colors for print */
  body {
    color: #000;
    background: #fff;
  }
  
  /* Remove shadows */
  * {
    box-shadow: none !important;
  }
  
  /* Ensure borders print */
  table,
  .card {
    border: 1px solid #000 !important;
  }
  
  /* Font sizes for print */
  body {
    font-size: 11pt;
  }
  
  h1 { font-size: 24pt; }
  h2 { font-size: 18pt; }
  h3 { font-size: 14pt; }
  h4 { font-size: 12pt; }
}
```

### 5.5 Consistency Checklist

**All documents must:**

- ✅ Use design tokens for all colors, spacing, typography
- ✅ Apply brand colors from `BrandProfile` via CSS variables
- ✅ Support both Arabic (RTL) and English (LTR) layouts
- ✅ Include proper `lang` and `dir` attributes on all text
- ✅ Use semantic HTML (`<article>`, `<section>`, `<header>`, `<footer>`)
- ✅ Include page numbers in footer (PDF)
- ✅ Add letterhead/branding in header (via `letterhead.ts`)
- ✅ Implement proper print styles (`@media print`)
- ✅ Include legal disclaimer for compliance content
- ✅ Use consistent spacing scale (8px base unit)
- ✅ Apply consistent typography hierarchy
- ✅ Include accessibility attributes (ARIA labels where needed)

---

## 6. Template Management UI Design

### 6.1 UI Component Architecture

#### Template Browser

```typescript
interface TemplateBrowserProps {
  view: 'grid' | 'list';
  filter: {
    type?: ContractType;
    jurisdiction?: string;
    search?: string;
  };
  sort: 'name' | 'usage' | 'updated' | 'created';
  workspaceId: string;
}

function TemplateBrowser({ view, filter, sort, workspaceId }: TemplateBrowserProps) {
  return `
    <div class="template-browser">
      <!-- Toolbar -->
      <div class="browser-toolbar">
        <!-- View toggle -->
        <div class="view-toggle">
          <button class="view-btn ${view === 'grid' ? 'active' : ''}" data-view="grid">
            <GridIcon /> شبكة
          </button>
          <button class="view-btn ${view === 'list' ? 'active' : ''}" data-view="list">
            <ListIcon /> قائمة
          </button>
        </div>
        
        <!-- Filters -->
        <div class="filters">
          <select class="filter-select" name="type">
            <option value="">نوع العقد | Contract Type</option>
            <option value="SERVICE_AGREEMENT">اتفاقية الخدمات</option>
            <option value="PROCUREMENT_CONTRACT">عقد المشتريات</option>
            <option value="NDA">اتفاقية السرية</option>
            <!-- ... more options -->
          </select>
          
          <select class="filter-select" name="jurisdiction">
            <option value="">الاختصاص | Jurisdiction</option>
            <option value="KSA">المملكة العربية السعودية</option>
            <option value="GCC">دول مجلس التعاون</option>
          </select>
        </div>
        
        <!-- Search -->
        <div class="search-box">
          <input type="search" placeholder="بحث في القوالب | Search templates..." />
        </div>
        
        <!-- Sort -->
        <select class="sort-select">
          <option value="name">الاسم | Name</option>
          <option value="usage">الأكثر استخداماً | Most Used</option>
          <option value="updated">آخر تحديث | Recently Updated</option>
        </select>
        
        <!-- Create button -->
        <button class="btn btn-primary">
          <PlusIcon /> قالب جديد | New Template
        </button>
      </div>
      
      <!-- Template grid/list -->
      <div class="template-${view}">
        <!-- Template cards dynamically rendered -->
      </div>
    </div>
  `;
}
```

#### Template Card (Grid View)

```typescript
interface TemplateCardData {
  id: string;
  nameAr: string;
  nameEn: string;
  type: ContractType;
  usageCount: number;
  lastUsed?: Date;
  isPublic: boolean;
  thumbnail?: string;
}

function TemplateCard(template: TemplateCardData) {
  return `
    <div class="template-card" data-template-id="${template.id}">
      <!-- Thumbnail/Preview -->
      <div class="card-thumbnail">
        ${template.thumbnail 
          ? `<img src="${template.thumbnail}" alt="Preview" />`
          : `<div class="card-placeholder">${getTemplateIcon(template.type)}</div>`
        }
        ${template.isPublic ? '<span class="badge badge-public">عام | Public</span>' : ''}
      </div>
      
      <!-- Content -->
      <div class="card-content">
        <h3 class="card-title">
          <span lang="ar">${template.nameAr}</span>
          <span lang="en" class="text-muted">${template.nameEn}</span>
        </h3>
        
        <div class="card-meta">
          <span class="meta-item">
            <UsersIcon /> ${template.usageCount} استخدام
          </span>
          ${template.lastUsed ? `
            <span class="meta-item">
              <ClockIcon /> ${formatRelativeTime(template.lastUsed)}
            </span>
          ` : ''}
        </div>
      </div>
      
      <!-- Actions -->
      <div class="card-actions">
        <button class="btn btn-sm btn-primary" data-action="use">
          استخدام | Use
        </button>
        <button class="btn btn-sm btn-outline" data-action="preview">
          معاينة | Preview
        </button>
        <button class="btn btn-sm btn-icon" data-action="more">
          <MoreIcon />
        </button>
      </div>
    </div>
  `;
}
```

### 6.2 Template Editor UI

#### WYSIWYG Editor Interface

```typescript
interface TemplateEditorState {
  template: ContractTemplate;
  activeSection: string;
  previewMode: 'source' | 'preview' | 'split';
  variables: Record<string, any>; // For preview rendering
}

function TemplateEditor({ template, activeSection, previewMode, variables }: TemplateEditorState) {
  return `
    <div class="template-editor">
      <!-- Editor toolbar -->
      <div class="editor-toolbar">
        <div class="toolbar-left">
          <button class="btn btn-sm" data-action="save">
            <SaveIcon /> حفظ | Save
          </button>
          <button class="btn btn-sm" data-action="save-as">
            <CopyIcon /> حفظ كـ | Save As
          </button>
          <div class="toolbar-divider"></div>
          <button class="btn btn-sm" data-action="undo">
            <UndoIcon />
          </button>
          <button class="btn btn-sm" data-action="redo">
            <RedoIcon />
          </button>
        </div>
        
        <div class="toolbar-center">
          <!-- View mode toggle -->
          <div class="view-mode-toggle">
            <button class="${previewMode === 'source' ? 'active' : ''}" data-mode="source">
              <CodeIcon /> مصدر
            </button>
            <button class="${previewMode === 'split' ? 'active' : ''}" data-mode="split">
              <SplitIcon /> تقسيم
            </button>
            <button class="${previewMode === 'preview' ? 'active' : ''}" data-mode="preview">
              <EyeIcon /> معاينة
            </button>
          </div>
        </div>
        
        <div class="toolbar-right">
          <button class="btn btn-sm" data-action="export">
            <DownloadIcon /> تصدير | Export
          </button>
          <button class="btn btn-sm" data-action="share">
            <ShareIcon /> مشاركة | Share
          </button>
        </div>
      </div>
      
      <!-- Editor layout -->
      <div class="editor-layout">
        <!-- Left sidebar: Sections & Variables -->
        <aside class="editor-sidebar">
          <div class="sidebar-tabs">
            <button class="tab active" data-tab="sections">
              <LayersIcon /> الأقسام
            </button>
            <button class="tab" data-tab="variables">
              <VariableIcon /> المتغيرات
            </button>
            <button class="tab" data-tab="clauses">
              <ListIcon /> البنود
            </button>
          </div>
          
          <div class="sidebar-content" data-active-tab="sections">
            ${renderSectionsList(template.sections, activeSection)}
          </div>
        </aside>
        
        <!-- Main editor area -->
        <div class="editor-main">
          ${previewMode === 'split' 
            ? renderSplitEditor(template, activeSection, variables)
            : previewMode === 'preview'
            ? renderPreview(template, variables)
            : renderSourceEditor(template, activeSection)
          }
        </div>
        
        <!-- Right panel: Properties -->
        <aside class="editor-properties">
          <h4>خصائص القسم | Section Properties</h4>
          ${renderSectionProperties(template, activeSection)}
        </aside>
      </div>
    </div>
  `;
}

function renderSplitEditor(template: ContractTemplate, activeSection: string, variables: Record<string, any>) {
  return `
    <div class="split-editor">
      <!-- Left: Source -->
      <div class="split-pane split-source">
        <div class="pane-header">
          <h4>المصدر | Source</h4>
        </div>
        <div class="editor-wrapper">
          <textarea class="code-editor" data-language="markdown">
${getSectionContent(template, activeSection)}
          </textarea>
        </div>
      </div>
      
      <div class="split-divider"></div>
      
      <!-- Right: Preview -->
      <div class="split-pane split-preview">
        <div class="pane-header">
          <h4>المعاينة | Preview</h4>
        </div>
        <div class="preview-wrapper">
          ${renderSectionPreview(template, activeSection, variables)}
        </div>
      </div>
    </div>
  `;
}
```

### 6.3 Variable Mapping Interface

```typescript
interface VariableMappingProps {
  variable: TemplateVariable;
  value: any;
  projectData?: any; // Available project data for auto-mapping
}

function VariableMappingUI({ variable, value, projectData }: VariableMappingProps) {
  return `
    <div class="variable-mapping">
      <div class="variable-header">
        <label class="variable-label">
          <span lang="ar">${variable.labelAr}</span>
          <span lang="en" class="text-muted">${variable.labelEn}</span>
          ${variable.required ? '<span class="required">*</span>' : ''}
        </label>
        ${variable.descriptionAr ? `
          <p class="variable-description">
            <span lang="ar">${variable.descriptionAr}</span>
            ${variable.descriptionEn ? `<span lang="en" class="text-muted"> | ${variable.descriptionEn}</span>` : ''}
          </p>
        ` : ''}
      </div>
      
      <div class="variable-input">
        ${renderVariableInput(variable, value)}
      </div>
      
      ${projectData ? `
        <div class="variable-suggestions">
          <button class="btn btn-sm btn-outline" data-action="auto-fill">
            <MagicIcon /> ملء تلقائي | Auto-fill from project
          </button>
        </div>
      ` : ''}
      
      ${variable.validation ? `
        <div class="variable-validation">
          <span class="validation-hint">${variable.validation.errorMessageAr}</span>
        </div>
      ` : ''}
    </div>
  `;
}

function renderVariableInput(variable: TemplateVariable, value: any): string {
  switch (variable.type) {
    case 'text':
      return `<input type="text" class="form-input" 
        value="${value || ''}" 
        placeholder="${variable.placeholder?.ar || ''}" 
        ${variable.required ? 'required' : ''} />`;
    
    case 'date':
      return `<input type="date" class="form-input" 
        value="${value || ''}" 
        ${variable.required ? 'required' : ''} />`;
    
    case 'currency':
      return `
        <div class="input-group">
          <span class="input-prefix">${variable.format || 'SAR'}</span>
          <input type="number" class="form-input" 
            value="${value || ''}" 
            step="0.01"
            ${variable.required ? 'required' : ''} />
        </div>
      `;
    
    case 'percentage':
      return `
        <div class="input-group">
          <input type="number" class="form-input" 
            value="${value || ''}" 
            min="0" max="100" step="0.1"
            ${variable.required ? 'required' : ''} />
          <span class="input-suffix">%</span>
        </div>
      `;
    
    case 'list':
      return `
        <div class="list-input">
          ${(value || []).map((item: string, i: number) => `
            <div class="list-item">
              <input type="text" value="${item}" data-index="${i}" />
              <button class="btn btn-sm btn-icon" data-action="remove" data-index="${i}">
                <XIcon />
              </button>
            </div>
          `).join('')}
          <button class="btn btn-sm btn-outline" data-action="add-item">
            <PlusIcon /> إضافة | Add Item
          </button>
        </div>
      `;
    
    default:
      return `<input type="text" class="form-input" value="${value || ''}" />`;
  }
}
```

### 6.4 Clause Selection UI

```typescript
interface ClauseSelectionProps {
  template: ContractTemplate;
  selectedClauses: string[];
  availableClauses: StandardClause[];
}

function ClauseSelectionUI({ template, selectedClauses, availableClauses }: ClauseSelectionProps) {
  const groupedClauses = groupBy(availableClauses, c => c.category);
  
  return `
    <div class="clause-selection">
      <div class="selection-header">
        <h3>اختيار البنود | Select Clauses</h3>
        <p class="text-muted">
          اختر البنود القانونية المناسبة لعقدك | Choose appropriate legal clauses for your contract
        </p>
      </div>
      
      <div class="clause-categories">
        ${Object.entries(groupedClauses).map(([category, clauses]) => `
          <div class="clause-category">
            <h4 class="category-title">
              ${getCategoryLabel(category)}
              <span class="category-count">${clauses.length}</span>
            </h4>
            
            <div class="clause-list">
              ${clauses.map(clause => `
                <div class="clause-item ${selectedClauses.includes(clause.id) ? 'selected' : ''}">
                  <label class="clause-checkbox">
                    <input type="checkbox" 
                      value="${clause.id}"
                      ${selectedClauses.includes(clause.id) ? 'checked' : ''}
                      ${clause.mandatory ? 'disabled checked' : ''} />
                    <div class="clause-content">
                      <div class="clause-header">
                        <span class="clause-title" lang="ar">${clause.titleAr}</span>
                        <span class="clause-title-en" lang="en">${clause.titleEn}</span>
                        ${clause.mandatory ? '<span class="badge badge-mandatory">إلزامي | Mandatory</span>' : ''}
                      </div>
                      <p class="clause-preview" lang="ar">
                        ${clause.contentAr.slice(0, 150)}...
                      </p>
                      ${clause.legalBasis ? `
                        <p class="clause-legal-basis">
                          <LegalIcon /> ${clause.legalBasis}
                        </p>
                      ` : ''}
                    </div>
                  </label>
                  
                  <div class="clause-actions">
                    <button class="btn btn-sm btn-icon" data-action="preview" data-clause-id="${clause.id}">
                      <EyeIcon />
                    </button>
                    ${clause.customizable ? `
                      <button class="btn btn-sm btn-icon" data-action="edit" data-clause-id="${clause.id}">
                        <EditIcon />
                      </button>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
```

### 6.5 Live Preview with Sample Data

```typescript
interface LivePreviewProps {
  template: ContractTemplate;
  variables: Record<string, any>;
  sampleData?: boolean; // Use sample data if true
}

function LivePreview({ template, variables, sampleData }: LivePreviewProps) {
  const previewData = sampleData ? generateSampleData(template) : variables;
  const engine = new TemplateSubstitutionEngine({ variables: previewData, locale: 'ar' });
  
  return `
    <div class="live-preview">
      <!-- Preview toolbar -->
      <div class="preview-toolbar">
        <div class="toolbar-left">
          <h4>معاينة مباشرة | Live Preview</h4>
        </div>
        
        <div class="toolbar-right">
          <button class="btn btn-sm" data-action="toggle-data">
            ${sampleData ? 'استخدام بيانات حقيقية | Use Real Data' : 'استخدام بيانات تجريبية | Use Sample Data'}
          </button>
          <button class="btn btn-sm" data-action="download-preview">
            <DownloadIcon /> تنزيل PDF
          </button>
          <button class="btn btn-sm" data-action="fullscreen">
            <FullscreenIcon />
          </button>
        </div>
      </div>
      
      <!-- Preview content (rendered contract) -->
      <div class="preview-content">
        <div class="preview-document">
          ${renderContractPreview(template, previewData, engine)}
        </div>
      </div>
      
      <!-- Data panel (collapsible) -->
      <div class="preview-data-panel">
        <button class="panel-toggle" data-action="toggle-panel">
          <DataIcon /> البيانات | Data
        </button>
        <div class="panel-content">
          <pre>${JSON.stringify(previewData, null, 2)}</pre>
        </div>
      </div>
    </div>
  `;
}

function generateSampleData(template: ContractTemplate): Record<string, any> {
  const sampleData: Record<string, any> = {};
  
  for (const variable of template.variables) {
    switch (variable.type) {
      case 'text':
        sampleData[variable.key] = variable.defaultValue || `Sample ${variable.labelEn}`;
        break;
      case 'date':
        sampleData[variable.key] = new Date().toISOString().split('T')[0];
        break;
      case 'currency':
      case 'number':
        sampleData[variable.key] = variable.defaultValue || 100000;
        break;
      case 'percentage':
        sampleData[variable.key] = variable.defaultValue || 50;
        break;
      case 'list':
        sampleData[variable.key] = ['Item 1', 'Item 2', 'Item 3'];
        break;
      default:
        sampleData[variable.key] = variable.defaultValue || '';
    }
  }
  
  return sampleData;
}
```

### 6.6 Template Import/Export

```typescript
interface TemplateExportFormat {
  version: '1.0';
  template: ContractTemplate;
  metadata: {
    exportedAt: string;
    exportedBy: string;
    originalWorkspaceId: string;
  };
}

function exportTemplate(template: ContractTemplate, userId: string): string {
  const exportData: TemplateExportFormat = {
    version: '1.0',
    template,
    metadata: {
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
      originalWorkspaceId: template.workspaceId,
    },
  };
  
  return JSON.stringify(exportData, null, 2);
}

function importTemplate(jsonData: string, workspaceId: string): ContractTemplate {
  const importData: TemplateExportFormat = JSON.parse(jsonData);
  
  // Validate version
  if (importData.version !== '1
