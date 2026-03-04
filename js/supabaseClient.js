import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Preencha essas constantes com os valores do seu projeto Supabase
const SUPABASE_URL = "https://fuuwchrbxqusnkmxfmym.supabase.co"; // sem a barra final, de preferência
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1dXdjaHJieHF1c25rbXhmbXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NDczMDksImV4cCI6MjA4ODIyMzMwOX0.yG051YvVk1SMq05TsfmmiGKNO_ou4pPhp1FCSStPp3w";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);