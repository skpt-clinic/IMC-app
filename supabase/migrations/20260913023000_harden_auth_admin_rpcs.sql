-- Security hardening for Supabase Auth/Admin RPCs.
-- Applied to project jvfivixnmcwsruaktirr.

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_admins text; v_email text; v_username text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id=auth.uid();
  SELECT lower(trim("Username")) INTO v_username FROM public."Users"
    WHERE auth_user_id=auth.uid() OR lower("Email")=COALESCE(v_email,'') LIMIT 1;
  SELECT "Value" INTO v_admins FROM public."Settings" WHERE "Settings"='AdminUsers' LIMIT 1;
  IF v_admins IS NULL OR trim(v_admins)='' THEN RETURN COALESCE(v_username,'')='nat-admin'; END IF;
  RETURN EXISTS (SELECT 1 FROM unnest(string_to_array(lower(replace(v_admins,' ','')),',')) x(value)
    WHERE value=COALESCE(v_username,'') OR value=COALESCE(v_email,''));
END; $$;

REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_admin_list_users() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_reset_password(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_toggle_role(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_update_user(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_reset_password(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_toggle_role(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_user(text,text,text,text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_change_own_password(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_change_own_password(text,text,text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_register_user(text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_request_password_reset(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_submit_new_password(text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_transitional_login(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_register_user(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_request_password_reset(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_new_password(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_transitional_login(text,text) TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public."Settings" FROM anon, authenticated;
GRANT SELECT ON TABLE public."Settings" TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_reset_password(p_username text,p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,auth AS $$
DECLARE v_salt text; v_hash text; v_auth_user_id uuid;
BEGIN
  IF NOT public.is_current_user_admin() THEN RETURN jsonb_build_object('status','error','message','ไม่มีสิทธิ์สำหรับผู้ดูแลระบบ'); END IF;
  IF length(p_new_password)<6 THEN RETURN jsonb_build_object('status','error','message','Password too short'); END IF;
  SELECT auth_user_id INTO v_auth_user_id FROM public."Users" WHERE lower("Username")=lower(trim(p_username)) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','error','message','User not found'); END IF;
  v_salt:=gen_random_uuid()::text;
  v_hash:=encode(digest(p_new_password||v_salt,'sha256'),'base64');
  UPDATE public."Users" SET "PasswordHash"=v_hash,"Salt"=v_salt,"IsVerified"=true WHERE lower("Username")=lower(trim(p_username));
  IF v_auth_user_id IS NOT NULL THEN UPDATE auth.users SET encrypted_password=crypt(p_new_password,gen_salt('bf',10)),updated_at=now() WHERE id=v_auth_user_id; END IF;
  RETURN jsonb_build_object('status','success','message','Reset OK');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','error','message',SQLERRM);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_user(p_username text,p_fullname text,p_email text,p_license text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN RETURN jsonb_build_object('status','error','message','ไม่มีสิทธิ์สำหรับผู้ดูแลระบบ'); END IF;
  UPDATE public."Users" SET "FullName"=trim(p_fullname),"Email"=trim(lower(p_email)),"License"=trim(p_license) WHERE lower("Username")=lower(trim(p_username));
  IF NOT FOUND THEN RETURN jsonb_build_object('status','error','message','ไม่พบผู้ใช้งานนี้ในระบบ'); END IF;
  RETURN jsonb_build_object('status','success','message','อัปเดตข้อมูลผู้ใช้งานเรียบร้อยแล้ว');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','error','message',SQLERRM);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_toggle_role(p_username text,p_new_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_admins text; v_admin_list text[]; v_new_list text[]; v_clean_user text:=lower(trim(p_username)); u_item text;
BEGIN
  IF NOT public.is_current_user_admin() THEN RETURN jsonb_build_object('status','error','message','ไม่มีสิทธิ์สำหรับผู้ดูแลระบบ'); END IF;
  IF lower(trim(p_new_role)) NOT IN ('admin','user') THEN RETURN jsonb_build_object('status','error','message','บทบาทไม่ถูกต้อง'); END IF;
  SELECT "Value" INTO v_admins FROM public."Settings" WHERE "Settings"='AdminUsers' LIMIT 1;
  v_admin_list:=CASE WHEN v_admins IS NULL OR trim(v_admins)='' THEN ARRAY['nat-admin'] ELSE string_to_array(replace(v_admins,' ',''),',') END;
  v_new_list:=ARRAY[]::text[];
  IF lower(trim(p_new_role))='admin' THEN
    v_new_list:=v_admin_list;
    IF NOT EXISTS(SELECT 1 FROM unnest(v_admin_list)x(value) WHERE lower(trim(value))=v_clean_user) THEN v_new_list:=array_append(v_new_list,trim(p_username)); END IF;
  ELSE
    FOREACH u_item IN ARRAY v_admin_list LOOP IF lower(trim(u_item))<>v_clean_user THEN v_new_list:=array_append(v_new_list,trim(u_item)); END IF; END LOOP;
  END IF;
  INSERT INTO public."Settings"("Settings","Value") VALUES('AdminUsers',array_to_string(v_new_list,',')) ON CONFLICT("Settings") DO UPDATE SET "Value"=EXCLUDED."Value";
  RETURN jsonb_build_object('status','success','message','ปรับสิทธิ์ '||p_username||' เป็น '||p_new_role||' เรียบร้อยแล้ว','admins',array_to_string(v_new_list,','));
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','error','message',SQLERRM);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_list_users()
RETURNS TABLE("UserID" text,"Username" text,"FullName" text,"Email" text,"License" text,"CreatedAt" timestamptz,"Role" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_admins text; v_admin_list text[];
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'permission denied: admin role required' USING ERRCODE='42501'; END IF;
  SELECT "Value" INTO v_admins FROM public."Settings" WHERE "Settings"='AdminUsers' LIMIT 1;
  v_admin_list:=CASE WHEN v_admins IS NULL OR trim(v_admins)='' THEN ARRAY['nat-admin'] ELSE string_to_array(lower(replace(v_admins,' ','')),',') END;
  RETURN QUERY SELECT u."UserID"::text,u."Username",u."FullName",u."Email",COALESCE(u."License",''),u."CreatedAt",
    CASE WHEN lower(u."Username")=ANY(v_admin_list) OR lower(COALESCE(u."Email",''))=ANY(v_admin_list) THEN 'admin' ELSE 'user' END
  FROM public."Users" u ORDER BY u."CreatedAt" DESC NULLS LAST;
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_change_own_password(p_username text,p_old_password text,p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_stored_hash text; v_old_hash text; v_new_hash text; v_uid uuid; v_salt text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('status','error','message','กรุณาเข้าสู่ระบบก่อน'); END IF;
  SELECT auth_user_id,"PasswordHash","Salt" INTO v_uid,v_stored_hash,v_salt FROM public."Users" WHERE lower("Username")=lower(trim(p_username)) LIMIT 1;
  IF v_uid IS NULL OR v_uid<>auth.uid() THEN RETURN jsonb_build_object('status','error','message','ไม่มีสิทธิ์เปลี่ยนรหัสผ่านของผู้ใช้อื่น'); END IF;
  IF length(p_new_password)<6 THEN RETURN jsonb_build_object('status','error','message','Password too short'); END IF;
  v_old_hash:=encode(digest(p_old_password||COALESCE(v_salt,''),'sha256'),'base64');
  IF lower(COALESCE(v_stored_hash,''))<>lower(v_old_hash) THEN RETURN jsonb_build_object('status','error','message','รหัสผ่านปัจจุบันไม่ถูกต้อง'); END IF;
  v_new_hash:=encode(digest(p_new_password||COALESCE(v_salt,''),'sha256'),'base64');
  UPDATE public."Users" SET "PasswordHash"=v_new_hash WHERE lower("Username")=lower(trim(p_username));
  UPDATE auth.users SET encrypted_password=crypt(p_new_password,gen_salt('bf',10)),updated_at=now() WHERE id=auth.uid();
  RETURN jsonb_build_object('status','success','message','Password changed');
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','error','message',SQLERRM);
END; $$;
