# ECS Cluster
resource "aws_ecs_cluster" "main" {
  count = var.vpc_cidr != "" ? 1 : 0
  name  = var.ecs_cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# CloudWatch Log Group for ECS tasks
resource "aws_cloudwatch_log_group" "ecs" {
  count             = var.vpc_cidr != "" ? 1 : 0
  name              = "/aws/ecs/${var.ecs_cluster_name}"
  retention_in_days = 30
}

# ECS Task Definition
resource "aws_ecs_task_definition" "main" {
  count                = var.vpc_cidr != "" ? 1 : 0
  family               = "${var.ecs_cluster_name}-task"
  network_mode         = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                  = var.task_cpu
  memory               = var.task_memory
  execution_role_arn   = aws_iam_role.ecs_task_execution[0].arn
  task_role_arn        = aws_iam_role.ecs_task[0].arn

  container_definitions = jsonencode([
    {
      name  = "hybrid-rag-qdrant"
      image = var.docker_image != "" ? var.docker_image : "${aws_ecr_repository.main[0].repository_url}:latest"
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = tostring(var.container_port)
        },
        {
          name  = "QDRANT_URL"
          value = var.qdrant_url
        }
      ]

      secrets = [
        {
          name      = "OPENAI_API_KEY"
          valueFrom = "${aws_secretsmanager_secret.api_keys[0].arn}:OPENAI_API_KEY::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs[0].name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# ECS Service
resource "aws_ecs_service" "main" {
  count           = var.vpc_cidr != "" ? 1 : 0
  name            = var.service_name
  cluster         = aws_ecs_cluster.main[0].id
  task_definition = aws_ecs_task_definition.main[0].arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  load_balancer {
    target_group_arn = aws_lb_target_group.main[0].arn
    container_name   = "hybrid-rag-qdrant"
    container_port   = var.container_port
  }

  network_configuration {
    subnets         = module.vpc[0].private_subnets
    security_groups = [aws_security_group.ecs_tasks[0].id]
  }

  # Deployment configuration
  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 50

  # Enable execute command for debugging
  enable_execute_command = true

  lifecycle {
    ignore_changes = [
      desired_count,
      task_definition
    ]
  }
}

# Auto-scaling for ECS Service
resource "aws_appautoscaling_target" "ecs" {
  count              = var.vpc_cidr != "" ? 1 : 0
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main[0].name}/${aws_ecs_service.main[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_cpu" {
  count              = var.vpc_cidr != "" ? 1 : 0
  name               = "${var.ecs_cluster_name}-cpu-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = "service/${aws_ecs_cluster.main[0].name}/${aws_ecs_service.main[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

resource "aws_appautoscaling_policy" "ecs_memory" {
  count              = var.vpc_cidr != "" ? 1 : 0
  name               = "${var.ecs_cluster_name}-memory-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = "service/${aws_ecs_cluster.main[0].name}/${aws_ecs_service.main[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
