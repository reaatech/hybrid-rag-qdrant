# Cloud Run Module Variables
variable "project" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
}

variable "docker_image" {
  description = "Docker image URI"
  type        = string
  default     = ""
}

variable "min_instances" {
  description = "Minimum number of instances (0 for scale-to-zero)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 100
}

variable "memory" {
  description = "Memory limit for Cloud Run service (e.g., 512Mi, 1Gi)"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU limit for Cloud Run service (1, 2)"
  type        = number
  default     = 1
}

variable "timeout" {
  description = "Request timeout in seconds"
  type        = number
  default     = 300
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "qdrant_url" {
  description = "Qdrant server URL"
  type        = string
  default     = ""
}

variable "vpc_connector_id" {
  description = "VPC Access connector ID for private networking"
  type        = string
  default     = ""
}

variable "labels" {
  description = "Additional labels to add to resources"
  type        = map(string)
  default     = {}
}

locals {
  common_labels = merge(
    {
      project     = "hybrid-rag-qdrant"
      environment = var.environment
      managed_by  = "terraform"
    },
    var.labels
  )
}
