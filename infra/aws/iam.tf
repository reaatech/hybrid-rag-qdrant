# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_task_execution" {
  count = var.vpc_cidr != "" ? 1 : 0
  name  = "${var.ecs_cluster_name}-ecs-execution-role"

  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json
}

data "aws_iam_policy_document" "ecs_task_execution_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  count      = var.vpc_cidr != "" ? 1 : 0
  role       = aws_iam_role.ecs_task_execution[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Additional policy for CloudWatch Logs
resource "aws_iam_role_policy" "ecs_task_execution_logs" {
  count = var.vpc_cidr != "" ? 1 : 0
  name  = "${var.ecs_cluster_name}-ecs-logs-policy"
  role  = aws_iam_role.ecs_task_execution[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = [aws_cloudwatch_log_group.ecs[0].arn]
      }
    ]
  })
}

# IAM Role for ECS Task
resource "aws_iam_role" "ecs_task" {
  count = var.vpc_cidr != "" ? 1 : 0
  name  = "${var.ecs_cluster_name}-ecs-task-role"

  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:ecs:*:*:task-definition/*"]
    }

    condition {
      test     = "StringLike"
      variable = "aws:SourceAccount"
      values   = ["*"]
    }
  }
}

# Policy for accessing Secrets Manager
resource "aws_iam_role_policy" "ecs_task_secrets" {
  count = var.vpc_cidr != "" ? 1 : 0
  name  = "${var.ecs_cluster_name}-ecs-secrets-policy"
  role  = aws_iam_role.ecs_task[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [aws_secretsmanager_secret.api_keys[0].arn]
      }
    ]
  })
}

# Policy for X-Ray tracing (optional)
resource "aws_iam_role_policy" "ecs_task_xray" {
  count = var.enable_xray ? 1 : 0
  name  = "${var.ecs_cluster_name}-ecs-xray-policy"
  role  = aws_iam_role.ecs_task[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = ["*"]
      }
    ]
  })
}
