-- ============================================================
-- SafetyVerse Auth Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. User Profiles table (linked to auth.users)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
  department TEXT DEFAULT 'Unassigned',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 2. Helper function: get calling user's role (used in RLS policies)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Trigger: auto-create profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, email, role, department)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    COALESCE(NEW.raw_user_meta_data->>'department', 'Unassigned')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. RLS Policies for user_profiles
-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
  ON public.user_profiles FOR SELECT
  USING (public.get_user_role() = 'admin');

-- Admins can update any profile (role changes, etc.)
CREATE POLICY "Admins can update any profile"
  ON public.user_profiles FOR UPDATE
  USING (public.get_user_role() = 'admin');

-- Users can update their own profile (but not their role)
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.user_profiles WHERE id = auth.uid())
  );

-- Admins can delete profiles
CREATE POLICY "Admins can delete profiles"
  ON public.user_profiles FOR DELETE
  USING (public.get_user_role() = 'admin');
