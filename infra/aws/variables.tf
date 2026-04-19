# AWS Provider Variables
variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

# VPC Variables
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# ECS Variables
variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
  default     = "hybrid-rag-qdrant-cluster"
}

variable "service_name" {
  description = "Name of the ECS service"
  type        = string
  default     = "hybrid-rag-qdrant-service"
}

variable "task_cpu" {
  description = "CPU units for the task (256, 512, 1024, etc.)"
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Memory for the task in MB (1024, 2048, etc.)"
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Desired number of tasks"
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum number of tasks for auto-scaling"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Maximum number of tasks for auto-scaling"
  type        = number
  default     = 10
}

# Container Variables
variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "docker_image" {
  description = "Docker image URI (overrides ecr if provided)"
  type        = string
  default     = ""
}

# Qdrant Variables
variable "qdrant_url" {
  description = "Qdrant server URL (external or self-hosted)"
  type        = string
  default     = ""
}

variable "qdrant_api_key" {
  description = "Qdrant API key (if required)"
  type        = string
  default     = ""
}

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

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS listener"
  type        = string
  default     = ""
}

variable "enable_xray" {
  description = "Enable X-Ray tracing"
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "Existing VPC ID (if not creating new VPC)"
  type        = string
  default     = ""
}

# Database Variables
variable "db_name" {
  description = "Database name for session storage"
  type        = string
  default     = "rag_sessions"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "ragadmin"
}

variable "db_password" {
  description = "Database password (will be stored in Secrets Manager)"
  type        = string
  sensitive   = true
  default     = ""
}

# Tags
variable "tags" {
  description = "Additional tags to add to resources"
  type        = map(string)
  default     = {}
}

locals {
  common_tags = merge(
    {
      Project     = "hybrid-rag-qdrant"
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags
  )
}
