# Saksham School Management Platform — Git & GitHub Guide

This guide contains the essential Git commands and best practices required for saving, versioning, and syncing changes in the Saksham codebase.

---

## 🚀 The Daily Development Loop (Stage, Commit, Push)

Whenever you finish a piece of work (like implementing a route, styling a page, or creating config files), run these commands in your terminal:

### 1. Check current status
See which files were modified, created, or deleted.
```bash
git status
```

### 2. Stage changes
Add the files to the commit staging area.
* To stage **all changes**:
  ```bash
  git add .
  ```
* To stage a **specific file** only:
  ```bash
  git add backend/src/index.ts
  ```

### 3. Save locally
Commit your changes with a descriptive message.
```bash
git commit -m "feat: configure Express server and initialize database tables"
```

### 4. Push to remote
Send your local commit up to the GitHub repository:
```bash
git push origin main
```

---

## 📦 Conventional Commit Guidelines
Keep your commit messages clean and uniform. Use these prefixes:
* `feat:` — A new feature (e.g., `feat: build password hashing middleware`)
* `fix:` — A bug fix (e.g., `fix: resolve JWT token verification expiry`)
* `docs:` — Documentation changes (e.g., `docs: create API contracts`)
* `style:` — Changes that do not affect code logic (formatting, CSS spacing, typos)
* `refactor:` — Code restructuring without adding features or fixing bugs
* `chore:` — Repo maintenance, package installs, or dotfile updates

---

## 🛠️ Syncing & Inspecting

### Retrieve fresh changes from GitHub
If changes have been made to the remote repository, run:
```bash
git pull origin main
```

### View log history
View a clean, single-line list of all previous commits:
```bash
git log --oneline
```

### View code changes (Unstaged diffs)
Inspect line-by-line what has changed before you run `git add`:
```bash
git diff
```

---

## 🌿 Working with Feature Branches

Instead of committing everything directly to `main`, it is best practice to build features on separate branches, review them, and then merge.

1. **Create and switch to a new branch**:
   ```bash
   git checkout -b feat/user-auth
   ```
2. **View which branch you are on**:
   ```bash
   git branch
   ```
3. **Switch back to main**:
   ```bash
   git checkout main
   ```
4. **Merge a feature branch into the current branch**:
   Ensure you are on the target branch (e.g. `main`), then run:
   ```bash
   git merge feat/user-auth
   ```

---

## ⚠️ Undoing Mistakes (Use with Caution)

| Scenario | Command | Status |
| :--- | :--- | :--- |
| Discard **uncommitted changes** in a single file | `git restore <file-path>` | Safe |
| Discard **all uncommitted changes** | `git restore .` | ⚠️ Danger (Deletes edits permanently) |
| Undo the **last commit** (keep code files in editor) | `git reset HEAD~1` | Safe |
| Delete the **last commit** AND all its code changes | `git reset --hard HEAD~1` | 🚨 Danger (Deletes work permanently) |
