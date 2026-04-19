# GCP Provider Variables
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
  default     = "dev"
}

# Network Variables
variable "network_name" {
  description = "Name of the VPC network"
  type        = string
  default     = "hybrid-rag-qdrant-network"
}

variable "subnet_cidr" {
  description = "CIDR block for the subnet"
  type        = string
  default     = "10.0.1.0/24"
}

# Cloud Run Variables
variable "service_name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "hybrid-rag-qdrant"
}

variable "location" {
  description = "Cloud Run service location (region)"
  type        = string
  default     = "us-central1"
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

# Container Variables
variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "docker_image" {
  description = "Docker image URI (overrides artifact registry if provided)"
  type        = string
  default     = ""
}

# Cloud SQL Variables
variable "cloud_sql_instance_name" {
  description = "Name of the Cloud SQL instance"
  type        = string
  default     = "hybrid-rag-qdrant-db"
}

variable "database_name" {
  description = "Name of the database"
  type        = string
  default     = "rag_sessions"
}

variable "database_user" {
  description = "Database username"
  type        = string
  default     = "ragadmin"
}

variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "database_tier" {
  description = "Cloud SQL machine type (e.g., db-f1-micro, db-g1-small)"
  type        = string
  default     = "db-f1-micro"
}

# Qdrant Variables
variable "qdrant_url" {
  description = "Qdrant server URL"
  type        = string
  default     = ""
}

# API Keys
variable "openai_api_key" {
  description = "OpenAI API key for embeddings"
  type        = string
  sensitive   = true
  default     = ""
}

variable "cohere_api_key" {
  description = "Cohere API key for reranking"
  type        = string
  sensitive   = true
  default     = ""
}

variable "jina_api_key" {
  description = "Jina API key for reranking"
  type        = string
  sensitive   = true
  default     = ""
}

# Tags
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
