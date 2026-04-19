# Cloud Run Service Module
terraform {
  required_version = ">= 1.0"
}

provider "google" {
  project = var.project
  region  = var.region
}

data "google_project" "current" {}

resource "google_cloud_run_service" "main" {
  name     = var.service_name
  location = var.region

  template {
    spec {
      service_account_name = google_service_account.cloud_run.id
      container_concurrency = 80
      timeout_seconds       = var.timeout

      containers {
        image = var.docker_image
        ports {
          container_port = var.container_port
        }

        env {
          name  = "NODE_ENV"
          value = var.environment
        }

        env {
          name  = "PORT"
          value = tostring(var.container_port)
        }

        env {
          name  = "QDRANT_URL"
          value = var.qdrant_url
        }
      }

      volumes {
        name = "google-cloud-key"
        secret {
          name         = "hybrid-rag-api-keys"
          secret_items = ["openai-api-key", "cohere-api-key", "jina-api-key"]
        }
      }

      volumes {
        name = "google-cloud-key"
        secret {
          name         = "hybrid-rag-qdrant-secrets"
          secret_items = ["qdrant-api-key"]
        }
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale"                 = tostring(var.max_instances)
        "autoscaling.knative.dev/minScale"                 = tostring(var.min_instances)
        "run.googleapis.com/memory"                        = var.memory
        "run.googleapis.com/cpu"                           = tostring(var.cpu)
        "run.googleapis.com/execution-environment"         = "gen2"
        "networking.gke.io/vpc-health检查"                 = var.vpc_connector_id != "" ? var.vpc_connector_id : undefined
      }

      labels = local.common_labels
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true

  lifecycle {
    ignore_changes = [
      template[0].spec[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_service_iam_member" "public" {
  service  = google_cloud_run_service.main.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_service_account" "cloud_run" {
  account_id   = "${var.service_name}-sa-${var.environment}"
  display_name = "Cloud Run service account for ${var.service_name} (${var.environment})"
}

resource "google_project_iam_member" "cloud_run_logging" {
  project = var.project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_trace" {
  project = var.project
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_secret" {
  project = var.project
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

output "cloud_run_url" {
  description = "The URL of the Cloud Run service"
  value       = google_cloud_run_service.main.status[0].url
}

output "service_name" {
  description = "The name of the Cloud Run service"
  value       = google_cloud_run_service.main.name
}

output "service_account_email" {
  description = "The service account email"
  value       = google_service_account.cloud_run.email
}
