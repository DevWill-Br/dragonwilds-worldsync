// A stable file alone is not proof that the engine completed persistence.
export function validateFinalSave(confirmed, final, latest) {
  if (!confirmed?.success || !final?.exclusive || final.bytes < 1) throw new Error('UNCONFIRMED_SAVE');
  const same = (a, b) => a.sha256 === b.sha256 && a.bytes === b.bytes && a.mtimeUtc === b.mtimeUtc;
  if (same(confirmed, final)) return confirmed;
  if (latest?.success && latest.eventOffset > confirmed.eventOffset && same(latest, final)) return latest;
  throw new Error('UNCONFIRMED_SAVE_CHANGE');
}
