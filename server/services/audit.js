const MAX_ENTRIES = 3000;

/** A small, human-readable trail of important admin decisions. */
export function createAuditService({ store }) {
  function record({ actor, action, target = '', details = '' }) {
    store.add('auditLog', {
      at: Date.now(),
      action,
      target,
      details,
      actorId: actor ? actor.id : null,
      actorName: actor ? actor.name || actor.username || '' : '',
      actorRole: actor ? actor.role : '',
    });
    trim();
  }

  function trim() {
    if (store.count('auditLog') <= MAX_ENTRIES) return;
    const oldest = store
      .list('auditLog')
      .sort((a, b) => (a.at || 0) - (b.at || 0))
      .slice(0, store.count('auditLog') - MAX_ENTRIES);
    for (const entry of oldest) store.remove('auditLog', entry.id);
  }

  function recent(limit = 30) {
    return store
      .list('auditLog')
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, limit);
  }

  return { record, recent };
}
