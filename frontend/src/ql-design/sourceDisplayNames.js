/**
 * Friendly labels for agents / sub-sources so client-facing UIs
 * do not show internal or third-party company identifiers.
 * Keys are exact agent_name or sub_source ids from the API.
 */
const SOURCE_DISPLAY_NAMES = {
  // Master agents
  revenue_agent: 'Finance',
  beat_agent: 'Observability',
  meridian_agent: 'Portfolio',
  novadash_agent: 'Growth',
  avani_agent: 'Retail',
  mvw_agent: 'Hospitality',
  forge_agent: 'Markets',
  evolus_agent: 'Med Catalog',
  radium_agent: 'Radium',
  kestiq_agent: 'Kestiq',

  // Sub-sources / legacy skill ids
  domain: 'Finance Metrics',
  beat_observability: 'QA Observability',
  meridian_ventures: 'Portfolio Lab',
  InvestmentMemos: 'Portfolio Memos',
  BoardMeetingNotes: 'Board Notes',
  MarketSectorReports: 'Sector Reports',
  novadash: 'Growth Analytics',
  NovaDashCsNotes: 'Growth CS Notes',
  NovaDashMarketReport: 'Growth Market Report',
  NovaDashProductFeedback: 'Growth Product Feedback',
  avani_lifestyle: 'Retail Ops',
  AvaniExecMemos: 'Retail Exec Memos',
  AvaniMarketIntel: 'Retail Market Intel',
  AvaniProductNotes: 'Retail Product Notes',
  AvaniStoreReports: 'Retail Store Reports',
  mvw: 'Hospitality Lab',
  MVWMarketIntel: 'Hospitality Market Intel',
  MVWOwnerFeedback: 'Hospitality Owner Feedback',
  MVWResortReports: 'Hospitality Resort Reports',
  forge_global: 'Markets Desk',
  ForgeKYCAMLReports: 'Markets KYC Reports',
  ForgeSecFormD: 'Markets Form D',
  ForgeValuationMemos: 'Markets Valuation Memos',
  evolus: 'Med Catalog',
  Radium: 'Radium',
  kestiq: 'Kestiq',
};

export function formatSourceLabel(raw) {
  if (raw == null || raw === '') return '';
  const key = String(raw);
  if (SOURCE_DISPLAY_NAMES[key]) return SOURCE_DISPLAY_NAMES[key];
  // Fallback: strip _agent and title-case
  return key
    .replace(/_agent$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export { SOURCE_DISPLAY_NAMES };
