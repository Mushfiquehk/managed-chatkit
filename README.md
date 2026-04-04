# Managed ChatKit starter

https://git-codecommit.us-east-1.amazonaws.com/v1/repos/data_maintanance

Vite + React UI that talks to a FastAPI session backend for creating ChatKit
workflow sessions.

## Quick start

```bash
npm install           # installs root deps (concurrently)
npm run dev           # runs FastAPI on :8000 and Vite on :3000
```

What happens:

- `npm run dev` runs the backend via `backend/scripts/run.sh` (FastAPI +
  uvicorn) and the frontend via `npm --prefix frontend run dev`.
- The backend exposes `/api/create-session`, exchanging your workflow id and
  `OPENAI_API_KEY` for a ChatKit client secret. The Vite dev server proxies
  `/api/*` to `127.0.0.1:8000`.

## Required environment

- `OPENAI_API_KEY`
- `CHATKIT_WORKFLOW_ID`
- (optional) `CHATKIT_API_BASE` (defaults to `https://api.openai.com`)
- (optional) `API_URL` (override the dev proxy target for `/api`)

Set the env vars in your shell (or process manager) before running. Use a
workflow id from Agent Builder (starts with `wf_...`) and an API key from the
same project and organization.

## Customize

- UI: `frontend/src/components/ChatKitPanel.tsx`
- Session logic: `backend/app/main.py`

---

## Running Locally with Docker

This section covers how to run and test the full application using Docker, either via Docker Desktop or the Docker CLI.

### Prerequisites

