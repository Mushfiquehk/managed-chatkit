Deployment quickstart
=====================

Prerequisites
- Docker and docker-compose installed
- Create a `.env` file in the project root (copy from `.env.example`)

Build and run locally

```bash
# from project root
docker compose build
docker compose up
```

This will build the backend and frontend images and expose the frontend on port 80
and the backend on port 8000. Set real secrets in `.env` or your CI/CD secrets store.

Notes
- The backend image installs the project in editable mode for simplicity. For
  a hardened production image, consider creating a non-editable install and
  removing build tools from the final image.
- Configure CORS and production environment variables in `backend/app/main.py`.

AWS Deployment (ECS)
====================

The GitHub Actions workflow is configured to deploy to AWS ECS.

Prerequisites:
1. Create an ECS Cluster and Service.
2. Create an IAM user with ECS deployment permissions.
3. Add the following secrets to your GitHub repository:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `OPENAI_API_KEY` (if needed by backend)
4. Update the environment variables in `.github/workflows/docker-publish.yml`:
   - `AWS_REGION`
   - `ECS_SERVICE`
   - `ECS_CLUSTER`
5. Customize `.aws/task-definition.json` with your specific requirements (CPU, Memory, etc.).
