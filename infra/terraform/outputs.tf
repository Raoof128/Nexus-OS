output "supabase_project_ref" {
  description = "Supabase project reference."
  value       = supabase_project.nexus.id
}

output "vercel_project_id" {
  description = "Vercel project ID."
  value       = vercel_project.frontend.id
}
