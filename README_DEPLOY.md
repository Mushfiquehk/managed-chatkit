# AWS Deployment & Engineering Guide

This document details the architecture, infrastructure setup, and deployment pipeline for the Managed ChatKit application on AWS.

## 1. Architecture Overview

The application runs as a containerized workload on **AWS ECS Fargate**.

- **Frontend**: React/Vite app served via Nginx (Port 80).
- **Backend**: FastAPI Python app (Port 8000).
- **Load Balancer**: Application Load Balancer (ALB) handles SSL termination and path-based routing.

### Traffic Flow
1.  User accesses `https://app.domain.com`.
2.  **ALB Listener 443** receives traffic.
3.  **Path Routing**:
    - `/api/*` -> Forwards to **Backend Target Group** (Port 8000).
    - `/*` (Default) -> Forwards to **Frontend Target Group** (Port 80).
4.  **ECS Task**: Both containers run in the same Fargate Task Definition, sharing the same network interface (awsvpc).

---

## 2. Infrastructure Setup

### A. Networking & Security Groups

1.  **ALB Security Group (`alb-sg`)**
    - **Inbound**:
        - TCP 80 (HTTP) from `0.0.0.0/0` (Redirect to HTTPS).
        - TCP 443 (HTTPS) from `0.0.0.0/0`.
    - **Outbound**: All traffic.

2.  **Fargate Task Security Group (`fargate-sg`)**
    - **Inbound**:
        - TCP 80 from `alb-sg` (Frontend).
        - TCP 8000 from `alb-sg` (Backend).
    - **Outbound**: All traffic (needed for pulling images from GHCR and reaching OpenAI API).

### B. Application Load Balancer (ALB)

1.  **Target Groups**:
    - `tg-frontend`: Protocol HTTP, Port 80, Target Type IP, Health Check `/`.
    - `tg-backend`: Protocol HTTP, Port 8000, Target Type IP, Health Check `/health`.
2.  **Listeners**:
    - **HTTP:80**: Redirect to HTTPS:443.
    - **HTTPS:443**:
        - Rule 1: If Path is `/api/*` -> Forward to `tg-backend`.
        - Default: Forward to `tg-frontend`.

### C. ECS Cluster & Service

1.  **Cluster**: Fargate (Serverless).
2.  **Task Definition**:
    - Network Mode: `awsvpc`.
    - CPU/Memory: e.g., 256 CPU / 512 MB Memory.
    - Containers:
        - `frontend`: Image `ghcr.io/OWNER/REPO-frontend:latest`.
        - `backend`: Image `ghcr.io/OWNER/REPO-backend:latest`.
3.  **Service**:
    - Launch Type: Fargate.
    - Public IP: ENABLED (unless using NAT Gateway).
    - Load Balancing: Attached to the ALB Target Groups created above.

---

## 2.1 AWS Provisioning & Setup Steps

Follow these steps to provision the infrastructure from scratch. Substitute placeholder values (AWS account ID, region, domain names) with your actual values.

### Prerequisites
- AWS CLI installed and configured with appropriate credentials
- An existing VPC and public subnets in your AWS account
- An SSL certificate in AWS Certificate Manager (for HTTPS)

### Step 1: Create IAM Execution Role

The ECS task execution role allows ECS to access CloudWatch Logs and Secrets Manager.

#### Via AWS Console:
1. Go to **IAM** → **Roles** → **Create role**.
2. Select **Trusted entity type**: "AWS service".
3. Choose **ECS** → **ECS Task Execution Role**.
4. Click **Next**.
5. Attach the following **managed policies**:
   - `AmazonEC2ContainerRegistryReadOnly` (for pulling images from GHCR)
   - `CloudWatchLogsFullAccess` (for logging)
   - `AmazonSSMReadOnlyAccess` (for SSM Parameter Store access)
   - `SecretsManagerReadWrite` (for reading secrets)
6. Name the role: `chatkit-ecs-task-execution-role`.
7. Create the role.

