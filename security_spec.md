# Dois Amores Security Rules Specification

## Data Invariants
1. **Admin Isolation**: Only verified admin accounts (`maiconsillva2025@gmail.com` or UIDs listed in `/admins/{uid}`) may read/write operational, financial, and administrative collections (`/expenses`, `/payments`, `/auditLogs`, `/admins`, `/storeSettings` writes, `/products` writes, `/categories` writes, `/addons` writes, `/coupons` list/writes).
2. **PII Protection on Orders**: Customer PII (`customerPhone`, `address`, `cep`, `number`, `neighborhood`) in `/orders/{orderId}` can ONLY be read or listed by admins or the authenticated owner (`customerUid == request.auth.uid`). Public order tracking uses `/orderTracking/{trackingId}` keyed by an unguessable token and contains zero PII, with `allow list: if false`.
3. **Order Lifecycle Integrity**: Customers creating an order must set `status == 'received'` and `paymentStatus == 'pending'`. Only admins can advance status, confirm payments, or cancel with justification. Orders cannot be deleted (`allow delete: if false`).
4. **Post-Purchase Review Verification**: Creating a review in `/reviews/{reviewId}` requires referencing a valid non-cancelled `/orderTracking/{trackingId}` matching `orderId` and containing `productId`, forces `status == 'pending'`, `adminReply == ''`, restricts `rating` to integer `1..5`, and validates `customerUid == request.auth.uid` whenever provided. Only admins may moderate reviews (`approved`/`rejected`) or post `adminReply`. Public reads expose `status == 'approved'`, and verified users can also read their own submitted reviews (`customerUid == request.auth.uid`).
5. **Immutable Audit Trail**: `/auditLogs/{logId}` can only be created by admins with server timestamp and cannot be updated or deleted.
6. **Customer Profile Isolation**: `/users/{userId}` can only be read or updated by the verified user matching `userId` (or admins), with `role == 'customer'` locked on creation and updates.

## Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated client attempts `list` on `/orders` -> DENIED (PII leak).
2. Unauthenticated client creates `/orders/o1` with `status: 'confirmed'` or `paymentStatus: 'paid'` -> DENIED.
3. Unauthenticated client creates `/orders/o1` with shadow field `isFree: true` -> DENIED.
4. Non-admin authenticated user attempts to write `/admins/{uid}` -> DENIED (privilege escalation).
5. Non-admin client attempts to create `/reviews/r1` with `status: 'approved'` -> DENIED (moderation bypass).
6. Non-admin client creates `/reviews/r1` with `rating: 6` or fake non-existent `trackingId` -> DENIED.
7. Unauthenticated client attempts `list` on `/orderTracking` -> DENIED.
8. Non-admin client attempts `delete` on `/orders/o1` -> DENIED.
9. Non-admin client attempts `read` or `create` on `/expenses/e1` -> DENIED.
10. Unverified email user attempts admin operation -> DENIED (`email_verified == true` required).
11. Client attempts `update` on `/reviews/r1` to change `rating` after submission -> DENIED.
12. Client injects oversized 5KB string into `productId` or `orderId` path -> DENIED (`isValidId`).
