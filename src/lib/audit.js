/**
 * writeAudit — append a structured row to audit_logs.
 *
 * Pass the same `tx` (transaction client) used by the operation so the audit
 * row commits atomically WITH the thing it records. If the booking rolls back,
 * its audit row rolls back too — you never log a booking that didn't happen.
 */
export async function writeAudit(client, { action, actorId, rideId, bookingId, details }) {
  await client.auditLog.create({
    data: { action, actorId, rideId, bookingId, details: details ?? {} },
  });
}
