---
status: accepted
---

# Revoke Course Access when a Refund Request is Approved

When an Admin approves a Refund Request, the learner loses Course Access at that moment, before any money moves. We chose this over waiting for the payout because paying out is a separate step with no trigger yet, and a learner could otherwise keep the course and get the money back. Their Progress is kept.

## Considered options

- Revoke when the payout completes. Rejected: nothing signals completion today, so access would never end.

## Consequences

If the payout fails later, the learner has no access and no money. The `refunds` row keeps the approval time, which is the only record that they once had access, because the enrollment is deleted.
