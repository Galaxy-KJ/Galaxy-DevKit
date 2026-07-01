-- Galaxy DevKit - Team Accounts & Workspace organization framework (Issue #313, Roadmap #61)
-- Tables:
--   * organizations:            personal or team workspaces
--   * organization_members:     who belongs to which org, and with what role
--   * organization_activity:    audit trail of invite / role-change / removal events

CREATE TYPE organization_type AS ENUM ('personal', 'team');
CREATE TYPE organization_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TABLE public.organizations (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug        TEXT NOT NULL,
  type        organization_type NOT NULL DEFAULT 'team',
  created_by  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- A user can only have one personal workspace.
CREATE UNIQUE INDEX idx_organizations_one_personal_per_user
  ON public.organizations (created_by)
  WHERE type = 'personal';

CREATE UNIQUE INDEX idx_organizations_slug_lower
  ON public.organizations (lower(slug));

CREATE INDEX idx_organizations_created_by ON public.organizations (created_by);

CREATE TABLE public.organization_members (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role             organization_role NOT NULL DEFAULT 'member',
  invited_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  joined_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_members_unique_membership UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_organization_members_org_id  ON public.organization_members (organization_id);
CREATE INDEX idx_organization_members_user_id ON public.organization_members (user_id);
-- Fast lookup for "the owners of org X" (used when demoting the last owner is forbidden).
CREATE INDEX idx_organization_members_owners
  ON public.organization_members (organization_id)
  WHERE role = 'owner';

CREATE TABLE public.organization_activity (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action           TEXT NOT NULL,
  target_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organization_activity_org_id
  ON public.organization_activity (organization_id, created_at DESC);

-- updated_at triggers (reuses function declared in 20241201000001_initial_schema.sql)
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
-- The REST API uses the service-role key which bypasses RLS; policies here are a
-- second line of defense for anon/authed keys and for any future direct Supabase
-- access from the frontend.
ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_activity ENABLE ROW LEVEL SECURITY;

-- A user can see an organization only if they are a member of it.
CREATE POLICY "Members can view their organizations" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = auth.uid()
    )
  );

-- Any authenticated user can create an organization; server sets created_by.
CREATE POLICY "Users can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Only owners can update or delete the organization.
CREATE POLICY "Owners can update their organization" ON public.organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

CREATE POLICY "Owners can delete their organization" ON public.organizations
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = organizations.id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  );

-- Members can see the roster of their own organizations, and their own row anywhere.
CREATE POLICY "Members can view org membership" ON public.organization_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members self
      WHERE self.organization_id = organization_members.organization_id
        AND self.user_id = auth.uid()
    )
  );

-- Activity log follows the same visibility rule as the members list.
CREATE POLICY "Members can view org activity" ON public.organization_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.organization_id = organization_activity.organization_id
        AND m.user_id = auth.uid()
    )
  );
