# Dev Environment Terraform Configuration
# Low-cost development setup with scale-to-zero capability

terraform {
  required_version = ">= 1.0"

  backend "local" {
    path = "terraform.tfstate"
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
  description = "Docker image URI (defaults to artifact registry latest)"
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
  environment    = "dev"
  service_name   = "hybrid-rag-qdrant-dev"
  docker_image   = var.docker_image != "" ? var.docker_image : "${var.region}-docker.pkg.dev/${var.project}/hybrid-rag-qdrant/hybrid-rag-qdrant:latest"
  min_instances  = 0
  max_instances  = 5
  memory         = "512Mi"
  cpu            = 1
  timeout        = 300
  container_port = 3000
  qdrant_url     = var.qdrant_url
}
