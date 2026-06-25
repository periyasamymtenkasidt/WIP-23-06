// ── Seed scope-of-work data for existing leads ────────────────────────────
// Runs once at app startup. For every Interiors lead that carries a preset +
// grade but NO saved `quoteScopeItems`, this computes the scope items from
// the master preset configuration, maps them to the lead's quality grade,
// and persists the result. After seeding, every lead has a
// `quoteScopeItems` array so the proposal / BOQ / survey / schedule flows
// all reference the lead's own scope data instead of the generic master.

import { getConfigForType } from "./QuotePresets";
import { mapScopeItemsToGrade } from "./gradeMapping";
import { normalizeScopeItem } from "../utils/scopeNaming";
import { TableData } from "./TableData";

/**
 * For a single lead, compute `quoteScopeItems` from the master preset
 * mapped to the lead's quality grade.  Returns `null` if the lead has
 * no preset or is an Architecture lead.
 */
const buildScopeForLead = (lead) => {
  const preset = lead.quotePreset;
  const grade = lead.quoteGrade || "premium";
  const propertyType = lead.propertyType || lead.location || "";

  // Architecture and leads without a package preset are skipped.
  if (!preset) return null;
  if (lead.serviceTrack === "Architecture") return null;

  const cfg = getConfigForType(preset, propertyType);
  if (!cfg || !cfg.scopeItems || cfg.scopeItems.length === 0) return null;

  // Deep-clone, normalize, then map to the lead's grade.
  let items = cfg.scopeItems.map((s) =>
    normalizeScopeItem({
      ...s,
      materials: s.materials ? s.materials.map((m) => ({ ...m })) : [],
    }),
  );
  items = mapScopeItemsToGrade(items, grade);
  return items;
};

/**
 * Seed quoteScopeItems onto every lead that doesn't already have them.
 * Writes to localStorage so this is a one-time operation per browser.
 */
export const seedLeadScopeData = () => {
  try {
    // Read existing localStorage leads
    let storedLeads = [];
    try {
      const raw = localStorage.getItem("newLeadsData");
      if (raw) storedLeads = JSON.parse(raw);
    } catch {
      storedLeads = [];
    }

    const storedById = new Map(
      storedLeads.map((l) => [l.proposalId, l]),
    );

    // Merge: localStorage takes priority, then static TableData
    const allLeads = [
      ...storedLeads,
      ...TableData.filter((td) => !storedById.has(td.proposalId)),
    ];

    let changed = false;
    const updatedLeads = [];

    for (const lead of allLeads) {
      // Skip if already has scope data — keep it unchanged
      if (
        lead.quoteScopeItems &&
        Array.isArray(lead.quoteScopeItems) &&
        lead.quoteScopeItems.length > 0
      ) {
        updatedLeads.push(lead);
        continue;
      }

      // Try to build scope items from the master preset
      const scopeItems = buildScopeForLead(lead);
      if (scopeItems) {
        updatedLeads.push({ ...lead, quoteScopeItems: scopeItems });
        changed = true;
      } else {
        // No scope could be built (Architecture / no preset) — keep as-is
        updatedLeads.push(lead);
        changed = changed || !storedById.has(lead.proposalId);
      }
    }

    if (changed) {
      localStorage.setItem("newLeadsData", JSON.stringify(updatedLeads));
    }
  } catch (err) {
    console.error("[seedLeadScopeData] Failed to seed lead scope data:", err);
  }
};
