# ECR Repository for Docker images
resource "aws_ecr_repository" "main" {
  count                = var.vpc_cidr != "" ? 1 : 0
  name                 = "${var.ecs_cluster_name}-repo"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# ECR lifecycle policy
resource "aws_ecr_lifecycle_policy" "main" {
  count      = var.vpc_cidr != "" ? 1 : 0
  repository = aws_ecr_repository.main[0].name
  policy     = data.aws_iam_policy_document.ecr_lifecycle.json
}

data "aws_iam_policy_document" "ecr_lifecycle" {
  statement {
    sid       = "KeepLast30Images"
    priority  = 1
    action    = "expire"
    selection {
      tag_status   = "any"
      tag_pattern_list = ["*"]
      count_type   = "sinceImagePushed"
      count_unit   = "days"
      count_number = 30
    }
  }

  statement {
    sid       = "DeleteUntaggedImages"
    priority  = 2
    action    = "expire"
    selection {
      tag_status   = "untagged"
      count_type   = "sinceImagePushed"
      count_unit   = "days"
      count_number = 7
    }
  }
}
