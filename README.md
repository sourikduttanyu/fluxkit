# ARTKITv2

A video art gallery — upload art videos, browse and watch them.

---

## How It Works (Big Picture)

Think of it like YouTube, but just for this art community.

```
YOU (browser)
    |
    |  1. Open the website
    v
WEBSITE (frontend)
    |
    |  2. Want to upload a video?
    v
CLOUDINARY (video storage)
    |
    |  3. Video gets stored + compressed automatically
    |  4. Cloudinary gives back a link to the video
    v
DATABASE (stores info about the video)
    |  title, who uploaded it, the Cloudinary link, upload date
    |
    |  5. Someone visits the gallery
    v
WEBSITE (frontend)
    |  fetches video list from database
    |  plays videos directly from Cloudinary
    v
VIEWER (browser)
```

---

## Where Does the Video Actually Live?

**Cloudinary** — a service that stores and serves videos over the internet.

- You upload once → they handle the rest
- Videos are served from servers close to the viewer (fast loading)
- Free tier: 25 GB storage, 25 GB monthly bandwidth
- You never need to manage a server for video storage

The **database** only stores *information about* the video (title, link, uploader) — not the video file itself.

---

## Data Flow Step by Step

| Step | What happens | Where |
|------|-------------|-------|
| 1 | User picks a video file | Browser |
| 2 | App sends file to Cloudinary | Browser → Cloudinary |
| 3 | Cloudinary stores & compresses it | Cloudinary servers |
| 4 | Cloudinary returns a URL | Cloudinary → App |
| 5 | App saves title + URL + metadata | App → Database |
| 6 | Gallery page loads video list | Database → App |
| 7 | Videos stream to viewer | Cloudinary → Viewer |

---

## Components

```
ARTKITv2/
├── frontend/        # What users see (website UI)
├── backend/         # Server that talks to database
└── README.md        # This file
```

- **Frontend** — the gallery website (buttons, video player, upload form)
- **Backend** — handles logins, saves video info, talks to the database
- **Cloudinary** — external service that stores and streams videos
- **Database** — stores video titles, links, user info

---

## How to Run This Project (No coding experience needed!)

Follow these steps exactly. If anything goes wrong, read the error message and check the **Troubleshooting** section at the bottom.

### Step 1 — Install Node.js

1. Go to https://nodejs.org
2. Click the big **LTS** button to download
3. Open the downloaded file and follow the installer (just keep clicking Next/Continue)
4. When done, open **Terminal** (Mac) or **Command Prompt** (Windows)
5. Type this and press Enter to confirm it worked:
   ```
   node --version
   ```
   You should see a number like `v20.x.x`

### Step 2 — Download this project

If you got this as a ZIP file:
1. Unzip it
2. Open Terminal / Command Prompt
3. Type `cd ` (with a space after), then drag the unzipped folder into the terminal window, then press Enter

If you have Git installed:
```
git clone https://github.com/sourikduttanyu/ARTKITv2.git
cd ARTKITv2
```

### Step 3 — Install dependencies

In your terminal, run:
```
npm install
```
Wait for it to finish (may take a minute).

### Step 4 — Start the project

```
npm start
```

Then open your browser and go to: **http://localhost:3000**

---

## Troubleshooting

**"command not found: node"** — Node.js didn't install correctly. Redo Step 1.

**"command not found: npm"** — Same fix as above.

**Port already in use** — Something else is running on port 3000. Restart your computer and try again.

**Anything else** — Take a screenshot of the error and send it to Sourik.
