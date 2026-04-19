# Secrets Manager for API keys
resource "aws_secretsmanager_secret" "api_keys" {
  count                   = var.vpc_cidr != "" ? 1 : 0
  name                    = "${var.ecs_cluster_name}-api-keys"
  description             = "API keys for hybrid-rag-qdrant application"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "api_keys" {
  count     = var.vpc_cidr != "" ? 1 : 0
  secret_id = aws_secretsmanager_secret.api_keys[0].id

  secret_string = jsonencode({
    OPENAI_API_KEY = var.openai_api_key != "" ? var.openai_api_key : ""
    COHERE_API_KEY = var.cohere_api_key != "" ? var.cohere_api_key : ""
    JINA_API_KEY   = var.jina_api_key != "" ? var.jina_api_key : ""
  })
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  count               = var.vpc_cidr != "" ? 1 : 0
  alarm_name          = "${var.ecs_cluster_name}-cpu-high"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 120
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "This alarm monitors ECS service CPU utilization"

  dimensions = {
    ClusterName = aws_ecs_cluster.main[0].name
    ServiceName = aws_ecs_service.main[0].name
  }

  alarm_actions = [] # Add SNS topic ARN for notifications
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  count               = var.vpc_cidr != "" ? 1 : 0
  alarm_name          = "${var.ecs_cluster_name}-memory-high"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 120
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "This alarm monitors ECS service memory utilization"

  dimensions = {
    ClusterName = aws_ecs_cluster.main[0].name
    ServiceName = aws_ecs_service.main[0].name
  }

  alarm_actions = [] # Add SNS topic ARN for notifications
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  count               = var.vpc_cidr != "" ? 1 : 0
  alarm_name          = "${var.ecs_cluster_name}-alb-5xx"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 120
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "This alarm monitors ALB 5xx errors"

  dimensions = {
    LoadBalancer = aws_lb.main[0].arn_suffix
  }

  alarm_actions = [] # Add SNS topic ARN for notifications
}
