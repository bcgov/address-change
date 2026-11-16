---
id: ADR_101
title: ADR-101 - Hosting on OpenShift with Patroni-managed PostgreSQL
description: Record the decision to host the Address Change application and its Patroni-managed PostgreSQL database on BC Government Private Cloud OpenShift, considering funding constraints and limitations of the offered on-premises database service.
---

- **Status:** Accepted
- **Decision Date:** September 16, 2026
- **Deciders:** Craig, Poornima
- **Category:** Hosting, Data

## Context

The Address Change application requires hosting for its frontend and backend services and a relational database to persist application data.

Three hosting options were proposed to Craig and Poornima. The on-premises database option included two alternatives:

| Option | Application hosting | Database hosting | Constraints |
| --- | --- | --- | --- |
| 1 | Microsoft Azure | Azure database as a service | Required funding approval was not available. |
| 2a | BC Government Private Cloud OpenShift | Database on newly provisioned on-premises Linux virtual machines | Ordering new virtual machines required funding approval that was not available. |
| 2b | BC Government Private Cloud OpenShift | Offered on-premises Microsoft SQL Server service | Different database versions across environments, restricted development-team access, and a manual DBA-dependent change process. |
| 3 | BC Government Private Cloud OpenShift | PostgreSQL on OpenShift, managed by Patroni | Selected approach within the available funding. |

For Option 2b, the offered Microsoft SQL Server versions differed between non-production and production. This introduced a risk that testing would not accurately reflect production behaviour.

Under that service's operating model, the development team would not be given direct database access in Test or Production. Flyway-based automated migrations were not supported in the offered arrangement, and database changes would have to be requested and carried out by a DBA. This would introduce waiting time and external dependencies for schema changes, troubleshooting, and releases.

A decision was needed to proceed with implementation while supporting consistent environments and automated, version-controlled database migrations.

## Decision

The decision has been approved, and implementation is underway.

We will use **Option 3: OpenShift with PostgreSQL hosted on OpenShift and managed by Patroni**.

We will host the Address Change frontend and backend services on BC Government Private Cloud OpenShift. Test and Production will use Patroni-managed PostgreSQL databases on OpenShift.

We will use a consistent PostgreSQL major version across development, testing, and production, and manage schema changes through version-controlled Flyway migrations executed by the deployment pipeline.

Database access will follow least-privilege controls, with separate credentials for application runtime access and schema migrations.

This decision covers application hosting, database hosting, and the database change delivery approach. Database sizing, backup retention, recovery objectives, monitoring, and disaster recovery procedures will be defined separately.

## Rationale

Option 3 allows implementation to proceed within the available funding and aligns with the application's existing OpenShift deployment approach.

Azure database as a service and new on-premises Linux virtual machines could not proceed because the required funding approval was not available.

The offered on-premises Microsoft SQL Server service was rejected because its environment versions and operating model did not meet the application's delivery needs. Different versions between non-production and production would reduce confidence in testing. Restricted development-team access and reliance on DBA-executed changes would also limit troubleshooting and delay database changes and releases.

Using a consistent PostgreSQL major version across environments reduces compatibility differences. Flyway enables database changes to be version-controlled, reviewed, and applied through a repeatable deployment process.

Patroni provides PostgreSQL high availability management, including leader election and automated failover. The team retains responsibility for database maintenance, backups, monitoring, and recovery procedures.

The decision may be revisited if funding availability, the offered database services, or operational requirements change.
