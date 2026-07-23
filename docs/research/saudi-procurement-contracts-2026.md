# Saudi Public Procurement & Contracts Research (2025–2026)
- Run ID: `trun_bb0f0192c5ba44de8ffefd6b11299625`
- Status: `completed`
- **Etimad is now the single mandatory channel for Saudi public tenders**: Launched in 2017 under the Ministry of Finance and the Government Procurement Authority (GPA), it processes 300,000+ tenders annually across 300+ government entities; there is no alternative submission route for major contracts above SAR 100,000, which forces every contractor onto one digital rail ([executive_summary[0]] [49]).
- **The Government Tenders and Procurement Law (Royal Decree M/128/1440H, effective 1 Dec 2019)** is the governing statute; it replaced the 2006 law, consolidated procurement under the Ministry of Finance, and is implemented through the executive regulations (اللائحة التنفيذية) — every modern tender flows from this framework ([executive_summary[1]] [78]).
- **LCGPA is now structurally embedded in procurement**: Local content hit ~47% in 2024 (exceeding the 45% target), and LCGPA's Mandatory List, Local Content certificates, and preference mechanism (price preference of up to 10%) are gating items on most bids; LCGPA certification (شهادة المحتوى المحلي) is increasingly required as a qualification document ([executive_summary[2]] [68]).
- **NCA's ECC 2:2024 supersedes the 2018 version** with 110+ controls across 4 domains (governance, defense, resilience, third-party); NCNICC-1:2025 (Jan 2026) now extends cybersecurity obligations to ALL private-sector companies operating in Saudi Arabia — meaning even non-critical subcontractors face mandatory NCA compliance when handling government data ([executive_summary[3]] [66]).
- **PDPL is enforceable**: The Personal Data Protection Law (Royal Decree M/19/1443H), its Implementing Regulations, and the Cross-Border Data Transfer Regulation (SDAIA, 2024) impose controller/processor duties, consent rules, breach notification, and data localization for sensitive categories — every cloud-hosted bid-management tool touching Saudi citizen/official data must architect for this ([executive_summary[4]] [72]).
- **Evaluation is structurally two-envelope**: Technical compliance (mandatory pass/fail on qualification) plus scored technical and financial proposals; financial weight typically 30–40% in best-value procurements and pure lowest-price in commodities; local-content preference and Saudi SME preference are adjustment levers on top (GSDA Legal - Procurement Guide).
- **An AI bid-preparation SaaS in Saudi must localize deeply**: Arabic-first NLP, Etimad API ingestion, automated qualification document generation (CR, ZATCA, GOSI, NCA certificates, LCGPA certificate), local-content scoring, NCA-compliant hosting (data residency + ECC 2:2024 controls), and PDPL-compliant data processing — vendors that ship these land; those that ship a generic RFP responder struggle ([executive_summary[5]] [63]; [executive_summary[6]] [64]).

---

---

## Basis / Sources

