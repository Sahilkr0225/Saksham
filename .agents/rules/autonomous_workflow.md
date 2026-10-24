---
trigger: always_on
---

# Autonomous Workflow & Self-Review (Saksham ERP Only)

> **Workspace Scope**: Strictly active for `d:\Saksham`. Does not affect any other projects or global settings.


1. **Auto-Accept & Autonomous Execution**:
   - Execute all required file operations, refactoring, and safe development commands proactively.
   - Do not ask the user for permission or manual approval for intermediate code modifications.

2. **Self-Review Protocol**:
   - Perform automated review on all generated/modified code.
   - Run typecheck and builds (`npm run build` in `backend` and `frontend`).
   - Run relevant test suites and verify 100% pass rates.
   - Fix any issues discovered during self-review before handing control back to the user.
