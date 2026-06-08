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

# Vector Store Variables
variable "vector_store_provider" {
  description = "Vector store provider (e.g., qdrant, pinecone, weaviate, lancedb)"
  type        = string
  default     = "qdrant"
}

variable "vector_store_url" {
  description = "Vector store server URL"
  type        = string
  default     = ""
}

variable "vector_store_api_key" {
  description = "Vector store API key"
  type        = string
  sensitive   = true
  default     = ""
}
