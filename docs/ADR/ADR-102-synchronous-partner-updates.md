---
id: ADR_102
title: ADR-102 - Synchronous Partner Updates Through SDX/P2P Using User Access Tokens
description: Record synchronous partner updates through SDX/P2P using user access tokens, P2P privacy-zone identifier translation, frontend-managed token renewal, and database-backed partner retries.
---

- **Status:** Accepted
- **Decision Date:** To be confirmed
- **Deciders:** Om, Marcos, Harshit, Aiden
- **Category:** Integration, Authentication, Identity

## Context

The Address Change application must submit address updates to the relevant partner backend systems when an authenticated user requests an address change.

Partner systems will expose their address update APIs through SDX/P2P. The application will call these APIs synchronously during the user's interaction and present the update outcomes on the frontend.

The same person can have different identifiers across privacy zones. For example, these illustrative identifiers could represent the same person:

| Identity context | Illustrative user identifier |
| --- | --- |
| BCSC context | `Harshit123` |
| Health privacy zone | `Harshit456` |

P2P is being developed to translate the authenticated user's identity context into the identifier required by the destination partner's privacy zone. This will allow Address Change to submit partner updates without asking users for these identifiers or maintaining its own mappings between privacy zones.

Client credentials were requested for authenticating partner API calls. The architecture team directed the application to use the authenticated user's token instead.

| Option | Partner API authorization | Outcome |
| --- | --- | --- |
| 1 | Application access tokens obtained through the client credentials grant | Requested approach; not selected following the architecture team's direction. |
| 2 | Access tokens representing the authenticated user, through SDX/P2P | Selected approach, following the architecture team's direction. |

Partner requests may fail, and access tokens may expire before a user retries. The application therefore needs both a frontend retry option and a way to renew the user's access token. Partner callout outcomes must also be persisted so retries do not repeat successful updates.

## Decision

We will use **synchronous partner updates through SDX/P2P, authorized using user access tokens, with P2P responsible for privacy-zone identifier translation**.

The frontend is a public OIDC client using the Authorization Code flow with PKCE through `oidc-client-ts`. The browser-based OIDC client obtains and renews tokens from the authorization server. The backend validates the user's access token and uses the agreed SDX/P2P authorization flow for partner calls.

When a logged-in user submits an address change:

1. The Address Change backend will submit updates to all relevant partner APIs through SDX/P2P.
2. Requests will use the authenticated user's authorization context.
3. P2P will translate that identity context into the identifier required by the destination partner's privacy zone, using the capability currently under development.
4. The application will return the partner update outcomes to the frontend.
5. If any partner request fails, the frontend will ask the user to try again.

When the user selects **Try again**, the frontend will submit the retry request to the backend with a valid user access token. The frontend OIDC client handles renewal when needed, using a valid refresh token, when issued by the authorization server, before the API request. A partner failure does not itself require a new access token.

Refresh tokens are handled by the frontend OIDC client and sent only to the authorization server. They are not sent to or stored by the Address Change backend or partner APIs. If the frontend cannot obtain a valid access token through the configured renewal flow, the user will need to authenticate again before retrying.

The backend will store a record of every partner integration callout through P2P and its outcome in the application database, linked to the original address change request and target partner. On retry, the backend will consult these records and skip partners with a recorded successful outcome for that request. These records track delivery status without storing tokens or mappings between user identifiers in different privacy zones.

Address Change will rely on P2P for identifier translation. It will not request partner privacy-zone identifiers from users, persist those identifiers, or maintain mappings between privacy zones.

A callback mechanism may be implemented, if needed, to confirm the final status of partner updates when a synchronous response is not received.

The detailed integration design will confirm partner-specific audiences and permissions, any required token exchange, frontend token-renewal configuration, callout-record lifecycle, timeouts, and duplicate prevention.

## Rationale

Synchronous processing allows the application to present partner update outcomes during the user's interaction and offer a retry option when a request fails.

Using user access tokens follows the architecture team's direction and supports partner requests made in the authenticated user's context. Keeping token acquisition and renewal with the frontend OIDC client matches the public-client PKCE authentication flow and allows access tokens to be renewed while the refresh authorization remains valid.

Token renewal supports authorization for another attempt. It does not resolve partner outages, validation errors, or other causes of request failure.

Delegating identifier translation to P2P removes the need for Address Change to collect partner privacy-zone identifiers or maintain cross-zone identity mappings.

This approach depends on SDX/P2P availability, successful identifier translation, partner API availability, and support for the required token refresh flow. Because P2P's identifier translation capability is still being developed, its readiness and integration contract may affect delivery.

Each partner processes its own address update, so some updates may succeed while others fail. Database records preserve each partner's outcome so successful partners are not called again on retry. If a partner does not respond in time, its outcome remains unconfirmed; the application must confirm the result or use duplicate-prevention safeguards before repeating the call.

Retries in this flow remain user-initiated. If the user leaves before completing them, some partner updates may remain incomplete.

The decision may be revisited if P2P capabilities, partner authentication requirements, or requirements for completing failed updates change.