#### Via AWS CLI:
```bash
# Create the role
aws iam create-role \
  --role-name chatkit-ecs-task-execution-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Service": "ecs-tasks.amazonaws.com"
        },
        "Action": "sts:AssumeRole"
      }
    ]
  }'

# Attach managed policies
aws iam attach-role-policy \
  --role-name chatkit-ecs-task-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam attach-role-policy \
  --role-name chatkit-ecs-task-execution-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

aws iam attach-role-policy \
  --role-name chatkit-ecs-task-execution-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess

aws iam attach-role-policy \
  --role-name chatkit-ecs-task-execution-role \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

**Important**: Note the role ARN (e.g., `arn:aws:iam::288761746098:role/chatkit-ecs-task-execution-role`). You'll need this for the task definition.

### Step 2: Create Security Groups

#### ALB Security Group:
```bash
aws ec2 create-security-group \
  --group-name alb-sg \
  --description "Security group for Application Load Balancer" \
  --vpc-id vpc-xxxxxxxxx

# Allow HTTP from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Allow HTTPS from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

#### Fargate Task Security Group:
```bash
aws ec2 create-security-group \
  --group-name fargate-sg \
  --description "Security group for ECS Fargate tasks" \
  --vpc-id vpc-xxxxxxxxx

# Get ALB security group ID (from above: sg-xxxxxxxxx)
ALB_SG_ID="sg-alb-id"
FARGATE_SG_ID="sg-fargate-id"

# Allow HTTP from ALB
aws ec2 authorize-security-group-ingress \
  --group-id $FARGATE_SG_ID \
  --protocol tcp \
  --port 80 \
  --source-group $ALB_SG_ID

# Allow port 8000 from ALB
aws ec2 authorize-security-group-ingress \
  --group-id $FARGATE_SG_ID \
  --protocol tcp \
  --port 8000 \
  --source-group $ALB_SG_ID

# Allow all outbound (default)
```

### Step 3: Create Application Load Balancer

```bash
aws elbv2 create-load-balancer \
  --name chatkit-alb \
  --subnets subnet-xxxxxxxxx subnet-yyyyyyyyy \
  --security-groups sg-alb-id \
  --scheme internet-facing \
  --type application
```

Note the **Load Balancer ARN** for the next steps.

### Step 4: Create Target Groups

#### Frontend Target Group:
```bash
aws elbv2 create-target-group \
  --name tg-frontend \
  --protocol HTTP \
  --port 80 \
  --vpc-id vpc-xxxxxxxxx \
  --target-type ip \
  --health-check-path "/" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3
```

#### Backend Target Group:
```bash
aws elbv2 create-target-group \
  --name tg-backend \
  --protocol HTTP \
  --port 8000 \
  --vpc-id vpc-xxxxxxxxx \
  --target-type ip \
  --health-check-path "/health" \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3
```

Note the **Target Group ARNs** for the next steps.

### Step 5: Create ALB Listeners and Rules

#### HTTP → HTTPS Redirect:
```bash
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'
```

#### HTTPS Listener with Path-Based Routing:
```bash
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=arn:aws:acm:... \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:.../targetgroup/tg-frontend/...
```

Then add a rule for `/api/*` to forward to backend:
```bash
aws elbv2 create-rule \
  --listener-arn arn:aws:elasticloadbalancing:.../listener/app/.../... \
  --conditions Field=path-pattern,Values="/api/*" \
  --priority 1 \
  --actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:.../targetgroup/tg-backend/...
```

### Step 6: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name chatkit-cluster --region us-east-1
```

### Step 7: Register Task Definition

Update the `.aws/task-definition.json` file with your AWS account ID and ARNs, then register:

```bash
aws ecs register-task-definition \
  --cli-input-json file://.aws/task-definition.json
