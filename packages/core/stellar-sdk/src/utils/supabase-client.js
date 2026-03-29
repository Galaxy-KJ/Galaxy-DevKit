"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseClient = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseURL = process.env.SUPABASE_URL;
const supabaseANON = process.env.SUPABASE_ANON_KEY;
if (!supabaseURL || !supabaseANON) {
    throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
}
exports.supabaseClient = (0, supabase_js_1.createClient)(supabaseURL, supabaseANON);
//# sourceMappingURL=supabase-client.js.map