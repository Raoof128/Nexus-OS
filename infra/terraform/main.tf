provider "supabase" {
  access_token = var.supabase_access_token
}

resource "supabase_project" "nexus" {
  organization_id   = var.supabase_organization_id
  name              = var.supabase_project_name
  region            = var.supabase_region
  database_password = var.supabase_database_password
}

resource "supabase_settings" "nexus" {
  project_ref = supabase_project.nexus.id

  api = jsonencode({
    db_schema            = "public"
    max_rows             = 1000
    exposed_schemas      = ["public"]
    extra_search_path    = ["public", "extensions"]
    enable_update_delete = false
  })

  auth = jsonencode({
    site_url                 = var.frontend_origin
    additional_redirect_urls = [var.frontend_origin]
    jwt_expiry               = 900
  })
}

resource "vercel_project" "frontend" {
  name      = var.vercel_project_name
  framework = "vite"
}

resource "vercel_project_environment_variable" "frontend_api_url" {
  project_id = vercel_project.frontend.id
  key        = "VITE_API_URL"
  value      = var.backend_api_url
  target     = ["production", "preview"]
  type       = "encrypted"
}

resource "vercel_project_environment_variable" "frontend_sentry_dsn" {
  count      = var.frontend_sentry_dsn == "" ? 0 : 1
  project_id = vercel_project.frontend.id
  key        = "VITE_SENTRY_DSN"
  value      = var.frontend_sentry_dsn
  target     = ["production", "preview"]
  type       = "encrypted"
}
