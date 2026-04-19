# Production Environment Terraform Configuration
# High-availability production setup with minimum instances and auto-scaling

terraform {
  required_version = ">= 1.0"

  backend "gcs" {
    bucket = "your-terraform-state-bucket-prod"
    prefix = "hybrid-rag-qdrant/prod/state"
  }
}

variable "project" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "docker_image" {
  description = "Docker image URI"
  type        = string
  default     = ""
}

variable "qdrant_url" {
  description = "Qdrant Cloud URL (e.g., https://xyz.qdrant.cloud)"
  type        = string
  default     = ""
}

output "cloud_run_url" {
  description = "The URL of the Cloud Run service"
  value       = module.cloud_run.cloud_run_url
}

output "service_name" {
  description = "The name of the Cloud Run service"
  value       = module.cloud_run.service_name
}

module "cloud_run" {
  source = "../../modules/cloud-run"

  project        = var.project
  region         = var.region
  environment    = "prod"
  service_name   = "hybrid-rag-qdrant"
  docker_image   = var.docker_image != "" ? var.docker_image : "${var.region}-docker.pkg.dev/${var.project}/hybrid-rag-qdrant/hybrid-rag-qdrant:latest"
  min_instances  = 2
  max_instances  = 100
  memory         = "1Gi"
  cpu            = 2
  timeout        = 300
  container_port = 3000
  qdrant_url     = var.qdrant_url
}
