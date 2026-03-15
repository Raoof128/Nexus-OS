variable "supabase_access_token" {
  description = "Supabase provider access token."
  type        = string
  sensitive   = true
}

variable "supabase_organization_id" {
  description = "Supabase organization ID."
  type        = string
}

variable "supabase_project_name" {
  description = "Supabase project name."
  type        = string
  default     = "nexus-archive"
}

variable "supabase_region" {
  description = "Supabase project region."
  type        = string
  default     = "ap-southeast-2"
}

variable "supabase_database_password" {
  description = "Supabase database password."
  type        = string
  sensitive   = true
}

variable "vercel_project_name" {
  description = "Vercel project name."
  type        = string
  default     = "nexus-archive"
}

variable "frontend_origin" {
  description = "Public frontend origin used for auth redirects."
  type        = string
}

variable "backend_api_url" {
  description = "Backend API base URL exposed to the frontend."
  type        = string
}

variable "frontend_sentry_dsn" {
  description = "Optional frontend Sentry DSN."
  type        = string
  default     = ""
}

variable "backend_sentry_dsn" {
  description = "Optional backend Sentry DSN."
  type        = string
  default     = ""
}
