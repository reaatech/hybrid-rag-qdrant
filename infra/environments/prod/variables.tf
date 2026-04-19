# Production Environment Variables
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
  description = "Qdrant Cloud URL"
  type        = string
  default     = ""
}
