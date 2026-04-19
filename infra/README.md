# Infrastructure Deployment Guide

This directory contains Terraform configurations for deploying the hybrid-rag-qdrant application to AWS and GCP.

## Overview

The infrastructure is designed to be production-ready with:
- Auto-scaling capabilities
- Load balancing
- Secrets management
- Monitoring and alerting
- CI/CD integration
- Cost optimization

## Deployment Options

### 1. Docker (Local Development)
Use the root-level `docker-compose.yml` for local development.

### 2. AWS (ECS Fargate + ALB + RDS)
**Best for:** Teams already on AWS, enterprise requirements

**Components:**
- ECS Fargate for container orchestration
- Application Load Balancer (ALB)
- ECR for container registry
- Secrets Manager for API keys
- CloudWatch for monitoring

**Deployment:**
```bash
cd infra/aws

# Initialize Terraform
terraform init

# Review the plan
terraform plan -var="project=your-project" -var="openai_api_key=sk-..."

# Apply the configuration
terraform apply -var="project=your-project" -var="openai_api_key=sk-..."
```

**Key Variables:**
| Variable | Description | Default |
|----------|-------------|---------|
| `region` | AWS region | `us-east-1` |
| `environment` | Environment name | `dev` |
| `vpc_cidr` | VPC CIDR block | `10.0.0.0/16` |
| `task_cpu` | CPU units (256-4096) | `512` |
| `task_memory` | Memory in MB | `1024` |
| `desired_count` | Initial task count | `2` |
| `min_capacity` | Min auto-scale tasks | `1` |
| `max_capacity` | Max auto-scale tasks | `10` |

### 3. GCP (Cloud Run + Cloud SQL)
**Best for:** Serverless architecture, pay-per-use, fast scaling

**Components:**
- Cloud Run for serverless containers
- Cloud SQL PostgreSQL
- Artifact Registry
- Secret Manager
- Cloud Monitoring

**Deployment:**
```bash
cd infra/gcp

# Initialize Terraform
terraform init

# Review the plan
terraform plan -var="project=your-project" -var="openai_api_key=sk-..."

# Apply the configuration
terraform apply -var="project=your-project" -var="openai_api_key=sk-..."
```

**Key Variables:**
| Variable | Description | Default |
|----------|-------------|---------|
| `project` | GCP project ID | *(required)* |
| `region` | GCP region | `us-central1` |
| `environment` | Environment name | `dev` |
| `min_instances` | Min instances (0 = scale to zero) | `0` |
| `max_instances` | Max instances | `100` |
| `memory` | Memory limit | `512Mi` |
| `cpu` | CPU limit | `1` |

## Pre-deployment Checklist

### For AWS:
- [ ] AWS CLI configured with appropriate permissions
- [ ] VPC CIDR doesn't conflict with existing networks
- [ ] ACM certificate (optional, for HTTPS)
- [ ] API keys ready (OpenAI, Cohere, Jina)

### For GCP:
- [ ] GCP project created and billing enabled
- [ ] Required APIs enabled:
  - Cloud Run API
  - Cloud SQL API
  - Artifact Registry API
  - Secret Manager API
  - Cloud Build API (for CI/CD)
- [ ] Service account with Editor role (or custom roles)
- [ ] API keys ready

## Post-deployment

### Verify Deployment

**AWS:**
```bash
# Get the ALB URL
export ALB_URL=$(terraform output -raw alb_url)

# Health check
curl $ALB_URL/health

# Test query endpoint
curl -X POST $ALB_URL/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test question"}'
```

**GCP:**
```bash
# Get the Cloud Run URL
export RUN_URL=$(terraform output -raw cloud_run_url)

# Health check
curl $RUN_URL/health

# Test query endpoint
curl -X POST $RUN_URL/v1/query \
  -H "Content-Type: application/json" \
  -d '{"query": "test question"}'
```

### Configure Qdrant

The application requires a Qdrant vector database. Options:

1. **Qdrant Cloud** (Recommended for production)
   - Sign up at [cloud.qdrant.io](https://cloud.qdrant.io)
   - Set `qdrant_url` and `qdrant_api_key` variables

2. **Self-hosted on EC2/GCE**
   - Deploy Qdrant using the provided Docker configuration
   - Use private IP for better performance

3. **Qdrant in ECS/Cloud Run**
   - Add Qdrant as a sidecar or separate service
   - Configure network connectivity

### Monitoring

**AWS CloudWatch:**
- ECS service metrics (CPU, memory, network)
- ALB metrics (request count, latency, errors)
- Custom alarms configured in `secrets.tf`

**GCP Cloud Monitoring:**
- Cloud Run revision metrics
- Cloud SQL metrics
- Custom alert policies in `cloud-run.tf`

### Cost Optimization

**AWS:**
- Use Spot instances for non-critical workloads
- Right-size task CPU/memory based on actual usage
- Enable Compute Savings Plans for steady-state workloads
- Use S3 lifecycle policies for log retention

**GCP:**
- Set `min_instances = 0` for development environments
- Use committed use discounts for production
- Enable Cloud SQL automatic backups only for production
- Use preemptible VMs for batch processing

## CI/CD Integration

### GitHub Actions (AWS)
```yaml
# .github/workflows/deploy-aws.yml
name: Deploy to AWS
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: docker build -t $ECR_REPO:latest .
      - run: docker push $ECR_REPO:latest
      - run: aws ecs update-service --cluster $CLUSTER --service $SERVICE --force-new-deployment
```

### Cloud Build (GCP)
```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${_REGION}-docker.pkg.dev/$PROJECT_ID/${_REPO}/hybrid-rag-qdrant:$SHORT_SHA', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', '${_REGION}-docker.pkg.dev/$PROJECT_ID/${_REPO}/hybrid-rag-qdrant:$SHORT_SHA']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args: ['run', 'deploy', '${_SERVICE}', '--image', '${_REGION}-docker.pkg.dev/$PROJECT_ID/${_REPO}/hybrid-rag-qdrant:$SHORT_SHA', '--region', '${_REGION}']
```

## Troubleshooting

### Common Issues

1. **Task/Service fails to start**
   - Check CloudWatch Logs / Cloud Logging
   - Verify environment variables and secrets
   - Ensure Qdrant connection is working

2. **High latency**
   - Check if running in same region as Qdrant
   - Increase CPU/memory allocation
   - Enable caching where possible

3. **Out of memory**
   - Increase task/memory limits
   - Optimize chunk sizes
   - Consider using streaming responses

### Useful Commands

**AWS:**
```bash
# View ECS task logs
aws logs tail /aws/ecs/hybrid-rag-qdrant-cluster --follow

# Execute command in running task
aws ecs execute-command --cluster hybrid-rag-qdrant-cluster --task <task-arn> --interactive

# Scale service
aws ecs update-service --cluster hybrid-rag-qdrant-cluster --service hybrid-rag-qdrant-service --desired-count 5
```

**GCP:**
```bash
# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=hybrid-rag-qdrant" --limit=50 --format=json

# SSH into Cloud Run (not directly possible - use Cloud Run local testing)
gcloud run services proxy hybrid-rag-qdrant --region us-central1 --port 8080

# Scale service
gcloud run services update hybrid-rag-qdrant --max-instances=20 --region us-central1
```

## Cleanup

To avoid unexpected charges, destroy infrastructure when not needed:

**AWS:**
```bash
cd infra/aws
terraform destroy -var="project=your-project"
```

**GCP:**
```bash
cd infra/gcp
terraform destroy -var="project=your-project"
```

⚠️ **Warning:** This will delete all resources including databases. Make sure to backup any important data first.
