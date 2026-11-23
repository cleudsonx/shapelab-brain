---
id: skill-backend-supabase-rls
version: 1.1.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia
compatible_subagent: shapelab-security-fintech
stack: [supabase, postgresql, rls, sql, fastapi, flutter]
---

# Skill: Blindagem Multi-Tenant com Supabase RLS (B2B2C)

## 1. Objetivo
Garantir isolamento estrito de dados em bancos multi-tenant (Profissional/Estúdio/Operador -> Cliente/Aluno) usando Row Level Security (RLS) no PostgreSQL e no Supabase Storage (LGPD).

## 2. Contrato de Entrada e Dependências
- **Chaves:** `SUPABASE_ANON_KEY` (Flutter/Web, sujeita a RLS) e `SUPABASE_SERVICE_ROLE_KEY` (restrita exclusivamente ao backend FastAPI).
- **Schema:** Tabelas com `tenant_id UUID NOT NULL`, `client_id UUID` e tabela `tenant_members (tenant_id, user_id, role)`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Performance (*initPlan*):** Envolva sempre em `(select auth.uid())` para que o PostgreSQL faça cache do UID por query em vez de reavaliar linha a linha.
- **Recursão Infinita:** Use função `SECURITY DEFINER` com `SET search_path = public` para consultar `tenant_members`.
- **Índices Obrigatórios:** Crie índices em `tenant_id` e `client_id` em todas as tabelas protegidas por RLS.
- **Storage LGPD:** Fotos corporais, anamneses e documentos fiscais devem ficar em buckets privados (`public = false`) com RLS em `storage.objects` validando `{tenant_id}/{client_id}/{filename}`.

## 4. Implementação Agnóstica (Boilerplate SQL)
```sql
-- 1. Função auxiliar anti-recursão
CREATE OR REPLACE FUNCTION public.get_my_staff_tenants()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT tenant_id FROM public.tenant_members
  WHERE user_id = (select auth.uid()) AND role IN ('owner', 'staff');
$$;

-- 2. Índices + RLS em tabela multi-tenant (ex: records)
CREATE INDEX IF NOT EXISTS idx_records_tenant_id ON public.records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_records_client_id ON public.records (client_id);
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_tenant_records" ON public.records FOR ALL TO authenticated
USING (tenant_id IN (SELECT public.get_my_staff_tenants()))
WITH CHECK (tenant_id IN (SELECT public.get_my_staff_tenants()));

CREATE POLICY "client_select_own_records" ON public.records FOR SELECT TO authenticated
USING (client_id = (select auth.uid()));

-- 3. Blindagem de Storage Privado ({tenant_id}/{client_id}/{filename})
CREATE POLICY "tenant_and_client_read_private_media" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'private-media' AND (
    (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_staff_tenants())
    OR (storage.foldername(name))[2]::uuid = (select auth.uid())
  )
);
```

## 5. Critério de Aceite
1. Tenant A tentando ler/alterar dados do Tenant B -> `[]` / `0 rows affected`.
2. Cliente 1 tentando ler dados ou mídia do Cliente 2 no mesmo tenant -> `[]`.
3. Supabase Security Advisor retorna zero tabelas de negócio com `rowsecurity = false`.
