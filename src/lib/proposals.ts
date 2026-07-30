export type StatusKey =
  | "submitted"
  | "revisions"
  | "in_review"
  | "review_returned"
  | "major_revisions"
  | "question"
  | "contract"
  | "signed"
  | "approved"
  | "proofreader_review"
  | "author_approved"
  | "declined";

export interface StatusMeta {
  key: StatusKey;
  label: string;
  filterLabel: string;
  dot: string;
  badgeClass: string;
  rowBar: string;
}

export const STATUS_META: Record<StatusKey, StatusMeta> = {
  submitted: {
    key: "submitted",
    label: "New",
    filterLabel: "New",
    dot: "bg-amber-400",
    badgeClass: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    rowBar: "bg-amber-400",
  },
  revisions: {
    key: "revisions",
    label: "Revisions Requested",
    filterLabel: "Revisions",
    dot: "bg-orange-500",
    badgeClass: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
    rowBar: "bg-orange-500",
  },
  in_review: {
    key: "in_review",
    label: "Under Review",
    filterLabel: "In Review",
    dot: "bg-sky-500",
    badgeClass: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    rowBar: "bg-sky-500",
  },
  review_returned: {
    key: "review_returned",
    label: "Review Returned",
    filterLabel: "Review Returned",
    dot: "bg-indigo-500",
    badgeClass: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    rowBar: "bg-indigo-500",
  },
  major_revisions: {
    key: "major_revisions",
    label: "Major Revisions Required",
    filterLabel: "Major Revisions",
    dot: "bg-rose-500",
    badgeClass: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    rowBar: "bg-rose-500",
  },
  question: {
    key: "question",
    label: "Question Raised",
    filterLabel: "Question",
    dot: "bg-red-500",
    badgeClass: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
    rowBar: "bg-teal-500",
  },
  contract: {
    key: "contract",
    label: "Contract Issued",
    filterLabel: "Contract",
    dot: "bg-violet-500",
    badgeClass: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
    rowBar: "bg-violet-400",
  },
  signed: {
    key: "signed",
    label: "Contract Signed",
    filterLabel: "Signed",
    dot: "bg-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    rowBar: "bg-emerald-500",
  },
  approved: {
    key: "approved",
    label: "Metadata Approved",
    filterLabel: "Approved",
    dot: "bg-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    rowBar: "bg-emerald-500",
  },
  proofreader_review: {
    key: "proofreader_review",
    label: "Proofreader Review",
    filterLabel: "Proofreader Review",
    dot: "bg-purple-500",
    badgeClass: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
    rowBar: "bg-purple-500",
  },
  author_approved: {
    key: "author_approved",
    label: "Author Approved",
    filterLabel: "Author Approved",
    dot: "bg-green-500",
    badgeClass: "bg-green-50 text-green-700 ring-1 ring-green-200",
    rowBar: "bg-green-500",
  },
  declined: {
    key: "declined",
    label: "Declined",
    filterLabel: "Declined",
    dot: "bg-stone-400",
    badgeClass: "bg-stone-100 text-stone-600 ring-1 ring-stone-200",
    rowBar: "bg-stone-300",
  },
};

export interface SupportingDoc {
  name: string;
  sizeLabel: string;
}

// Map API raw status -> local StatusKey
const STATUS_KEY_MAP: Record<string, StatusKey> = {
  new: "submitted",
  submitted: "submitted",
  in_review: "in_review",
  under_review: "in_review",
  review_returned: "review_returned",
  contract_issued: "contract",
  queries_raised: "question",
  question_raised: "question",
  awaiting_author_approval: "proofreader_review",
  proofreader_review: "proofreader_review",
  author_approved: "author_approved",
  locked: "signed",
  contract_signed: "signed",
  contract_received: "signed",
  declined: "declined",
  awaiting_more_info: "revisions",
  additional_info_required: "revisions",
  revisions_requested: "revisions",
};

export function normalizeStatusKey(raw?: string, display?: string): StatusKey {
  const tryKey = (s?: string): StatusKey | undefined => {
    if (!s) return undefined;
    const k = s.trim().toLowerCase().replace(/\s+/g, "_");
    return STATUS_KEY_MAP[k];
  };
  return tryKey(display) || tryKey(raw) || "submitted";
}

