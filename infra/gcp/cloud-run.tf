# Cloud Run Service
resource "google_cloud_run_service" "main" {
  name     = var.service_name
  location = var.location

  template {
    spec {
      service_account_name = google_service_account.cloud_run.id
      container_concurrency = 80
      timeout_seconds      = var.timeout

      containers {
        image = var.docker_image != "" ? var.docker_image : "${google_artifact_registry_repository.main.location}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.main.name}/hybrid-rag-qdrant:latest"
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

        # Secrets from Secret Manager
        env {
          name = "OPENAI_API_KEY"
          value_source {
            secret_key_ref {
              name  = google_secret_manager_secret.api_keys.secret_id
              version = "latest"
            }
          }
        }
      }
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/maxScale"      = tostring(var.max_instances)
        "autoscaling.knative.dev/minScale"      = tostring(var.min_instances)
        "run.googleapis.com/cloudsql-instances" = google_sql_database_instance.main.connection_name
        "run.googleapis.com/memory"             = var.memory
        "run.googleapis.com/cpu"                = tostring(var.cpu)
        "run.googleapis.com/execution-environment" = "gen2"
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

# IAM binding for unauthenticated access to Cloud Run
resource "google_cloud_run_service_iam_member" "public" {
  service  = google_cloud_run_service.main.name
  location = google_cloud_run_service.main.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Cloud Run IAM service account
resource "google_service_account" "cloud_run" {
  account_id   = "${var.service_name}-sa"
  display_name = "Cloud Run service account for ${var.service_name}"
}

# Grant Cloud Run service account permissions
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

resource "google_project_iam_member" "cloud_run_sql" {
  project = var.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_secret" {
  project = var.project
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# Cloud Monitoring Alert Policies
resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "${var.service_name} High Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Error rate > 5%"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_service.main.name}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code!=\"200\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [] # Add notification channel IDs
}

resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "${var.service_name} High Latency"
  combiner     = "OR"

  conditions {
    display_name = "P95 latency > 1000ms"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${google_cloud_run_service.main.name}\" AND metric.type=\"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 1000
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_PERCENTILE_95"
      }
    }
  }

  notification_channels = [] # Add notification channel IDs
}
