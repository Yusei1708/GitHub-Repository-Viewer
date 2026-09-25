# Privacy Policy — GitHub Repository Viewer Chrome Extension

Last updated: September 25, 2026

GitHub Repository Viewer ("the Extension") is committed to protecting your privacy. This Privacy Policy explains how information is handled when you use the Extension.

---

## 1. Information Collection & Use

- **Personal Access Token (PAT)**:
  The Extension requires a user-provided GitHub Personal Access Token to authenticate with the GitHub REST API.
  - The token is stored **exclusively locally on your device** using `chrome.storage.local`.
  - The token is **never** sent to any external server, database, analytics tool, or third-party service other than official GitHub API endpoints (`https://api.github.com`).
  - The token is never logged in console outputs or recorded in tracking systems.

- **GitHub Profile & Repository Metadata**:
  The Extension retrieves read-only metadata (such as username, avatar URL, repository names, descriptions, and update timestamps) directly from GitHub.
  - This data is cached locally on your device for fast rendering.
  - It is not collected, transmitted, sold, or shared with anyone.

---

## 2. Permissions Justification

- **`storage`**: Used solely to store your GitHub Personal Access Token and cached repository metadata locally on your browser.
- **`host_permissions: https://api.github.com/*`**: Used solely to communicate directly with the official GitHub REST API to fetch your account profile and repository list.

---

## 3. Data Deletion (Disconnect)

You can purge all stored data at any time by clicking the **Disconnect** button inside the Extension popup. This action immediately deletes your token, profile, and all cached data from your local browser storage.

---

## 4. Contact

If you have any questions or feedback regarding this Extension, please open an issue on GitHub:
https://github.com/Yusei1708/GitHub-Repository-Viewer/issues