```

**Key fields to update in the JSON**:
- `executionRoleArn`: Use the IAM role ARN from Step 1
- `image`: Update OWNER/REPO placeholders (or use `ghcr.io/yourorg/repo-backend:master`)
- `repositoryCredentials.credentialsParameter`: ARN of your GHCR token secret in Secrets Manager

### Step 8: Create Secrets in AWS Secrets Manager

Store all sensitive values:

```bash
# OpenAI API Key
aws secretsmanager create-secret \
  --name chatkit/openai_api_key \
  --secret-string "sk-..." \
  --region us-east-1

# MSAL Client ID (if using Azure AD)
aws secretsmanager create-secret \
  --name chatkit/msal_client_id \
  --secret-string "your-client-id" \
  --region us-east-1

# MSAL Tenant ID (if using Azure AD)
aws secretsmanager create-secret \
  --name chatkit/msal_tenant_id \
  --secret-string "your-tenant-id" \
  --region us-east-1

# Backup Password (for basic auth fallback)
aws secretsmanager create-secret \
  --name chatkit/backup_password \
  --secret-string "your-secure-password" \
  --region us-east-1

# GHCR Token (for pulling private images)
aws secretsmanager create-secret \
  --name ghcr_token/mushfiquehk \
  --secret-string '{"username":"YOUR_GITHUB_USER","password":"YOUR_GHCR_TOKEN"}' \
  --region us-east-1
```

### Step 9: Create ECS Service

```bash
aws ecs create-service \
  --cluster chatkit-cluster \
  --service-name chatkit-service \
  --task-definition chatkit-task:1 \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxxxxxx,subnet-yyyyyyyyy],securityGroups=[sg-fargate-id],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:.../targetgroup/tg-frontend/...,containerName=frontend,containerPort=80 targetGroupArn=arn:aws:elasticloadbalancing:.../targetgroup/tg-backend/...,containerName=backend,containerPort=8000
```

### Step 10: Configure Domain & SSL

1. Create a DNS record pointing your domain to the ALB endpoint.
2. Ensure your SSL certificate is valid in AWS Certificate Manager.
3. Test HTTPS access to your domain.

---

## 3. CI/CD Pipeline

Deployments are automated via **GitHub Actions** defined in `.github/workflows/docker-publish.yml`.

### Workflow Steps
1.  **Trigger**: Push to `main` branch.
2.  **Build**:
    - Builds Docker images for Frontend and Backend.
    - **Frontend Build Arg**: Injects `CHATKIT_WORKFLOW_ID` at build time.
3.  **Push**: Pushes images to **GitHub Container Registry (GHCR)**.
    - *Note*: GHCR packages must be set to **Public** visibility to allow ECS to pull them without credentials.
4.  **Deploy**:
    - Updates the ECS Task Definition with new image tags.
    - Injects `OPENAI_API_KEY` into the backend container environment.
    - Triggers a rolling update on the ECS Service.

---

## 4. Configuration & Secrets

### GitHub Repository Secrets
These must be set in GitHub (Settings -> Secrets and variables -> Actions):

| Secret Name | Description | Usage |
| :--- | :--- | :--- |
| `AWS_ACCESS_KEY_ID` | IAM User Key | AWS Authentication |
| `AWS_SECRET_ACCESS_KEY` | IAM User Secret | AWS Authentication |
| `OPENAI_API_KEY` | OpenAI API Key | Injected into Backend at runtime |
| `CHATKIT_WORKFLOW_ID` | ChatKit Workflow ID | Injected into Frontend at build time |

### Environment Variables (ECS Task Definition)
These can be hardcoded in `.aws/task-definition.json` or injected via the workflow.

| Variable | Container | Value / Description |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Backend | `production` (Enables secure cookies) |
| `ALLOWED_ORIGINS` | Backend | e.g., `https://app.yourdomain.com` (CORS) |
| `OPENAI_API_KEY` | Backend | Injected by GitHub Actions |
| `BACKUP_PASSWORD` | Backend | Password for basic auth fallback (defaults to `ilovepizza`) |

### AWS Secrets Manager
Store sensitive values in AWS Secrets Manager:

