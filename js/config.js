// Configurações gerais do app.
// A chave "anon" do Supabase é pública por natureza (fica no navegador de quem usa o site).
// Quem protege os dados são as políticas RLS configuradas no banco.

export const SUPABASE_URL = "https://fuuwchrbxqusnkmxfmym.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1dXdjaHJieHF1c25rbXhmbXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NDczMDksImV4cCI6MjA4ODIyMzMwOX0.yG051YvVk1SMq05TsfmmiGKNO_ou4pPhp1FCSStPp3w";

export const APP_NOME = "Challenger Presença";
export const ESCOLA_NOME = "Challenger Language School";
export const APP_VERSAO = "2.0.0";

// Frequência abaixo deste percentual aparece destacada nos relatórios.
export const FREQUENCIA_MINIMA = 75;
