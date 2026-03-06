-- delete-user-migration.sql
-- Run this in Supabase Dashboard → SQL Editor
-- Creates a secure function that allows admins to fully delete a user account

CREATE OR REPLACE FUNCTION public.delete_user_account(target_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role TEXT;
    caller_email TEXT;
    target_auth_id UUID;
BEGIN
    -- Verify the caller is an admin
    SELECT role, email INTO caller_role, caller_email
    FROM public.user_profiles
    WHERE id = auth.uid();

    IF caller_role IS NULL OR caller_role != 'admin' THEN
        RAISE EXCEPTION 'Only admins can delete user accounts';
    END IF;

    -- Prevent self-deletion
    IF lower(caller_email) = lower(target_email) THEN
        RAISE EXCEPTION 'You cannot delete your own account';
    END IF;

    -- Find the auth user by email
    SELECT id INTO target_auth_id
    FROM auth.users
    WHERE lower(auth.users.email) = lower(target_email);

    -- Delete from auth.users (cascades to user_profiles via FK)
    IF target_auth_id IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = target_auth_id;
    END IF;

    -- Delete from employees table
    DELETE FROM public.employees WHERE lower(employees.email) = lower(target_email);
END;
$$;

-- Allow authenticated users to call this function (admin check is inside)
GRANT EXECUTE ON FUNCTION public.delete_user_account(TEXT) TO authenticated;
