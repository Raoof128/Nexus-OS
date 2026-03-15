# Terraform Scaffold

This directory contains the reviewed infrastructure starting point for Nexus Archive.

Managed concerns:

- Supabase project bootstrap
- Supabase API and auth settings
- Vercel project creation
- Vercel environment variables for frontend runtime configuration

## Usage

```bash
cd infra/terraform
terraform init
terraform fmt
terraform plan \
  -var="supabase_access_token=..." \
  -var="supabase_organization_id=..." \
  -var="supabase_database_password=..." \
  -var="frontend_api_url=https://api.nexus.example"
```

Review provider credentials and resource arguments against your live account conventions before `terraform apply`.