export function getStatusMeta(raw?: string, display?: string): StatusMeta {
  return STATUS_META[normalizeStatusKey(raw, display)];
}

export interface SuggestedReviewer {
  name: string;
  affiliation: string;
  email: string;
}

export interface Proposal {
  id: string;
  ref: string;
  title: string;
  subtitle?: string;
  kind: string;
  status: StatusKey;
  // Author
  authorName: string;
  authorEmail: string;
  authorAffiliation: string;
  country: string;
  mailingAddress: string;
  biography: string;
  // Dates
  submittedAt: string; // ISO
  updatedAt: string;
  // Manuscript
  wordCount: number;
  illustrations: number;
  nonEnglish: boolean;
  estCompletion: string;
  // Summary
  discipline: string;
  subdiscipline: string;
  overview: string;
  keywords: string[];
  keyFeatures: string;
  intendedAudience: string;
  // TOC
  tableOfContents: string[];
  // Market
  whyNeeded: string;
  competingTitles: string;
  // Reviewers
  suggestedReviewers: SuggestedReviewer[];
  // Notes
  additionalNotes: string;
  supportingDocs: SupportingDoc[];
  // Editorial decision summary
  decisionSummary: string;
}

export const PROPOSALS: Proposal[] = [
  {
    id: "sub-001",
    ref: "sub-001",
    title: "Borders, Bodies, and Belonging: Migration and the Politics of Care",
    kind: "Monograph",
    status: "major_revisions",
    authorName: "Dr. Aisha Kamara",
    authorEmail: "a.kamara@ucl.ac.uk",
    authorAffiliation: "University College London",
    country: "United Kingdom",
    mailingAddress: "Gower Street, London, Greater London, WC1E 6BT, United Kingdom",
    biography:
      "Dr. Aisha Kamara is a Lecturer in Migration Studies at UCL. Her research sits at the intersection of feminist political theory, care ethics, and migration policy. She has published in journals including Feminist Review and Migration Studies.",
    submittedAt: "2025-03-10",
    updatedAt: "2025-05-02",
    wordCount: 88000,
    illustrations: 6,
    nonEnglish: false,
    estCompletion: "November 2025",
    discipline: "Humanities",
    subdiscipline: "Migration Studies / Feminist Political Theory",
    overview:
      "This monograph examines the intersection of migration policy and care ethics, arguing that dominant frameworks of border control fail to account for the central role of migrant care workers in sustaining social reproduction across the Global North. Drawing on original fieldwork and feminist political theory, it proposes a 'politics of care' as an alternative normative framework for migration governance.",
    keywords: ["migration", "care ethics", "feminist theory", "borders", "belonging"],
    keyFeatures:
      "The book makes an original contribution by bringing care ethics into direct dialogue with migration scholarship — two fields that have developed largely in parallel. It combines theoretical analysis with primary fieldwork data and direct policy engagement.",
    intendedAudience:
      "Migration scholars, feminist political theorists, policy researchers, practitioners in social care",
    tableOfContents: [
      "Introduction: Migration, Care, and the Political",
      "Theoretical Frameworks: Care Ethics and Migration Theory",
      "Fieldwork: Migrant Care Workers in Urban Britain",
      "Policy Analysis: The UK's Migration-Care Nexus",
      "Comparative Cases: Canada, Germany, Australia",
      "Towards a Politics of Care",
      "Conclusion",
    ],
    whyNeeded:
      "Care work and migration are two of the defining political issues of the current moment, yet they are rarely analysed together at a theoretical level. This book provides that synthesis.",
    competingTitles:
      "Care Work and Migration (Bristol UP, 2021) — empirical only; The Politics of Belonging (Sage, 2019) — no migration focus.",
    suggestedReviewers: [
      {
        name: "Prof. Bridget Anderson",
        affiliation: "University of Bristol",
        email: "bridget.anderson@bristol.ac.uk",
      },
      {
        name: "Dr. Helma Lutz",
        affiliation: "Goethe University Frankfurt",
        email: "h.lutz@soz.uni-frankfurt.de",
      },
    ],
    additionalNotes:
      "No image permissions required. Fieldwork was conducted under UCL Research Ethics Committee approval (ref. REC-2024-107).",
    supportingDocs: [
      { name: "Proposal.pdf", sizeLabel: "2.2 MB" },
      { name: "Sample Chapter.pdf", sizeLabel: "1.4 MB" },
      { name: "CV – Dr. Kamara.pdf", sizeLabel: "295 KB" },
    ],
    decisionSummary: "Major revisions requested — awaiting author",
  },
  {
    id: "sub-002",
    ref: "sub-002",
    title: "Gender and Power in Early Modern Europe",
    kind: "Monograph",
    status: "question",
    authorName: "Dr. Sophie Dubois",
    authorEmail: "s.dubois@ulb.be",
    authorAffiliation: "Université Libre de Bruxelles",
    country: "Belgium",
    mailingAddress: "Avenue Franklin Roosevelt 50, 1050 Bruxelles, Belgium",
    biography:
      "Dr. Sophie Dubois researches gender and political authority in early modern Europe, with a focus on the Low Countries and France.",
    submittedAt: "2025-03-01",
    updatedAt: "2025-04-12",
    wordCount: 92000,
    illustrations: 12,
    nonEnglish: true,
    estCompletion: "December 2025",
    discipline: "Humanities",
    subdiscipline: "Early Modern History / Gender Studies",
    overview:
      "A reassessment of women's political agency in early modern European courts, drawing on archival sources from Brussels, Paris, and Vienna.",
    keywords: ["gender", "early modern", "Europe", "political history"],
    keyFeatures:
      "Combines new archival research with a comparative framework across three court cultures.",
    intendedAudience:
      "Historians of early modern Europe, gender historians, graduate students",
    tableOfContents: [
      "Introduction",
      "Women at the Habsburg Court",
      "French Court Networks",
      "The Viennese Case",
      "Conclusion",
    ],
    whyNeeded:
      "Existing scholarship treats each court in isolation; this is the first comparative study.",
    competingTitles: "Women and Power at the Habsburg Court (OUP, 2018)",
    suggestedReviewers: [
      {
        name: "Prof. Merry Wiesner-Hanks",
        affiliation: "University of Wisconsin–Milwaukee",
        email: "wiesner@uwm.edu",
      },
    ],
    additionalNotes: "Some primary sources in French and German.",
    supportingDocs: [
      { name: "Proposal.pdf", sizeLabel: "1.8 MB" },
      { name: "Sample Chapter.pdf", sizeLabel: "1.1 MB" },
    ],
    decisionSummary: "Question raised — awaiting author response",
  },
  {
    id: "sub-003",
    ref: "sub-003",
    title: "The Philosophy of Algorithmic Governance",
    kind: "Monograph",
    status: "review_returned",
    authorName: "Prof. James Mitchell",
    authorEmail: "jmitchell@stanford.edu",
    authorAffiliation: "Stanford University",
    country: "United States",
    mailingAddress: "450 Jane Stanford Way, Stanford, CA 94305, United States",
    biography:
      "Prof. James Mitchell works on philosophy of technology, with a focus on the normative implications of algorithmic decision-making.",
    submittedAt: "2025-02-10",
    updatedAt: "2025-04-05",
    wordCount: 75000,
    illustrations: 2,
    nonEnglish: false,
    estCompletion: "October 2025",
    discipline: "Philosophy",
    subdiscipline: "Philosophy of Technology",
    overview:
      "Examines how algorithmic systems reconfigure traditional concepts of governance, accountability, and political legitimacy.",
    keywords: ["algorithms", "governance", "philosophy", "ethics"],
    keyFeatures:
      "Bridges analytic political philosophy and STS literature on algorithmic systems.",
    intendedAudience:
      "Philosophers, political theorists, scholars of AI ethics",
    tableOfContents: [
      "Introduction",
      "What is Algorithmic Governance?",
      "Accountability Without Agents?",
      "Democratic Legitimacy",
      "Conclusion",
    ],
    whyNeeded:
      "Provides a unified philosophical framework where existing literature is fragmented across disciplines.",
    competingTitles: "Atlas of AI (Yale, 2021) — empirical/critical, not philosophical",
    suggestedReviewers: [
      {
        name: "Prof. Helen Nissenbaum",
        affiliation: "Cornell Tech",
        email: "hn288@cornell.edu",
      },
    ],
    additionalNotes: "—",
    supportingDocs: [
      { name: "Proposal.pdf", sizeLabel: "1.6 MB" },
      { name: "Sample Chapter.pdf", sizeLabel: "900 KB" },
    ],
    decisionSummary: "Reviews returned — pending editorial decision",
  },
  {
    id: "sub-004",
    ref: "sub-004",
    title: "Climate Change and Agricultural Adaptation in Southeast Asia",
    subtitle: "Smallholder Strategies and Policy Frameworks",
    kind: "Monograph",
    status: "in_review",
    authorName: "Dr. Sarah Chen",
    authorEmail: "s.chen@oxford.ac.uk",
    authorAffiliation: "University of Oxford",
    country: "United Kingdom",
    mailingAddress: "South Parks Road, Oxford OX1 3QY, United Kingdom",
    biography:
      "Dr. Sarah Chen is a Senior Research Fellow at the Environmental Change Institute, University of Oxford. Her research focuses on the intersections of climate policy, food systems, and smallholder livelihoods across Asia. She has conducted extensive fieldwork in Thailand, Vietnam, and Indonesia, and has published widely in leading journals including Nature Climate Change and Global Food Security.",
    submittedAt: "2025-01-28",
    updatedAt: "2025-03-20",
    wordCount: 90000,
    illustrations: 18,
    nonEnglish: false,
    estCompletion: "August 2025",
    discipline: "Life Sciences",
    subdiscipline: "Climate Adaptation",
    overview:
      "This monograph examines the impact of climate change on agricultural practices across Southeast Asia, with a particular focus on smallholder strategies and policy frameworks that support adaptation. Drawing on multi-country fieldwork in Vietnam, Indonesia, and the Philippines, it synthesises lessons for both researchers and policymakers.",
    keywords: ["climate", "agriculture", "Southeast Asia", "adaptation"],
    keyFeatures:
      "Multi-country comparative fieldwork over five years.",
    intendedAudience: "Climate scholars, development practitioners, policymakers",
    tableOfContents: [
      "Introduction",
      "Vietnam Case Studies",
      "Indonesia Case Studies",
      "Philippines Case Studies",
      "Cross-Country Patterns",
      "Conclusion",
    ],
    whyNeeded:
      "Most adaptation literature is single-country; this is one of the first multi-country syntheses.",
    competingTitles: "Adapting Agriculture (Routledge, 2020) — single country",
    suggestedReviewers: [
      {
        name: "Prof. W. Neil Adger",
        affiliation: "University of Exeter",
        email: "n.adger@exeter.ac.uk",
      },
    ],
    additionalNotes: "—",
    supportingDocs: [
      { name: "Proposal.pdf", sizeLabel: "2.0 MB" },
      { name: "Sample Chapter.pdf", sizeLabel: "1.3 MB" },
    ],
    decisionSummary: "Under peer review",
  },
  {
    id: "sub-005",
    ref: "sub-005",
    title: "Medieval Trade Routes: A Geographic Analysis",
    kind: "Edited Collection",
    status: "revisions",
    authorName: "Dr. Elena Vasquez",
    authorEmail: "elena.vasquez@sorbonne.fr",
    authorAffiliation: "Sorbonne University",
    country: "France",
    mailingAddress: "21 Rue de l'École de Médecine, 75006 Paris, France",
    biography:
      "Dr. Elena Vasquez specialises in the historical geography of the medieval Mediterranean.",
    submittedAt: "2024-12-15",
    updatedAt: "2025-02-01",
    wordCount: 110000,
    illustrations: 30,
    nonEnglish: false,
    estCompletion: "August 2025",
    discipline: "History",
    subdiscipline: "Historical Geography",
    overview:
      "An edited collection mapping medieval trade routes across the Mediterranean and Indian Ocean.",
    keywords: ["medieval", "trade", "geography", "Mediterranean"],
    keyFeatures: "Includes 30 original maps produced by the contributors.",
    intendedAudience: "Medievalists, historical geographers, world historians",
    tableOfContents: [
      "Introduction (Editor)",
      "Mediterranean Routes",
      "Indian Ocean Routes",
      "Trans-Saharan Routes",
      "Conclusion",
    ],
    whyNeeded: "Brings together a fragmented field around a shared geographic framework.",
    competingTitles: "Trade in the Middle Ages (Brill, 2017)",
    suggestedReviewers: [
      {
        name: "Prof. Janet Abu-Lughod (est.)",
        affiliation: "—",
        email: "—",
      },
    ],
    additionalNotes: "Revisions requested on chapters 2 and 4.",
    supportingDocs: [
      { name: "Proposal.pdf", sizeLabel: "3.1 MB" },
      { name: "Sample Chapter.pdf", sizeLabel: "1.5 MB" },
    ],
    decisionSummary: "Revisions requested — awaiting author",
  },
  {
    id: "sub-006",
    ref: "sub-006",
    title: "Contemporary African Literature: Voices and Narratives",
    kind: "Edited Collection",
    status: "contract",
    authorName: "Prof. Kwame Osei",
    authorEmail: "k.osei@ug.edu.gh",
    authorAffiliation: "University of Ghana",
    country: "Ghana",
    mailingAddress: "P.O. Box LG 25, Legon, Accra, Ghana",
    biography:
      "Prof. Kwame Osei is a literary critic specialising in postcolonial African writing.",
    submittedAt: "2024-11-03",
    updatedAt: "2025-01-18",
    wordCount: 130000,
    illustrations: 0,
    nonEnglish: false,
    estCompletion: "July 2025",
    discipline: "Literature",
    subdiscipline: "African Literature",
    overview:
      "A collection of essays by African scholars on contemporary literary production across the continent.",
    keywords: ["African literature", "postcolonial", "narrative"],
    keyFeatures: "All contributors are based in African institutions.",
    intendedAudience: "Literary scholars, postcolonial studies, comparative literature",
    tableOfContents: [
      "Introduction",
      "West African Voices",
      "East African Voices",
      "Southern African Voices",
      "Diasporic Conversations",
    ],
    whyNeeded: "Centres African-based scholarship on African writing.",
    competingTitles: "—",
    suggestedReviewers: [
      {
        name: "Prof. Simon Gikandi",
        affiliation: "Princeton University",
        email: "sgikandi@princeton.edu",
      },
    ],
    additionalNotes: "—",
    supportingDocs: [
      { name: "Proposal.pdf", sizeLabel: "2.4 MB" },
    ],
    decisionSummary: "Contract issued — awaiting signature",
  },
  {
    id: "sub-007",
    ref: "sub-007",
    title: "Urban Planning in Post-Industrial Cities",
    kind: "Monograph",
    status: "declined",
    authorName: "Dr. Marie Garcia",
    authorEmail: "m.garcia@polytechnique.edu",
    authorAffiliation: "École Polytechnique",
    country: "France",
    mailingAddress: "Route de Saclay, 91120 Palaiseau, France",
    biography:
      "Dr. Marie Garcia researches urban regeneration in post-industrial European cities.",
    submittedAt: "2024-10-22",
    updatedAt: "2024-12-01",
    wordCount: 70000,
    illustrations: 8,
    nonEnglish: false,
    estCompletion: "—",
    discipline: "Urban Studies",
    subdiscipline: "Urban Planning",
    overview:
      "Case studies of urban regeneration in former industrial centres across Europe.",
    keywords: ["urban", "planning", "post-industrial"],
    keyFeatures: "Focus on community-led regeneration.",
    intendedAudience: "Urban planners, geographers",
    tableOfContents: ["Introduction", "Case Studies", "Conclusion"],
    whyNeeded: "Adds case-study depth to the regeneration literature.",
    competingTitles: "Several recent overlapping titles.",
    suggestedReviewers: [],
    additionalNotes: "—",
    supportingDocs: [{ name: "Proposal.pdf", sizeLabel: "1.2 MB" }],
    decisionSummary: "Declined — does not align with current list",
  },
  {
    id: "sub-008",
    ref: "sub-008",
    title: "The Digital Archive and Historical Memory",
    kind: "Monograph",
    status: "signed",
    authorName: "Prof. Lena Fischer",
    authorEmail: "l.fischer@hu-berlin.de",
    authorAffiliation: "Humboldt University",
    country: "Germany",
    mailingAddress: "Unter den Linden 6, 10117 Berlin, Germany",
    biography:
      "Prof. Lena Fischer is a historian of memory and digital cultural heritage.",
    submittedAt: "2024-09-12",
    updatedAt: "2024-11-20",
    wordCount: 80000,
    illustrations: 10,
    nonEnglish: false,
    estCompletion: "June 2025",
    discipline: "History",
    subdiscipline: "Digital Humanities",
    overview:
      "Examines how digital archives are reshaping the practice and politics of historical memory.",
    keywords: ["digital archive", "memory", "history"],
    keyFeatures:
      "Combines archival theory with case studies of three major digital heritage projects.",
    intendedAudience: "Historians, archivists, digital humanists",
    tableOfContents: [
      "Introduction",
      "Theories of the Archive",
      "Case Study: Europeana",
      "Case Study: DPLA",
      "Case Study: NDLA",
      "Conclusion",
    ],
    whyNeeded: "First theoretical synthesis tying together the major digital archive projects.",
    competingTitles: "—",
    suggestedReviewers: [
      {
        name: "Prof. Wendy Hui Kyong Chun",
        affiliation: "Simon Fraser University",
        email: "whkchun@sfu.ca",
      },
    ],
    additionalNotes: "—",
    supportingDocs: [
      { name: "Proposal.pdf", sizeLabel: "2.2 MB" },
      { name: "Sample Chapter.pdf", sizeLabel: "1.4 MB" },
      { name: "CV – Prof. Fischer.pdf", sizeLabel: "310 KB" },
    ],
    decisionSummary: "Contract signed",
  },
  {
    id: "sub-009",
    ref: "sub-009",
    title: "Quantum Cognition: New Frontiers in Decision Theory",
    kind: "Monograph",
    status: "submitted",
    authorName: "Dr. Liam O'Connor",
    authorEmail: "l.oconnor@tcd.ie",
    authorAffiliation: "Trinity College Dublin",
    country: "Ireland",
    mailingAddress: "College Green, Dublin 2, D02 PN40, Ireland",
    biography:
      "Dr. Liam O'Connor is an Assistant Professor of Cognitive Science at Trinity College Dublin. His work spans decision theory, quantum probability, and the philosophy of mind.",
    submittedAt: "2026-06-01",
    updatedAt: "2026-06-01",
    wordCount: 75000,
    illustrations: 12,
    nonEnglish: false,
    estCompletion: "March 2027",
    discipline: "Cognitive Science",
    subdiscipline: "Decision Theory / Quantum Cognition",
    overview:
      "This monograph introduces quantum probability frameworks to model human decision-making under uncertainty, challenging classical Bayesian assumptions and proposing a unified theory of cognition.",
    keywords: ["quantum cognition", "decision theory", "probability", "cognitive science"],
    keyFeatures:
      "First accessible introduction to quantum cognition for a broad academic audience, combining formal theory with empirical case studies.",
    intendedAudience:
      "Cognitive scientists, philosophers of mind, decision theorists, advanced students",
    tableOfContents: [
      "Introduction: Why Quantum Cognition?",
      "Classical Probability and Its Limits",
      "Quantum Probability Primer",
      "Modeling Order Effects",
      "Empirical Evidence",
      "Towards a Unified Theory",
      "Conclusion",
    ],
    whyNeeded:
      "No current textbook bridges quantum probability and cognitive decision-making for a non-specialist academic readership.",
    competingTitles:
      "Quantum Models of Cognition and Decision (CUP, 2012) — highly technical, dated.",
    suggestedReviewers: [
      {
        name: "Prof. Jerome Busemeyer",
        affiliation: "Indiana University",
        email: "jbusemey@indiana.edu",
      },
      {
        name: "Dr. Emmanuel Pothos",
        affiliation: "City, University of London",
        email: "emmanuel.pothos.1@city.ac.uk",
      },
    ],
    additionalNotes: "Newly submitted — awaiting initial editorial review.",
    supportingDocs: [
      { name: "Proposal.pdf", sizeLabel: "1.9 MB" },
      { name: "Sample Chapter.pdf", sizeLabel: "1.1 MB" },
      { name: "CV – Dr. O'Connor.pdf", sizeLabel: "280 KB" },
    ],
    decisionSummary: "Newly submitted — pending review",
  },
];

export function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function initialsFromName(name: string) {
  return name
    .replace(/(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)/g, "")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function displayNameFromEmail(email: string) {
  if (!email) return "Editor";
  const local = email.split("@")[0] ?? "Editor";
  return (
    local
      .split(/[._-]/)
      .filter(Boolean)
      .map((p) => p[0]?.toUpperCase() + p.slice(1))
      .join(" ") || "Editor"
  );
}