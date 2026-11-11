---
status: accepted
---

# Refund Amount is what the learner paid

A Refund is always for `purchase.amountPaid`, the real amount after any purchasing-power discount or coupon. The request flow used to fall back to the course's list price when there was no purchasing-power discount, which overpays whenever a coupon applied or the price changed after the Purchase. The email, the learner's screen, the Admin's screen and the recorded `amountRefunded` all use this one number.

## Considered options

- Use the list price when there is no purchasing-power discount. Rejected: it can refund more than the learner paid.
