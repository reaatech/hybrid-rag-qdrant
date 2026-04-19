# Application Load Balancer
resource "aws_lb" "main" {
  count              = var.vpc_cidr != "" ? 1 : 0
  name               = "${var.ecs_cluster_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb[0].id]
  subnets            = module.vpc[0].public_subnets

  enable_deletion_protection = false
  drop_invalid_header_fields = true
  enable_http2               = true

  tags = {
    Name = "${var.ecs_cluster_name}-alb"
  }
}

# ALB Target Group
resource "aws_lb_target_group" "main" {
  count      = var.vpc_cidr != "" ? 1 : 0
  name       = "${var.ecs_cluster_name}-tg"
  port       = var.container_port
  protocol   = "HTTP"
  vpc_id     = module.vpc[0].vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-299,301-302"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = false
  }

  tags = {
    Name = "${var.ecs_cluster_name}-tg"
  }
}

# ALB Listener (HTTP)
resource "aws_lb_listener" "http" {
  count             = var.vpc_cidr != "" ? 1 : 0
  load_balancer_arn = aws_lb.main[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ALB Listener (HTTPS) - requires ACM certificate
resource "aws_lb_listener" "https" {
  count             = var.acm_certificate_arn != "" ? 1 : 0
  load_balancer_arn = aws_lb.main[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main[0].arn
  }
}