| Secret Name | Usage | Notes |
| :--- | :--- | :--- |
| `chatkit/openai_api_key` | OpenAI API Key for backend | Required |
| `chatkit/msal_client_id` | Azure AD Client ID | Optional—required only if using MSAL auth |
| `chatkit/msal_tenant_id` | Azure AD Tenant ID | Optional—required only if using MSAL auth |
| `chatkit/backup_password` | Fallback password for basic auth | Optional—defaults to `ilovepizza` if not set |

---

## 4.1 Authentication Modes

The application supports **two authentication modes**:

### Mode 1: Azure AD (MSAL) Authentication
Used when `MSAL_CLIENT_ID` and `MSAL_TENANT_ID` are configured.

**Setup**:
1. Register the app in Azure AD.
2. Generate a **Client ID** and **Tenant ID**.
3. Set GitHub secrets: `MSAL_CLIENT_ID`, `MSAL_TENANT_ID`.
4. Users sign in via Microsoft.

**Deployment**:
- Frontend receives `MSAL_CLIENT_ID` and `MSAL_TENANT_ID` at build time (build args).
- Users authenticate against Microsoft's servers.
- Backend validates tokens using `MSAL_CLIENT_ID` and `MSAL_TENANT_ID`.

### Mode 2: Basic Password Authentication (Fallback)
Used when `MSAL_CLIENT_ID` and/or `MSAL_TENANT_ID` are **NOT configured**.

**Setup**:
1. Leave `MSAL_CLIENT_ID` and `MSAL_TENANT_ID` empty or unset.
2. Optionally set `BACKUP_PASSWORD` (defaults to `ilovepizza`).
3. Users enter a single shared password.

**Deployment**:
- Frontend detects missing MSAL config and switches to password prompt.
- Backend exposes `/api/auth/verify-password` endpoint.
- Frontend sends password to backend for verification.
- Backend compares submitted password against `BACKUP_PASSWORD` environment variable.

**Example Fargate Configuration**:
```json
"secrets": [
  {
    "name": "BACKUP_PASSWORD",
    "valueFrom": "arn:aws:secretsmanager:us-east-1:288761746098:secret:chatkit/backup_password"
  }
]
```

---

## 5. Troubleshooting

### Common Issues

1.  **"crypto.randomUUID is not a function"**
    - **Cause**: Accessing the site via HTTP.
    - **Fix**: Ensure ALB redirects HTTP to HTTPS. The app requires a Secure Context (HTTPS or localhost).

2.  **CORS Errors**
    - **Cause**: Backend rejecting requests from the frontend domain.
    - **Fix**: Update `ALLOWED_ORIGINS` in the Backend container environment to match your ALB/Domain URL.

3.  **502 Bad Gateway**
    - **Cause**: Container failed to start or health check failed.
    - **Fix**: Check ECS Task logs in CloudWatch. Ensure Security Groups allow traffic from ALB to Task on ports 80/8000.

4.  **Deployment Fails in GitHub**
    - **Cause**: IAM permissions or ECS Service not found.
    - **Fix**: Verify `ECS_SERVICE` and `ECS_CLUSTER` names in `.github/workflows/docker-publish.yml` match AWS resources. Ensure IAM user has `ecs:UpdateService` and `ecs:RegisterTaskDefinition` permissions.

5.  **"Password incorrect" in Basic Auth Mode**
    - **Cause**: Submitted password doesn't match `BACKUP_PASSWORD`.
    - **Fix**: Verify the `BACKUP_PASSWORD` secret is set correctly in AWS Secrets Manager or as an environment variable. Default is `ilovepizza`.

6.  **Basic Auth Not Appearing (MSAL Error Instead)**
    - **Cause**: MSAL environment variables are set but incomplete/invalid.
    - **Fix**: Either set BOTH `MSAL_CLIENT_ID` and `MSAL_TENANT_ID` correctly, or leave both unset to use basic auth fallback. Check console logs for MSAL initialization errors.
