# Artifact Registry for Docker images
resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "hybrid-rag-qdrant"
  description   = "Docker repository for hybrid-rag-qdrant images"
  format        = "DOCKER"

  docker_config {
    immutable_tags = false
  }

  cleanup_policy_dry_run = false
  labels                 = local.common_labels
}

# Cleanup policy for old images
resource "google_artifact_registry_repository_iam_member" "viewer" {
  project    = var.project
  location   = google_artifact_registry_repository.main.location
  repository = google_artifact_registry_repository.main.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Secret Manager for API keys
resource "google_secret_manager_secret" "api_keys" {
  secret_id = "${var.service_name}-api-keys"

  replication {
    auto {}
  }

  labels = local.common_labels
}

resource "google_secret_manager_secret_version" "api_keys" {
  secret = google_secret_manager_secret.api_keys.id

  secret_data = jsonencode({
    OPENAI_API_KEY = var.openai_api_key
    COHERE_API_KEY = var.cohere_api_key
    JINA_API_KEY   = var.jina_api_key
  })
}

# Grant access to Secret Manager
resource "google_secret_manager_secret_iam_member" "cloud_run_access" {
  secret_id = google_secret_manager_secret.api_keys.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Logging sink for exporting logs
resource "google_logging_project_sink" "cloud_run_logs" {
  name        = "${var.service_name}-logs-sink"
  destination = "storage.googleapis.com/${google_storage_bucket.logs_bucket[0].name}"

  filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.service_name}\""

  unique_writer_identity = true
}

resource "google_storage_bucket" "logs_bucket" {
  count         = var.environment == "prod" ? 1 : 0
  name          = "${var.project}-${var.service_name}-logs"
  location      = var.region
  force_destroy = true

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  labels = local.common_labels
}
