# 🔍 GitHub Profile Finder

> Search any developer's GitHub profile and see their stats instantly.

![GitHub Profile Finder](https://img.shields.io/badge/API-GitHub-blue)
![Zero Frameworks](https://img.shields.io/badge/Framework-Zero-green)
![Secure](https://img.shields.io/badge/Security-CSP%20%2B%20Sanitized-success)

**[🚀 Live Demo](https://yourusername.github.io/github-profile-finder)**

---

## ✨ Features

- 🔍 Search any GitHub username instantly
- 🖼️ Profile picture, bio, location, company
- 📊 Followers, following, repos, gists
- 💻 Most used languages with visual bar
- ⭐ Top repositories sorted by stars
- 🔗 Direct link to GitHub profile
- 📱 Fully responsive design
- ⚡ Zero frameworks - vanilla JS only

---

## 🔒 Security

| Measure | Implementation |
|---|---|
| XSS Prevention | All user data sanitized before DOM insertion |
| Input Validation | GitHub username regex + length checks |
| URL Validation | Only `http://` and `https://` protocols allowed |
| Rate Limiting | Max 5 searches per minute (client-side) |
| CSP Headers | Content-Security-Policy restricts resource origins |
| Tab Hijacking | All external links use `rel="noopener noreferrer"` |
| API Key Safety | No API keys needed or used |
| Error Messages | Generic errors — no internal details leaked |

---

## 🛠️ Built With

- **HTML5** — Semantic markup
- **CSS3** — Custom properties, Grid, Flexbox, animations
- **Vanilla JavaScript** — Zero dependencies
- **GitHub REST API v3** — Free, no auth required

---

## 🚀 Getting Started

```bash
# Clone the repo
git clone https://github.com/yourusername/github-profile-finder.git

# Enter directory
cd github-profile-finder

# Open in browser (no build step needed!)
open index.html
