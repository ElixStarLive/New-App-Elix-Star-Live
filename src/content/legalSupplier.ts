/** Canonical PAGE-066 Supplier Agreement copy. Approved legal text only. */

export const LEGAL_SUPPLIER_TITLE = "Supplier Agreement";
export const LEGAL_SUPPLIER_UPDATED = "Last updated: July 15, 2026";
export const LEGAL_SUPPLIER_COMPANY = "Elix Star Live Ltd";
export const LEGAL_SUPPLIER_BUSINESS = "info@elixstarlive.co.uk";
export const LEGAL_SUPPLIER_SUPPORT = "support@elixstarlive.co.uk";

export type LegalSupplierParagraph = {
  text: string;
  company?: boolean;
  strong?: string;
  spaced?: boolean;
};

export type LegalSupplierBullet = {
  text?: string;
  label?: string;
  value?: string;
};

export type LegalSupplierSection = {
  title: string;
  paragraphs?: readonly LegalSupplierParagraph[];
  bullets?: readonly LegalSupplierBullet[];
  footer?: string;
};

export const LEGAL_SUPPLIER_SECTIONS: readonly LegalSupplierSection[] = [
  {
    title: "1. Parties",
    paragraphs: [
      {
        text: 'This Supplier Agreement ("Agreement") is between Elix Star Live Ltd ("Buyer", "we", "us"), registered in England and Wales, and the supplier named in the commercial schedule or order ("Supplier", "you").',
        company: true,
      },
      {
        text: "The Shop in Elix Star Live is buy-only for end users. End users do not sell to each other. You supply goods or approved products to Elix Star Live Ltd for us to offer and sell to customers.",
        strong: "buy-only for end users",
        spaced: true,
      },
    ],
  },
  {
    title: "2. Supply of Goods",
    bullets: [
      { text: "You will supply the goods described in purchase orders, schedules, or written confirmations we issue." },
      { text: "Goods must match description, quantity, quality, packaging, and labelling specifications." },
      { text: "You must have clear title to the goods and the right to sell them to us." },
      { text: "Delivery times, Incoterms (if any), and places of delivery will be set in writing per order." },
    ],
  },
  {
    title: "3. Compliance & Product Safety",
    bullets: [
      { text: "Goods must comply with applicable UK and destination-market laws (product safety, labelling, chemicals, consumer protection, import rules)." },
      { text: "You must not supply illegal, counterfeit, stolen, hazardous (unless agreed in writing), or otherwise prohibited items." },
      { text: "You will provide certificates, manuals, warranties, and safety data on request." },
      { text: "You will cooperate promptly with product recalls, withdrawals, and regulator requests." },
    ],
  },
  {
    title: "4. Intellectual Property",
    bullets: [
      { text: "You warrant that goods and branding you supply do not infringe third-party IP rights." },
      { text: "You grant us a non-exclusive licence to use your product names, images, and trademarks solely to market and sell the goods in our Shop and related channels." },
      { text: "Our App branding and platform remain our property." },
    ],
  },
  {
    title: "5. Pricing, Invoices & Payment",
    bullets: [
      { text: "Prices are as agreed in writing (schedule or purchase order)." },
      { text: "Unless otherwise agreed, invoices are payable by bank transfer to the Supplier account on the invoice after acceptance of delivery." },
      { text: "Payment terms (for example Net 30) and currency (often GBP) will be stated in the commercial schedule." },
      { text: "You are responsible for your own taxes; provide valid VAT/tax details where required." },
    ],
  },
  {
    title: "6. Title, Risk & Returns",
    bullets: [
      { text: "Risk and title transfer as agreed in writing (for example on delivery and/or payment)." },
      { text: "We may reject non-conforming goods and require repair, replacement, or credit." },
      { text: "Customer returns under consumer law may require you to accept return stock or credit as agreed." },
    ],
  },
  {
    title: "7. Confidentiality",
    paragraphs: [
      {
        text: "Each party must keep the other's confidential commercial information secure and use it only to perform this Agreement, except where disclosure is required by law.",
      },
    ],
  },
  {
    title: "8. Liability & Indemnity",
    bullets: [
      { text: "You indemnify us against claims arising from defective goods, IP infringement, regulatory non-compliance, or your breach of this Agreement." },
      { text: "Nothing excludes liability that cannot be limited by law (for example death/personal injury caused by negligence, or fraud)." },
    ],
  },
  {
    title: "9. Term & Termination",
    bullets: [
      { text: "Either party may terminate for material breach not cured within a reasonable written notice period." },
      { text: "We may suspend or stop ordering if goods or practices create safety, legal, or reputational risk." },
      { text: "Survival: confidentiality, IP warranties, indemnity, and accrued payment obligations continue after termination." },
    ],
  },
  {
    title: "10. Governing Law",
    paragraphs: [
      {
        text: "This Agreement is governed by the laws of England and Wales. Courts of England and Wales have exclusive jurisdiction.",
      },
    ],
  },
  {
    title: "11. Contact",
    bullets: [
      { label: "Company:", value: "Elix Star Live Ltd" },
      { label: "Business:", value: "info@elixstarlive.co.uk" },
      { label: "Support:", value: "support@elixstarlive.co.uk" },
    ],
    footer:
      "This page is a standard supplier framework for the buy-only Shop. A signed purchase order or commercial schedule with price, SKUs, delivery, and payment terms is required for a binding supply relationship. Have a solicitor review before high-value deals.",
  },
];

export const LEGAL_SUPPLIER_SECTION_TITLES = LEGAL_SUPPLIER_SECTIONS.map((section) => section.title);
