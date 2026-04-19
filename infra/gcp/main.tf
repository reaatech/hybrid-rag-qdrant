terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "gcs" {
    # Uncomment and configure for remote state
    # bucket = "your-terraform-state-bucket"
    # prefix = "hybrid-rag-qdrant/state"
  }
}

provider "google" {
  project = var.project
  region  = var.region
}

provider "google-beta" {
  project = var.project
  region  = var.region
}

# Generate random password for database if not provided
resource "random_password" "db_password" {
  count   = var.database_password == "" ? 1 : 0
  length  = 32
  special = true
}

# Data source for project info
data "google_project" "current" {}

# Outputs
output "cloud_run_url" {
  description = "The URL of the Cloud Run service"
  value       = google_cloud_run_service.main.status[0].url
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name"
  value       = google_sql_database_instance.main.connection_name
}

output "artifact_registry_url" {
  description = "The URL of the Artifact Registry repository"
  value       = "${var.region}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.main.repository_id}"
}

output "service_name" {
  description = "The name of the Cloud Run service"
  value       = google_cloud_run_service.main.name
}
