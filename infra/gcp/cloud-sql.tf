# Cloud SQL PostgreSQL Instance
resource "google_sql_database_instance" "main" {
  name                = var.cloud_sql_instance_name
  database_version    = "POSTGRES_14"
  region              = var.region
  deletion_protection = false

  settings {
    tier              = var.database_tier
    availability_type = "ZONAL"

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.main.id
      require_ssl     = true
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }

    user_labels = local.common_labels
  }

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# Private IP configuration
resource "google_compute_global_address" "private_ip" {
  name          = "${var.cloud_sql_instance_name}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}

# Database
resource "google_sql_database" "main" {
  name      = var.database_name
  instance  = google_sql_database_instance.main.name
  charset   = "UTF8"
  collation = "en_US.UTF8"
}

# Database user
resource "google_sql_user" "main" {
  name     = var.database_user
  instance = google_sql_database_instance.main.name
  password = var.database_password != "" ? var.database_password : random_password.db_password[0].result
}

# Cloud SQL backup retention policy
resource "google_sql_database_instance" "backup" {
  count = var.environment == "prod" ? 1 : 0

  name             = "${var.cloud_sql_instance_name}-backup"
  database_version = "POSTGRES_14"
  region           = var.region

  settings {
    tier = var.database_tier

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 30
    }

    ip_configuration {
      ipv4_enabled = false
    }
  }

  restoration_point_target {
    restoration_point_time = "P7D"
  }
}
