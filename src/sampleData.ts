import { QuoteProject } from "./types";

export const DEFAULT_PROJECTS: QuoteProject[] = [
  {
    id: "project-1",
    name: "TEST_E2E_Project",
    date: "2026-06-18",
    version: "v1.0",
    currency: "USD",
    vendors: [
      { id: "vendor-a", name: "Vendor A" },
      { id: "vendor-b", name: "Vendor B" },
      { id: "vendor-c", name: "Vendor C" },
      { id: "vendor-new", name: "New Vendor" },
    ],
    categories: [
      {
        id: "e-invoicing",
        name: "e-Invoicing",
        components: [
          { id: "setup-cost", name: "Setup Cost" },
          { id: "one-time-integration", name: "One-time Integration" },
          { id: "annual-fee-year-1", name: "Annual Fee — Year 1" },
          { id: "annual-fee-year-2", name: "Annual Fee — Year 2" },
        ]
      },
      {
        id: "erp",
        name: "ERP",
        components: [
          { id: "setup-cost", name: "Setup Cost" },
          { id: "one-time-integration", name: "One-time Integration" },
          { id: "annual-fee-year-1", name: "Annual Fee — Year 1" },
          { id: "annual-fee-year-2", name: "Annual Fee — Year 2" },
        ]
      },
      {
        id: "new-category",
        name: "New Category",
        components: [
          { id: "setup-cost", name: "Setup Cost" },
          { id: "one-time-integration", name: "One-time Integration" },
          { id: "annual-fee-year-1", name: "Annual Fee — Year 1" },
          { id: "annual-fee-year-2", name: "Annual Fee — Year 2" },
        ]
      }
    ],
    costValues: {
      "e-invoicing": {
        "setup-cost": {
          "vendor-a": 5000,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "one-time-integration": {
          "vendor-a": 1000,
          "vendor-b": 9700,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "annual-fee-year-1": {
          "vendor-a": 2000,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "annual-fee-year-2": {
          "vendor-a": 2000,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
      },
      "erp": {
        "setup-cost": {
          "vendor-a": 0,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "one-time-integration": {
          "vendor-a": 0,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "annual-fee-year-1": {
          "vendor-a": 0,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "annual-fee-year-2": {
          "vendor-a": 0,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
      },
      "new-category": {
        "setup-cost": {
          "vendor-a": 0,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "one-time-integration": {
          "vendor-a": 0,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "annual-fee-year-1": {
          "vendor-a": 0,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
        "annual-fee-year-2": {
          "vendor-a": 0,
          "vendor-b": 0,
          "vendor-c": 0,
          "vendor-new": 0,
        },
      },
    },
    comments: {
      "e-invoicing": "Vendor A has lower integration setup, but higher starting fee. Vendor B has an expensive 1-time integration cost. Vendor C is TBD.",
      "erp": "ERP system costs are pending confirmation. Initial quotes expected Q4.",
      "new-category": "Reserved for other hardware or peripheral subscription pricing."
    },
    vendorNotes: {
      "vendor-a": "Good customer service, highly reliable SLA.",
      "vendor-b": "Enterprise standard, but slow deployment cycles.",
      "vendor-c": "New startup, high discount potential but unproven SLA.",
      "vendor-new": "Under evaluation. No pricing submitted yet."
    },
    criteria: [
      { id: "technical", name: "Technical Competency", description: "API robustness, ERP/Invoicing standard compatibility" },
      { id: "support", name: "SLA & Customer Support", description: "Response times, dedicated account rep, service coverage" },
      { id: "ease", name: "Implementation Ease", description: "Ready connectors, onboarding speed, developer docs" },
      { id: "value", name: "Business Integrity", description: "Vendor history, market share, financials viability" }
    ],
    generalNotes: "This TCO is a 2-year analysis comparison of e-Invoicing, ERP, and associated add-ons. Recommendation based on combined quantitative pricing and qualitative scorecard criteria."
  }
];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  AED: "AED",
};

export const COLOR_PALETTE = [
  "bg-indigo-500 text-indigo-500 border-indigo-500 fill-indigo-500",
  "bg-teal-500 text-teal-500 border-teal-500 fill-teal-500",
  "bg-purple-500 text-purple-500 border-purple-500 fill-purple-500",
  "bg-amber-500 text-amber-500 border-amber-500 fill-amber-500",
  "bg-rose-500 text-rose-500 border-rose-500 fill-rose-500",
  "bg-emerald-500 text-emerald-500 border-emerald-500 fill-emerald-500",
];

export const CATEGORY_COLORS: Record<string, string> = {
  "e-invoicing": "#6366f1", // indigo
  "erp": "#0ea5e9", // sky
  "new-category": "#a855f7", // purple
  "default": "#94a3b8", // slate
};
