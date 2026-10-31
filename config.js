// Supabase 프로젝트 설정값을 붙여 넣으세요.
const supabaseUrl = "https://ejkzyvbhypbeljzkipak.supabase.co";
const supabasePublishableKey = "sb_publishable_qWykKmOmguTV1aRS76RDkQ_Nw0zC2OE";

// 브라우저에서 사용할 Supabase 클라이언트입니다.
const sb = supabase.createClient(supabaseUrl, supabasePublishableKey);
