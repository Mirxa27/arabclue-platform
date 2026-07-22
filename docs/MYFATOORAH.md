# MyFatoorah Integration

## Adapter

`src/lib/myfatoorah.ts` — sole production payment adapter.

| Concern | Implementation |
| --- | --- |
| Country | SAU |
| Currency | SAR |
| Sandbox host | `https://apitest.myfatoorah.com` |
| Production host | `https://api-sa.myfatoorah.com` |
| Auth | Bearer token from encrypted `EnvSetting` / env |
| Checkout | `POST /v2/SendPayment` |
| Status | `POST /v2/GetPaymentStatus` |
| Methods | `POST /v2/InitiatePayment` |
| Recurring | `POST /v2/ExecutePayment` + `RecurringModel` (when enabled) |
| Webhook | `POST /api/billing/webhook` |

## Webhook V2

- Header: `myfatoorah-signature`
- Algorithm: HMAC-SHA256 over event-specific `path=value,...` canonical string (not raw body)
- Persist `PaymentWebhookEvent` before side effects
- Deduplicate on `eventFingerprint`
- Fulfill entitlements only after paid status + amount/currency match

## Admin

View: **Payments → MyFatoorah** (`?view=admin_myfatoorah`)

- Mode sandbox / production_sa
- Write-only API token and webhook secret
- Webhook URL copy
- Connection test (methods + recurring probe)
- Signature canonicalization test
- Recent webhook events table

## Money

ArabClue plan prices are authoritative server-side. Checkout never trusts client amounts. Minor-unit helpers `sarToMinorUnits` / `minorUnitsToSar` available at adapter boundary.
