// Questionnaire definition, ported unchanged from the offline Needs Analyzer
// (revalor-needs-analyzer/public/questions.js). Field ids are used by rules.ts and
// stored in assessments, so keep them identical in both apps.

export type FieldType = "text" | "textarea" | "number" | "select" | "multi" | "yesno" | "scale";

export interface Field {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  help?: string;
  low?: string;
  high?: string;
}

export interface Section {
  id: string;
  title: string;
  intro?: string;
  /** Consultant-only: hidden in client mode and never shown on the proposal. */
  internal?: boolean;
  fields: Field[];
}

export const SECTIONS: Section[] = [
  {
    id: 'business', title: 'The business', intro: 'Start with the basics.',
    fields: [
      { id: 'bizName', label: 'Business name', type: 'text' },
      { id: 'contactName', label: 'Owner / main contact', type: 'text' },
      { id: 'contactEmail', label: 'Contact email', type: 'text' },
      { id: 'industry', label: 'Industry', type: 'select', options: ['Home services / trades', 'Health & wellness', 'Beauty & salon', 'Fitness', 'Professional services', 'Real estate', 'Retail', 'Restaurant / food', 'Nonprofit / church', 'Other'] },
      { id: 'website', label: 'Website address', type: 'text', placeholder: 'example.com' },
      { id: 'sitePlatform', label: 'Website built on', type: 'select', options: ['No website', 'WordPress', 'Squarespace', 'Wix', 'Webflow', 'Framer', 'Shopify', 'GoDaddy builder', 'Custom / not sure'] },
      { id: 'siteHappy', label: 'How happy are they with their website?', type: 'scale', low: 'Embarrassed', high: 'Love it' },
      { id: 'teamSize', label: 'Team size', type: 'select', options: ['Just me', '2–5', '6–20', '21–50', '50+'] },
      { id: 'locations', label: 'Locations', type: 'select', options: ['1', '2–3', '4+'] },
    ],
  },
  {
    id: 'leads', title: 'Leads & customers', intro: 'How new business finds them — and what happens next.',
    fields: [
      { id: 'leadSources', label: 'Where do new leads come from?', type: 'multi', options: ['Website form', 'Phone calls', 'Email', 'Walk-ins', 'Social media DMs', 'Referrals', 'Google Business Profile', 'Marketplaces (Yelp, Thumbtack, Angi)'] },
      { id: 'leadsPerMonth', label: 'Roughly how many new leads per month?', type: 'number' },
      { id: 'responseTime', label: 'How fast do they usually respond to a new lead?', type: 'select', options: ['Within 1 hour', 'Same day', '1–2 days', 'Longer / inconsistent'] },
      { id: 'leadTracking', label: 'Where are leads tracked?', type: 'select', options: ['Nowhere', 'Paper / notebook', 'Spreadsheet', 'Email inbox', 'A CRM'] },
      { id: 'followUp', label: 'Follow-up on leads that don\'t respond', type: 'select', options: ['We don\'t follow up', 'Manually, when we remember', 'Manually, with a routine', 'Automated'] },
      { id: 'lostLeads', label: 'How often do leads slip through the cracks?', type: 'scale', low: 'Never', high: 'All the time' },
      { id: 'repeatCustomers', label: 'Customer pattern', type: 'select', options: ['Mostly one-time', 'A mix', 'Mostly repeat'] },
      { id: 'avgCustomerValue', label: 'Average value of a new customer ($)', type: 'number', help: 'First purchase or first year — a rough number is fine.' },
    ],
  },
  {
    id: 'scheduling', title: 'Scheduling & bookings',
    fields: [
      { id: 'takesAppointments', label: 'Do customers book appointments or visits?', type: 'yesno' },
      { id: 'bookingMethod', label: 'How do they book today?', type: 'select', options: ['Not applicable', 'Phone / text', 'Email back-and-forth', 'Online booking tool', 'Walk-in only'] },
      { id: 'noShows', label: 'No-shows and late cancellations', type: 'scale', low: 'Rare', high: 'Constant problem' },
      { id: 'staffScheduling', label: 'How is staff scheduled?', type: 'select', options: ['Not applicable', 'Paper / whiteboard', 'Spreadsheet', 'Group texts', 'Scheduling app'] },
    ],
  },
  {
    id: 'sales', title: 'Quotes, invoices & payments',
    fields: [
      { id: 'givesQuotes', label: 'Do they give quotes or estimates?', type: 'yesno' },
      { id: 'quoteTime', label: 'How long does a typical quote take?', type: 'select', options: ['Minutes', 'Under an hour', 'Several hours', 'Days'] },
      { id: 'pricingComplexity', label: 'How is pricing worked out?', type: 'select', options: ['Fixed prices', 'A few options / packages', 'Depends on many factors'] },
      { id: 'invoicing', label: 'How do they invoice?', type: 'select', options: ['Not needed (paid at checkout)', 'Paper', 'Word / Excel templates', 'QuickBooks / Xero', 'Square / Stripe', 'Other software'] },
      { id: 'latePayments', label: 'Late or chased payments', type: 'scale', low: 'Rare', high: 'Constant problem' },
    ],
  },
  {
    id: 'operations', title: 'Operations',
    fields: [
      { id: 'tracksJobs', label: 'How are jobs / orders / projects tracked?', type: 'select', options: ['Not applicable', 'In the owner\'s head', 'Paper', 'Spreadsheet', 'Software'] },
      { id: 'hasInventory', label: 'Do they manage inventory or stock?', type: 'yesno' },
      { id: 'inventoryMethod', label: 'How is inventory tracked?', type: 'select', options: ['Not applicable', 'Not tracked', 'Spreadsheet', 'Software'] },
      { id: 'spreadsheetsCount', label: 'How many spreadsheets help run the business?', type: 'number' },
      { id: 'clientDocs', label: 'Do customers send documents, sign forms, or ask for status updates?', type: 'yesno' },
      { id: 'uniqueProcess', label: 'Is there anything about how they work that off-the-shelf tools just don\'t handle?', type: 'textarea', help: 'Their words. This is where custom builds come from.' },
    ],
  },
  {
    id: 'marketing', title: 'Reputation & marketing',
    fields: [
      { id: 'reviewsAsk', label: 'Do they ask customers for reviews?', type: 'select', options: ['Never', 'Sometimes', 'Always, manually', 'Automated'] },
      { id: 'googleReviews', label: 'About how many Google reviews do they have?', type: 'number' },
      { id: 'emailList', label: 'Customer email list', type: 'select', options: ['No list', 'Have one, don\'t use it', 'Send occasionally', 'Regular campaigns'] },
      { id: 'referralsImportant', label: 'How much of the business comes from referrals?', type: 'scale', low: 'Very little', high: 'Most of it' },
    ],
  },
  {
    id: 'tools', title: 'Tools & integrations',
    fields: [
      { id: 'currentTools', label: 'Tools they use today', type: 'multi', options: ['Google Workspace', 'Microsoft 365', 'QuickBooks', 'Square', 'Stripe', 'Calendly', 'Mailchimp', 'HubSpot', 'Facebook / Instagram', 'Other'] },
      { id: 'needsIntegration', label: 'Do they copy the same data between tools by hand?', type: 'yesno' },
      { id: 'toolsFrustration', label: 'What frustrates them about their current tools?', type: 'textarea' },
    ],
  },
  {
    id: 'team', title: 'Team & leadership',
    fields: [
      { id: 'managers', label: 'How many managers / team leads?', type: 'select', options: ['None', '1', '2–5', '6+'] },
      { id: 'ownerOverwhelm', label: 'How stretched is the owner by decisions and people issues?', type: 'scale', low: 'Handling it', high: 'Drowning' },
    ],
  },
  {
    id: 'priorities', title: 'Priorities, budget & timing',
    fields: [
      { id: 'goals', label: 'What matters most in the next 6 months?', type: 'multi', options: ['More leads', 'Save time', 'Fewer no-shows', 'Get paid faster', 'More reviews', 'Better customer experience', 'Grow the team', 'Understand my numbers'] },
      { id: 'topPains', label: 'Top 3 headaches, in their words', type: 'textarea' },
      { id: 'hoursLost', label: 'Hours per week lost to admin and manual work', type: 'number' },
      { id: 'budget', label: 'One-time budget', type: 'select', options: ['Under $1k', '$1k–$3k', '$3k–$10k', '$10k+', 'Not sure'] },
      { id: 'monthlyBudget', label: 'Monthly budget', type: 'select', options: ['Under $50', '$50–$150', '$150–$500', '$500+', 'Not sure'] },
      { id: 'timeline', label: 'Timeline', type: 'select', options: ['ASAP', '1–3 months', '3–6 months', 'Just exploring'] },
    ],
  },
  {
    id: 'notes', title: 'Consultant notes', internal: true,
    intro: 'Private — never shown on the proposal or client walkthrough.',
    fields: [
      { id: 'siteObservations', label: 'Website observations', type: 'textarea', help: 'Broken forms, no calls to action, slow, not mobile-friendly…' },
      { id: 'decisionMaker', label: 'Is this person the decision-maker?', type: 'yesno' },
      { id: 'redFlags', label: 'Red flags / risks', type: 'textarea' },
      { id: 'consultantNotes', label: 'Other notes', type: 'textarea' },
    ],
  },
];
