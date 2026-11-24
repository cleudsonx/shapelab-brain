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

## 6. Blindagem Anti-IDOR no Backend (Prevenção do Ponto Cego do `service_role`)
Quando o backend FastAPI/Node utiliza a chave `service_role` (`SUPABASE_SECRET_KEY`), o PostgreSQL **ignora completamente o RLS** (`BYPASSRLS`).
Portanto:
1. **Filtro Explícito em Toda Mutação:** Toda query de `update` ou `delete` DEVE conter `.eq("tenant_id", caller_id)` ou `.eq("owner_id", caller_id)`, mesmo que a rota já tenha validado permissão.
2. **Guardas Server-Side Fail-Closed:**
   - Se o registro não existir ou não tiver vínculo comprovado em ambiente de produção, negue com `HTTP 403 Forbidden` por padrão (Fail-Closed).
   - Bloqueie sentinelas de desenvolvimento (`"current-trainer"`, `"dev-user-*"`) estritamente quando `ENVIRONMENT == "production"`.
3. **Prevenção de Sequestro de Vínculo (Cross-Tenant Hijacking):**
   - Em cadastros rápidos ou checkouts públicos, se o cliente/aluno já possuir uma conta com `tenant_id` diferente, **NUNCA sobrescreva** silenciosamente o vínculo principal no profile.
4. **Gotcha de Concorrência Multi-Worker:**
   - Locks locais em memória (`asyncio.Lock`) protegem apenas a instância atual. Em arquiteturas com réplicas concorrentes (Cloud Run / Kubernetes), a atomicidade DEVE residir em locks pessimistas no banco (`SELECT ... FOR UPDATE` / CAS) ou Durable Leases distribuídos.

