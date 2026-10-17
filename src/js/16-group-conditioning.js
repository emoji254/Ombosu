/* ---------------------------------------------------------------
   Group conditioning (a pairing): one conditioning session, one shared timer, results kept per client.
   ss.clientIds = [client, partner]; the first client's results are ss.results, the partner's are
   ss.partnerResults[partnerId]. Saving writes one conditioning log per client (linked by sharedSessionId).
----------------------------------------------------------------*/
const sessionClientIds = ss => (ss && Array.isArray(ss.clientIds) && ss.clientIds.length > 1) ? ss.clientIds : null;
const clientNamesOf = (cid, ss) => (sessionClientIds(ss) || [cid]).map(i => (S.clients[i] || {}).name || 'Client').join(' & ');
/* The other active member of this client's pairing, if there is one and they have no session open. */
function partnerOf(cid){
  const c = S.clients[cid]; if (!c || !c.groupId) return null;
  return groupMembers(c.groupId).find(m => m.id !== cid && !sessionFor(m.id)) || null;
}

