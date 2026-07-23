# Saksham School Management Platform — Project Status

> **Living Document** — Update this file at the end of every work session.
> Last Updated: 2026-07-18

---

## 🗺️ Overall Progress

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Planning & Research | ✅ Done |
| Phase 1 | SRS (Foundation Module) | ✅ Done |
| Phase 2 | System Design | ✅ Done |
| Phase 3 | UI/UX | ⬜ Pending |
| Phase 4 | Backend Implementation | 🔄 In Progress |
| Phase 5 | Frontend Implementation | ⬜ Pending |
| Phase 6 | Testing | ⬜ Pending |
| Phase 7 | Deployment | ⬜ Pending |
| Phase 8 | AI Layer | 🔮 Future Scope |

---

## 📦 Module Progress

| # | Module | Layer | SRS | Design | Backend | Frontend | Tests |
|---|--------|-------|-----|--------|---------|----------|-------|
| 1 | Auth & User Management | Foundation | ✅ | ✅ | 🔄 | ⬜ | ⬜ |
| 2 | RBAC | Foundation | ✅ | ✅ | 🔄 | ⬜ | ⬜ |
| 3 | Audit Logs | Foundation | ✅ | ✅ | 🔄 | ⬜ | ⬜ |
| 4 | Academic Structure | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 5 | Admissions | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 6 | Student Management | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 7 | Parent Management | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 8 | Teacher Management | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 9 | Attendance | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 10 | Homework & Assignments | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 11 | Exams & Results | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 12 | Fee Management | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 13 | Notices & Events | Communication | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 14 | Notification Engine | Communication | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 15 | Document Management | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 16 | Reports & Analytics | Analytics | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 17 | Administration & Settings | Foundation | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 18 | Help & Support | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 19 | Gallery & Media | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 20 | Public Website (CMS) | Core ERP | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| — | AI Layer | AI | 🔮 | 🔮 | 🔮 | 🔮 | 🔮 |

---

## 📁 Documents Index

| File | Description |
|------|-------------|
| [foundation_srs.md](phase0_phase1/foundation_srs.md) | Phase 0 & Phase 1 SRS for Foundation module |
| [foundation_schema.md](phase2_system_design/foundation_schema.md) | DB Schema for Auth, RBAC, Audit Logs |
| [foundation_api.md](phase2_system_design/foundation_api.md) | API Contracts for Foundation module |
| [architecture.md](phase2_system_design/architecture.md) | Overall system architecture |

---

## 🔑 Key Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-07-23 | Use Neon.tech Cloud PostgreSQL for development | Easy database start with zero local machine installations |
| 2026-07-23 | Switch to local Docker in future deployment phase | Production environment parity, simple offline migrations |
| 2026-07-18 | AI Layer deferred to future scope | Stability first; AI on top of stable platform |
| 2026-07-18 | One role per user in v1 | Simplicity; multi-role in future |
| 2026-07-18 | Invite-only signup (no self-register) | School controls all accounts |
| 2026-07-18 | PostgreSQL as primary DB | Relational data, ACID compliance needed |
| 2026-07-18 | REST API (`/api/v1/`) | Simpler, well-understood, easier to test |
