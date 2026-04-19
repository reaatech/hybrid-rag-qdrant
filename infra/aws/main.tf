terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}

# Generate random password for database if not provided
resource "random_password" "db_password" {
  count   = var.db_password == "" ? 1 : 0
  length  = 32
  special = true
}

# Data source for existing VPC (optional - set vpc_id to use existing VPC)
data "aws_vpc" "existing" {
  count = var.vpc_cidr == "" ? 1 : 0
  id    = var.vpc_id
}

# Get latest ECS-optimized AMI
data "aws_ssm_parameter" "ecs_optimized_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

# Outputs
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc[0].vpc_id
}

output "alb_dns_name" {
  description = "The DNS name of the Application Load Balancer"
  value       = aws_lb.main[0].dns_name
}

output "alb_url" {
  description = "The URL of the Application Load Balancer"
  value       = "http://${aws_lb.main[0].dns_name}"
}

output "ecs_cluster_name" {
  description = "The name of the ECS cluster"
  value       = aws_ecs_cluster.main[0].name
}

output "ecr_repository_url" {
  description = "The URL of the ECR repository"
  value       = aws_ecr_repository.main[0].repository_url
}

output "service_name" {
  description = "The name of the ECS service"
  value       = aws_ecs_service.main[0].name
}
