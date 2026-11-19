---
id: ADR_102
title: ADR-102 - Synchronous Partner Updates Through SDX/P2P Using User Access Tokens
description: Record the decision to synchronously update partner backends through SDX/P2P using user access tokens, rely on P2P for privacy-zone identifier translation, and support user-triggered retries with token renewal.
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

Partner requests may fail, and access tokens may expire before a user retries. The application therefore needs both a frontend retry option and a way to renew the user's access token.

## Decision

We will use **synchronous partner updates through SDX/P2P, authorized using user access tokens, with P2P responsible for privacy-zone identifier translation**.

When a logged-in user submits an address change:

1. The Address Change backend will submit updates to all relevant partner APIs through SDX/P2P.
2. Requests will use the authenticated user's authorization context.
3. P2P will translate that identity context into the identifier required by the destination partner's privacy zone, using the capability currently under development.
4. The application will return the partner update outcomes to the frontend.
5. If any partner request fails, the frontend will ask the user to try again.

When the user selects **Try again**, the backend will use the user's refresh token to request a new access token from the authorization server. It will then use the resulting access token, through the agreed SDX/P2P authorization flow, to retry the unsuccessful partner requests.

Refresh tokens will be handled on the server and used only with the authorization server. Partner API requests will carry access tokens. If the refresh token is expired, revoked, or otherwise rejected, the user will need to authenticate again before retrying.

Address Change will rely on P2P for identifier translation. It will not request partner privacy-zone identifiers from users, persist those identifiers, or maintain mappings between privacy zones.

A callback mechanism may be implemented, if needed, to confirm the final status of partner updates when a synchronous response is not received.

The detailed integration design will confirm token handling, partner-specific audiences and permissions, any required token exchange, refresh-token lifecycle management, timeouts, and duplicate prevention.

## Rationale

Synchronous processing allows the application to present partner update outcomes during the user's interaction and offer a retry option when a request fails.

Using user access tokens follows the architecture team's direction and supports partner requests made in the authenticated user's context. Refresh tokens allow the application to obtain new access tokens without requiring another sign-in while the refresh authorization remains valid.

Token renewal supports authorization for another attempt. It does not resolve partner outages, validation errors, or other causes of request failure.

Delegating identifier translation to P2P removes the need for Address Change to collect partner privacy-zone identifiers or maintain cross-zone identity mappings.

This approach depends on SDX/P2P availability, successful identifier translation, partner API availability, and support for the required token refresh flow. Because P2P's identifier translation capability is still being developed, its readiness and integration contract may affect delivery.

Each partner processes its own address update, so some updates may succeed while others fail. If a partner does not respond in time, the application may need confirmation of whether the update was completed. Retry handling must account for updates that have already succeeded and avoid unintended duplicate processing.

Retries in this flow remain user-initiated. If the user leaves before completing them, some partner updates may remain incomplete.

The decision may be revisited if P2P capabilities, partner authentication requirements, or requirements for completing failed updates change.