- **Docker**: [Install Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker CLI) or [install Docker Engine](https://docs.docker.com/engine/install/) for CLI-only.
- **Environment variables**: Create a `.env` file in the project root with the required values.

### 1. Create a `.env` file

In the project root, create a `.env` file with the required environment variables:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
CHATKIT_WORKFLOW_ID=wf_your-workflow-id-here
MSAL_CLIENT_ID=your-msal-client-id-optional
MSAL_TENANT_ID=your-msal-tenant-id-optional
BACKUP_PASSWORD=your-backup-password-optional
ALLOWED_ORIGINS=localhost,127.0.0.1,chat.mhkbd.me
```

**Notes**:
- `OPENAI_API_KEY`: Required. Get from your OpenAI project dashboard.
- `CHATKIT_WORKFLOW_ID`: Required. Must start with `wf_`. Get from Agent Builder.
- `MSAL_CLIENT_ID` & `MSAL_TENANT_ID`: Optional. If **both** are set, uses Azure AD authentication. If **both** are unset, falls back to basic password auth (see below).
- `BACKUP_PASSWORD`: Optional. Used for basic password authentication fallback (defaults to `ilovepizza`).
- `ALLOWED_ORIGINS`: Optional. Comma-separated list for CORS (defaults to `localhost,127.0.0.1`).

### 2. Running with Docker Desktop

**Option A: Using Docker Desktop UI**

1. Open Docker Desktop.
2. In a terminal, navigate to the project root:
   ```bash
   cd /path/to/managed-chatkit
   ```
3. Start the application:
   ```bash
   docker compose up
   ```
4. Wait for both services to be ready. You should see logs like:
   ```
   backend  | INFO:     Uvicorn running on http://0.0.0.0:8000
   frontend | ✓ ready in 123ms
   ```
5. Access the application:
   - **Frontend**: http://localhost (Port 80)
   - **Backend Health Check**: http://localhost:8000/health

**Option B: Using Docker Desktop with Detached Mode**

To run in the background:

```bash
docker compose up -d
```

View logs:
```bash
docker compose logs -f       # Follow all logs
docker compose logs -f backend  # Follow only backend logs
```

Stop the application:
```bash
docker compose down
```

### 3. Running with Docker CLI

**Option A: Using `docker build` and `docker run` (Manual)**

Build the images:
```bash
docker build -t managed-chatkit-backend:latest -f backend/Dockerfile .
docker build -t managed-chatkit-frontend:latest -f frontend/Dockerfile \
  --build-arg CHATKIT_WORKFLOW_ID=$CHATKIT_WORKFLOW_ID \
  --build-arg MSAL_CLIENT_ID=${MSAL_CLIENT_ID:-""} \
  --build-arg MSAL_TENANT_ID=${MSAL_TENANT_ID:-""} \
  --build-arg MSAL_REDIRECT_URI=${MSAL_REDIRECT_URI:-""} .
```

Create a Docker network:
```bash
docker network create chatkit-net
```

Run the backend:
```bash
docker run -d \
  --name chatkit-backend \
  --network chatkit-net \
  -p 8000:8000 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e CHATKIT_WORKFLOW_ID=$CHATKIT_WORKFLOW_ID \
  -e ENVIRONMENT=production \
  managed-chatkit-backend:latest
```

Run the frontend:
```bash
docker run -d \
  --name chatkit-frontend \
  --network chatkit-net \
  -p 80:80 \
  managed-chatkit-frontend:latest
```

Check container status:
```bash
docker ps
```

View logs:
```bash
docker logs -f chatkit-backend
docker logs -f chatkit-frontend
```

Stop containers:
```bash
docker stop chatkit-backend chatkit-frontend
docker rm chatkit-backend chatkit-frontend
docker network rm chatkit-net
```

**Option B: Using `docker compose` (Recommended)**

Simpler and more reproducible. From the project root:

```bash
# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### 4. Testing the Application

#### Health Check
Ensure both services are healthy:

```bash
# Backend health
curl http://localhost:8000/health
# Expected response: {"status": "ok"}

# Frontend health (should return HTML)
curl http://localhost:80 | head -20
```

#### Create a Session (Backend API)
Test the session creation endpoint:

```bash
curl -X POST http://localhost:8000/api/create-session \
  -H "Content-Type: application/json" \
  -d '{"workflow": {"id": "'"$CHATKIT_WORKFLOW_ID"'"}}'
```

Expected response:
```json
{
  "client_secret": "sk-sesh_...",
  "expires_after": 3600
}
```

#### Frontend Access
Open your browser and navigate to:
```
http://localhost
```

You should see the React UI. The frontend will call the backend `/api/create-session` endpoint when you interact with the ChatKit panel.

### 5. Rebuilding Images After Code Changes

If you modify code, rebuild the images:

```bash
# Using docker compose (automatic rebuild)
docker compose up --build

# Using docker CLI (manual rebuild)
docker build -t managed-chatkit-backend:latest -f backend/Dockerfile .
docker stop chatkit-backend
docker rm chatkit-backend
docker run -d ... managed-chatkit-backend:latest
```

### 6. Authentication Modes

The application supports two authentication modes depending on your configuration:

#### Azure AD (MSAL) Authentication
**When**: Both `MSAL_CLIENT_ID` and `MSAL_TENANT_ID` are set in `.env`.

```env
MSAL_CLIENT_ID=your-client-id-here
MSAL_TENANT_ID=your-tenant-id-here
```

Users will see a "Sign in with Microsoft" button and authenticate against Azure AD.

#### Basic Password Authentication (Fallback)
**When**: `MSAL_CLIENT_ID` and `MSAL_TENANT_ID` are **not set** (or empty).

```env
# Leave MSAL vars unset or commented
# MSAL_CLIENT_ID=
# MSAL_TENANT_ID=

# Optionally set a password (defaults to "ilovepizza")
BACKUP_PASSWORD=mysecretpassword
```

Users will see a password prompt. The password is verified against the `BACKUP_PASSWORD` environment variable.

**Quick Test**:
```bash
# Start with basic auth (just leave MSAL vars out of .env)
docker compose up

# Access http://localhost and enter password when prompted
# Default password: ilovepizza
```

### 7. Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Port already in use** | Another service is using port 80 or 8000 | Stop conflicting services: `docker ps` and `docker stop <container>` |
| **"Cannot connect to backend"** | Frontend can't reach backend on the Docker network | Ensure both containers are on the same network. Check `docker network inspect chatkit-net` |
| **"Missing OPENAI_API_KEY"** | Environment variable not set | Verify `.env` file exists and `docker compose` is loading it: `docker compose config` |
| **502 Bad Gateway** | Backend container crashed | Check logs: `docker compose logs backend` |
| **CORS errors** | `ALLOWED_ORIGINS` doesn't match your URL | Ensure `localhost` is in `ALLOWED_ORIGINS` |
| **"crypto.randomUUID is not a function"** | Frontend accessed via HTTP instead of HTTPS (local browser issue) | Use `http://localhost` (without HTTPS for local testing) |
| **"Invalid password" in basic auth** | Password doesn't match `BACKUP_PASSWORD` | Verify the password in your `.env` file or check the logs: `docker compose logs backend` |
| **Auth mode confusion** | Expecting MSAL but got password prompt (or vice versa) | Check `.env` - must have BOTH `MSAL_CLIENT_ID` and `MSAL_TENANT_ID` for MSAL mode. Otherwise, basic auth is used. |

### 8. Cleaning Up

Remove stopped containers, unused images, and networks:

```bash
# Stop all running containers
docker compose down

# Remove all dangling images and unused networks
docker system prune

# Full cleanup (removes all unused images, even if not dangling)
docker system prune -a
```

---
