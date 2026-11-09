import { supabase } from "./supabaseClient.js";

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signUp({ nome, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { nome: nome.trim() }, emailRedirectTo: appUrl() },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  try {
    await supabase.auth.signOut();
  } catch {
    // Mesmo sem internet, limpa a sessão local.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
}

export async function enviarLinkRedefinicao(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
  if (error) throw error;
}

export async function definirNovaSenha(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** callback(event, session) */
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // Não chamar o Supabase dentro deste callback (pode travar); adia para o próximo ciclo.
    setTimeout(() => callback(event, session), 0);
  });
  return () => data.subscription.unsubscribe();
}

/** URL base do app (funciona no GitHub Pages em subpasta). */
export function appUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, "");
}
