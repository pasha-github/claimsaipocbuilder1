# Claims AI Agent

Claims AI Agent is a lightweight Node.js service that ingests insurance claim data, applies automated rules, and serves a browser-based operations dashboard. The app ships with sample data, connector stubs, and a simple rules engine to help you explore automation workflows end-to-end.

## Features
- REST API for submitting and processing claims
- Headless rules engine for fraud detection, validation, and status updates
- File-based persistence with seed data for quick experimentation
- Web UI for submitting claims, reviewing queues, and monitoring metrics
- Background ingestion worker for CSV, TXT, JSON, and PDF sources

## Project Structure
```
src/            # Node.js API, rules engine, ingestion workers
web/            # Static front-end pages and shared styling
data/db/        # JSON data stores for claims, policies, and persons
data/inbox/     # Drop zone for watched ingestion files
workflows/      # Example automation workflow definitions
```

## Prerequisites
- Node.js 18 or newer
- npm 9 or newer
- Git (optional, for source control)
- Docker 24+ (optional, for container deployments)
- AWS CLI, Azure CLI, and Google Cloud CLI configured for your account when deploying to the public cloud

## Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Seed the local datastore (optional but recommended for demo data):
   ```bash
   npm run seed
   ```
3. Start the API and web server:
   ```bash
   npm run dev
   ```
   The server listens on http://localhost:3000.
4. (Optional) Start the background ingestion watcher in another terminal to process files from `data/inbox`:
   ```bash
   npm run process:watch
   ```

## Local Docker Workflow
1. Build the container image:
   ```bash
   docker build -t claims-ai-agent:latest .
   ```
2. Run the container, publishing port 3000:
   ```bash
   docker run --rm -p 3000:3000 --name claims-ai-agent claims-ai-agent:latest
   ```
3. Visit http://localhost:3000 to access the UI and API.

## Deployment with Docker Compose (optional)
For multi-service setups or background workers, create a `docker-compose.yml` that runs both the API (`node src/server.js`) and the watcher (`npm run process:watch`). Bind mount `data/` if you need persistence outside the container.

## Deploying to AWS (ECS on Fargate)
1. Authenticate with Amazon ECR and create a repository named `claims-ai-agent`:
   ```bash
   aws ecr create-repository --repository-name claims-ai-agent
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
   ```
2. Tag and push the Docker image:
   ```bash
   docker tag claims-ai-agent:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/claims-ai-agent:latest
   docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/claims-ai-agent:latest
   ```
3. Create an ECS cluster and a Fargate task definition referencing the pushed image, container port 3000, and 512 MiB / 0.25 vCPU.
4. Define a Fargate service with an Application Load Balancer forwarding HTTP traffic to port 3000.
5. Update the service whenever you push a new image version.

## Deploying to Azure (App Service for Containers)
1. Login and create an Azure Container Registry named `claimsaiagentregistry`:
   ```bash
   az acr create --resource-group claims-ai-rg --name claimsaiagentregistry --sku Basic
   az acr login --name claimsaiagentregistry
   docker tag claims-ai-agent:latest claimsaiagentregistry.azurecr.io/claims-ai-agent:latest
   docker push claimsaiagentregistry.azurecr.io/claims-ai-agent:latest
   ```
2. Create an App Service plan and a Web App that pulls from the registry:
   ```bash
   az appservice plan create --name claims-ai-plan --resource-group claims-ai-rg --sku B1 --is-linux
   az webapp create --resource-group claims-ai-rg --plan claims-ai-plan --name claims-ai-agent --deployment-container-image-name claimsaiagentregistry.azurecr.io/claims-ai-agent:latest
   ```
3. Configure App Settings if needed (e.g., `PORT=3000`).
4. Use `az webapp config container set` or continuous deployment hooks to roll out new images.

## Deploying to Google Cloud (Cloud Run)
1. Enable required services and authenticate:
   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com
   gcloud auth configure-docker us-central1-docker.pkg.dev
   ```
2. Create an Artifact Registry repository:
   ```bash
   gcloud artifacts repositories create claims-ai-agent --repository-format=docker --location=us-central1
   ```
3. Tag and push the image:
   ```bash
   docker tag claims-ai-agent:latest us-central1-docker.pkg.dev/my-gcp-project/claims-ai-agent/claims-ai-agent:latest
   docker push us-central1-docker.pkg.dev/my-gcp-project/claims-ai-agent/claims-ai-agent:latest
   ```
4. Deploy to Cloud Run:
   ```bash
   gcloud run deploy claims-ai-agent \
     --image us-central1-docker.pkg.dev/my-gcp-project/claims-ai-agent/claims-ai-agent:latest \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 3000
   ```
5. Cloud Run will provide a public HTTPS URL once the deployment completes.

## Environment Variables
The service reads the `PORT` environment variable (default `3000`). Extend the configuration via additional variables as you augment the application.

## Maintenance
- Run `npm run process:run` to process outstanding claims once and exit.
- Keep data backups of the `data/` directory when running in production environments.
- Monitor logs using your hosting provider’s native tools (CloudWatch Logs, Azure Monitor, Cloud Logging).

## Troubleshooting
- If the server fails to start, ensure Node 18+ is installed and port 3000 is available.
- When running in Docker, map volumes if you need to persist the JSON datastores between restarts.
- For ingestion issues, verify the watcher process has access to PDFs and CSVs and that the files follow expected schemas.