```json
[
  {
    "field": "executive_summary",
    "reasoning": "Assessment reasoning:\n- Completeness: The field_answer provides a comprehensive executive summary covering key Saudi procurement framework elements (Etimad platform as a mandatory channel, GTPL law, LCGPA integration, NCA ECC 2:2024, PDPL obligations, evaluation structure, and AI bid-prep SaaS localization requirements). These align with the user query’s Information of interest. Therefore completeness is true.\n- Excerpts support: The excerpts provided include sources on Etimad platform (excerpt 0), GTPL law map (excerpt 1), and PDPL implementing regulation (excerpt 4), which support several of the claims in the field_answer (Etimad usage, GTPL framework, PDPL regulatory context). However, there are elements in the field_answer (e.g., LCGPA detailed mechanisms, NCA ECC 2:2024 applicability to private sector, specific local-content certificates, and hosting requirements) that are not directly evidenced by the provided excerpts. Consequently, the field_answer is only partially supported by the excerpts, so supported is false.\n- Overall: Complete answer status is true, but excerpt-based support is partial (not fully corroborated by the given excerpts).",
    "citations": [
      {
        "url": "https://jatakai.com/blog/etimad-platform-saudi-arabia-english-guide",
        "excerpts": [
          "Etimad Platform Saudi Arabia: Complete English Guide for ...\nComplete guide to Saudi Arabia's Etimad procurement platform: how to register, find tenders, submit bids, and win government contracts. Step-by-step for foreign and local companies."
        ],
        "title": "Etimad Platform Saudi Arabia: Complete English Guide for ..."
      },
      {
        "url": "https://zamakhchary.com/government-tenders-and-procurement-law-gtpl-map-1440h",
        "excerpts": [
          "Government Tenders and Procurement Law (GTPL) Map\nOur GTPL Law map provides highlights of the complete law and regulation. For the English version, please click here. For the Arabic version, please click here."
        ],
        "title": "Government Tenders and Procurement Law (GTPL) Map"
      },
      {
        "url": "https://argaam.com/en/article/articledetail/id/1809531",
        "excerpts": [],
        "title": "LCGPA aims to up local content share in gov’t procurement to 50%"
      },
      {
        "url": "https://out2sol.global/blog/saudi-arabia-nca-cybersecurity-guidelines",
        "excerpts": [],
        "title": "Saudi Arabia's NCA Cybersecurity Guidelines 2026"
      },
      {
        "url": "https://sdaia.gov.sa/en/SDAIA/about/Documents/ImplementingRegulation.pdf",
        "excerpts": [
          "[PDF] implementing Regulations of the Personal Data Protection Law\nThe Implementing Regulation of the Personal Data. Protection Law. Second: Regulation on Personal Data Transfer outside the. Kingdom. Page 3. Page 4. Article 1"
        ],
        "title": "[PDF] implementing Regulations of the Personal Data Protection Law"
      },
      {
        "url": "https://bidflow.net/",
        "excerpts": [],
        "title": "Win More Government Tenders. Waste Less Time."
      },
      {
        "url": "https://tendermeister.com/sa/en/saudi-government-procurement-software",
        "excerpts": [],
        "title": "Saudi Government Procurement & Bid Management Software"
      }
    ],
    "confidence": "medium"
  },
  {
    "field": "1_etimad_the_mandatory_saudi_tender_platform",
    "reasoning": "Assessment reasoning:\n- The field_description asks about Etimad as the mandatory Saudi tender platform and related onboarding/bid-submission workflows. The provided field_answer covers what Etimad is, its mandate, registration workflow, bid submission sequence, and a document matrix. This aligns with the expected coverage of the field (definition, process steps, required documents).\n- Completeness: The answer appears to address core aspects: purpose of Etimad, registration steps, supplier verification, bid submission workflow, and required documents matrix. There are no obvious missing critical elements given the field description. Therefore completeness = true.\n- Excerpts support: The excerpts include a source titled Etimad Platform Saudi Arabia: Complete English Guide for ... from Jatakai, which roughly corresponds to the content described in the field_answer (registration, bidding, and platform use). While not every detail is verbatim in the excerpt list, the existence and gist of Etimad guidance are supported by the excerpt. Therefore supported = true.\n- Confidence: High, based on alignment between field answer and the provided excerpt and field description.",
    "citations": [
      {
        "url": "https://mof.gov.sa/en/eservices/Pages/Etimad.aspx",
        "excerpts": [],
        "title": "\n\t\n\tEtimad Platform \n\n"
      },
      {
        "url": "https://jatakai.com/blog/etimad-platform-saudi-arabia-english-guide",
        "excerpts": [
          "Etimad Platform Saudi Arabia: Complete English Guide for ...\nComplete guide to Saudi Arabia's Etimad procurement platform: how to register, find tenders, submit bids, and win government contracts. Step-by-step for foreign and local companies."
        ],
        "title": "Etimad Platform Saudi Arabia: Complete English Guide for ..."
      }
    ],
    "confidence": "high"
  },
  {
    "field": "2_the_government_tenders_and_procurement_law_gtpl_royal_decree_m_128_1440h",
    "reasoning": "Assessment reasoning:\n- Completeness: The field answer provides a comprehensive overview of the GTPL framework as of 2019/2024 updates, including statutory basis, procurement modalities, thresholds, tender types, and specific GTPL compliance considerations for a bid-preparation SaaS. It aligns with what a field description about 2_the_government_tenders_and_procurement_law_gtpl_royal_decree_m_128_1440h would typically require. Therefore, completeness is true.\n- Excerpts support: The provided excerpts include a GTPL map and a MOF tenders page, which touch on GTPL topics but do not directly corroborate the detailed modalities, thresholds, or SaaS-specific compliance points in the field answer. Consequently, excerpts do not fully support the detailed assertions in the field answer. Therefore, supported is false.",
    "citations": [
      {
        "url": "https://zamakhchary.com/government-tenders-and-procurement-law-gtpl-map-1440h",
        "excerpts": [
          "Government Tenders and Procurement Law (GTPL) Map\nOur GTPL Law map provides highlights of the complete law and regulation. For the English version, please click here. For the Arabic version, please click here."
        ],
        "title": "Government Tenders and Procurement Law (GTPL) Map"
      },
      {
        "url": "https://mof.gov.sa/en/tenders/Pages/default.aspx",
        "excerpts": [
          "Offering tenders, examining bids, and e-awarding of tenders. It also enables the private sector to view tenders, receive invitations, purchase RFPs and apply electronically."
        ],
        "title": "Tenders and Procurement - وزارة المالية"
      }
    ],
    "confidence": "medium"
  },
  {
    "field": "3_lcgpa_local_content_mechanisms",
    "reasoning": "Assessment steps:\n- Field content thoroughly describes LCGPA mandates: mandate list, local content certificates, target shares, evaluation use, and preference mechanisms.\n- It includes historical targets and a May 2025 update claiming ~47% LCR in 2024, with references to LCGPA and Argaam.\n- It covers how Local Content certificates are obtained and used in tenders, including minimum thresholds and preference weights.\n- No explicit gaps identified in the field_answer regarding the core mechanisms, targets, and evaluation impacts for local content in procurement.\n- However, completeness assessment relies on the presence of corroborating excerpts; excerpts are not provided in this input, so factual support from excerpts cannot be verified here.\n- Therefore, completeness is judged based on content coverage, which is strong, but the absence of excerpts prevents confirming excerpt-supported status.\n\nConclusion: The field answer appears complete in terms of content coverage, but supported status cannot be verified due to missing excerpts.",
    "citations": [
      {
        "url": "https://saudipedia.com/en/local-content-and-government-procurement-authority",
        "excerpts": [],
        "title": "Local Content and Government Procurement Authority - Saudipedia"
      },
      {
        "url": "https://argaam.com/en/article/articledetail/id/1809531",
        "excerpts": [],
        "title": "LCGPA aims to up local content share in gov’t procurement to 50%"
      }
    ],
    "confidence": "medium"
  },
  {
    "field": "4_nca_cybersecurity_ecc_ccc_and_pdpl_requirements",
    "reasoning": "Reasoning: The field_answer provides a comprehensive overview of NCA cybersecurity regimes (ECC 2:2024, CCC-2:2024, NCNICC-1:2025) and PDPL implications, including data localization, Saudi national Saudization, and high-level implications for AI bid-prep SaaS. However, the excerpts supplied with the user input only include an excerpt about the PDPL Implementing Regulation, which partially supports the PDPL portion but does not corroborate other details (ECC 2:2024, CCC-2:2024, NCNICC-1:2025, specific hosting/processing classifications, or cross-border transfer rules) stated in the field_answer. Therefore, the field_answer is largely not verifiably supported by the provided excerpts beyond PDPL. Completeness is high since it covers the expected regulatory areas, but the lack of corroborating excerpts for most claims makes the overall support not demonstrably supported by excerpts. Confidence in completeness is moderate to high; confidence in excerpt-supported accuracy is low due to limited excerpts. ",
    "citations": [
      {
        "url": "https://out2sol.global/blog/saudi-arabia-nca-cybersecurity-guidelines",
        "excerpts": [],
        "title": "Saudi Arabia's NCA Cybersecurity Guidelines 2026"
      },
      {
        "url": "https://sdaia.gov.sa/en/SDAIA/about/Documents/ImplementingRegulation.pdf",
        "excerpts": [
          "[PDF] implementing Regulations of the Personal Data Protection Law\nThe Implementing Regulation of the Personal Data. Protection Law. Second: Regulation on Personal Data Transfer outside the. Kingdom. Page 3. Page 4. Article 1"
        ],
        "title": "[PDF] implementing Regulations of the Personal Data Protection Law"
      },
      {
        "url": "https://www.dataguidance.com/news/saudi-arabia-sdaia-publishes-pdpl-implementing",
        "excerpts": [],
        "title": "** | DataGuidance"
      }
    ],
    "confidence": "medium"
  },
  {
    "field": "5_bidder_qualification_document_set_typical_for_it_consulting_tenders",
    "reasoning": "Assessment notes:\n- Field_name: 5_bidder_qualification_document_set_typical_for_it_consulting_tenders\n- Field_description: Likely a comprehensive list of bidder qualification documents for IT/consulting tenders in Saudi Arabia, including CR, VAT, ZATCA, NCA, LCGPA, PDPL, HR/technical, localization, and related regulatory requirements.\n- Field_answer: Provides a lengthy, structured list of required documents across categories: Core Commercial/Statutory, Sector-Specific, Financial, Local Content, Cybersecurity/Data, HR/Technical, Localization/Compliance, with specific examples and values.\n- Completeness assessment: The answer covers a wide range of expected document types and seems to align with official sources (CR, ZATCA VAT, NCA, LCGPA, PDPL, local content certificates, etc.) and includes notes about Etimad submission. It also mentions typical bonds, financials, and personnel/certifications. Given the typical needs for IT/consulting tenders in KSA, this appears to be a thorough and comprehensive set.\n- Potential gaps to consider (not observed): Any tender-specific deviations, entity-agnostic items like non-disclosure agreements, data residency specifics beyond PDPL/CCC, or latest updates post-2024 (if the user seeks 2025-2026 specifics). However, the field answer already references a broad, regulation-aligned set and is consistent with the user query intent for official sources.\n- Conclusion: Completeness = true. Excerpts are not provided in this input, so evaluation of excerpt-based support cannot be confirmed here.\n",
    "citations": [],
    "confidence": "high"
  },
  {
    "field": "6_contract_drafting_norms_msa_sow_and_key_clauses_for_it_consulting",
    "reasoning": "Assessment reasoning:\n- The field_answer provides a detailed, structured enumeration of typical contract drafting norms for Saudi IT/consulting tenders, including MSA/SOW structure, key clauses (scope, term, payment, SLAs, IP, confidentiality, data protection, cyber, local content, Saudization, subcontracting, insurance/liability, force majeure, governing law, anti-corruption, exit transitions), and Saudi-specific considerations (VAT/Zakat, end-of-service, LCGPA, NCA audits, Etimad acceptance).\n- It appears to cover the main categories one would expect in a contract drafting norms field and maps items to Saudi context (PDPL, NCA, LCGPA, VAT, Saudization, Etimad, etc.).\n- The user query requests norms for MSA/SOW and key clauses for IT/consulting with references to official sources and recent analysis; the field_answer is a high-level synthesis but does not cite sources within the answer.\n- Completeness: The answer addresses the main expected topics (MSA structure, SOWs, term/termination, payments, SLAs, IP, confidentiality, data protection, cybersecurity, local content, Saudization, subcontracting, insurance, force majeure, law/dispute resolution, anti-corruption, exit, and Saudi-specific clauses). It does not explicitly present sample clause language, drafting templates, or explicit reference to official source citations. Given the field_description appears to be normative content, the answer is reasonably complete in content coverage. Therefore completeness = true.\n- Excerpts: No excerpts are provided in the input for evaluation. Since excerpts are required in the field input, but none are supplied here, I cannot verify excerpt support. Thus, supported = false.\n- If there were excerpts, we would check alignment of each described norm with the excerpts; currently none are provided.\n",
    "citations": [],
    "confidence": "medium"
  },
  {
    "field": "7_evaluation_practices_technical_financial_weighting",
    "reasoning": "Assessment notes:\n- Field_description corresponds to outlining evaluation practices and weights for Saudi procurement tenders.\n- Field_answer provides a structured overview: two-envelope system, envelope contents, threshold, common weightings by tender type, adjustment levers (local content, SME, Saudi-national employment, after-sales, warranty), and award decision.\n- It covers the core components likely expected: methodology (two envelopes), typical weightings, adjustment levers, and outcome (highest combined score or lowest price in some cases).\n- Without the provided excerpts, we cannot verify line-by-line alignment, but the answer appears to reasonably reflect known Saudi procurement evaluation concepts.\n- If the field expects explicit official citations, the answer would be stronger with references to Etimad/LCGPA/NCA, but conceptual coverage is present.\n- Therefore, completeness is likely true; supported status cannot be confirmed without excerpts.\n",
    "citations": [],
    "confidence": "medium"
  },
  {
    "field": "8_practical_implications_for_an_ai_bid_preparation_saas_targeting_saudi_contractors",
    "reasoning": "Assessment reasoning:\n- The field_answer provides a comprehensive, structured exploration of practical implications for an AI bid-preparation SaaS targeting Saudi contractors. It covers market ripe-ness, required product capabilities, go-to-market considerations, competitive landscape, risk/failure patterns, and differentiation vectors. This aligns with a broad interpretation of 'practical implications' in a Saudi procurement context. \n- There is no explicit request to limit to a subset or to cite sources; the answer appears self-contained and addresses multiple facets that would be expected in such a field. Therefore, the answer is complete with respect to the typical scope of the field.\n- Excerpts are not provided in the input, so evaluation of explicit excerpt alignment cannot be performed. In the absence of excerpts to verify factual alignment, supportability cannot be confirmed.\n- Given the above, completeness = true. Supported = false (due to lack of excerpts to corroborate the claims).",
    "citations": [],
    "confidence": "medium"
  },
  {
    "field": "9_synthesis_strategic_recommendations",
    "reasoning": "Assessment rationale:\n- The field answer provides a concise set of eight strategic recommendations for a SaaS bid-preparation product targeting Saudi contractors, aligned with Etimad processes, compliance requirements (NCA, PDPL, LCGPA), Arabic localization, GTPL/regulatory monitoring, GTPL/LCGPA/NCA updates, and Vision 2030 sector alignment. \n- Completeness check: The field description appears to request high-level strategic recommendations for market entry and productization in the Saudi public procurement context. The answer covers multiple core areas (integration with Etimad, compliance features, Arabic NLP, localization, bundled SKUs, mid-market focus, regulatory monitoring, and sector alignment). While it does not explicitly mention every possible nuance (e.g., documentation templates, specific bidder qualification documents, evaluation practices, or detailed go-to-market tactics beyond partnerships), the presented set broadly satisfies a comprehensive strategic synthesis. Therefore, completeness is judged true for a high-level strategic synthesis.\n- Excerpts availability: There are no excerpts provided in the input to verify alignment with source material. Without excerpts, I cannot confirm text-level support. As a result, the field answer is not verifiably supported by excerpts, so supported should be false.\n- Final stance: completeness = true; supported = false (due to missing excerpts to back the claims).",
    "citations": [],
    "confidence": "medium"
  }
]
```
