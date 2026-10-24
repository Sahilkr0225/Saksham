# Saksham ERP - Autonomous Execution & Self-Review Policy

> **Scope**: This policy is strictly scoped to the **Saksham ERP** repository (`d:\Saksham`). It does not apply to any other projects or workspaces.


## 1. Autonomous Execution & Auto-Approval
- **No Manual Confirmation Prompts**: Do not pause to ask the user for permission, approval, or review before making code edits, creating files, or executing safe terminal commands (builds, tests, migrations).
- **End-to-End Execution**: When the user requests a feature, bug fix, or modification, proceed autonomously through planning, implementation, and verification without waiting for manual approval between steps.

## 2. Self-Review & Quality Assurance
- **Autonomous Review**: The agent is responsible for reviewing its own code before considering any task complete.
- **Validation Pipeline**:
  1. Inspect changes to ensure consistency with existing coding standards, design tokens, and project architecture.
  2. Verify build integrity (`npm run build` for backend and frontend).
  3. Run relevant automated test suites (`npx ts-node src/test_*.ts`) to ensure zero regressions.
- **Autonomous Troubleshooting**: If an error, type mismatch, or failing test is encountered, debug and fix it immediately without prompting the user.

## 3. Communication Style
- Keep responses concise, direct, and actionable.
- Present clear diffs and test results upon completion.
- State what was done, what passed verification, and present the next logical milestone.
